# Firebase to Supabase Functions Migration Tool

This tool automatically converts Google Cloud Functions (Firebase Functions) to Supabase Edge Functions.

## Features

- ✅ **Automatic Code Conversion**: Converts Firebase Function syntax to Supabase Edge Function format
- ✅ **Multiple Trigger Types**: Supports HTTPS, Firestore, Auth, Storage, Pub/Sub, and Scheduler triggers
- ✅ **Smart API Translation**: Converts Firebase Admin SDK calls to Supabase client equivalents
- ✅ **Migration Reports**: Generates detailed reports with next steps and warnings
- ✅ **Webhook Setup**: Provides SQL templates for database and auth webhooks
- ✅ **Scheduler Integration**: Includes pg_cron setup for scheduled functions

## Supported Function Types

| Firebase Function Type | Supabase Equivalent | Status |
|------------------------|---------------------|---------|
| `functions.https.onRequest` | Edge Function with HTTP trigger | ✅ Supported |
| `functions.https.onCall` | Edge Function with callable interface | ✅ Supported |
| `functions.firestore.document().onCreate/onUpdate/onDelete` | Database webhook + Edge Function | ✅ Supported |
| `functions.auth.user().onCreate/onDelete` | Auth webhook + Edge Function | ✅ Supported |
| `functions.storage.object().onFinalize/onDelete` | Storage webhook + Edge Function | ✅ Supported |
| `functions.pubsub.topic().onRun` | Edge Function with cron trigger | ✅ Supported |
| `functions.pubsub.schedule()` | Edge Function with pg_cron | ✅ Supported |

## Installation & Usage

### Prerequisites

1. Node.js installed
2. Supabase CLI installed and configured
3. Firebase project (optional, for pulling from deployed functions)

### Basic Usage

```bash
# Migrate from local source directory
node migrate-functions.js --source ./path/to/firebase/functions --output ./supabase/functions

# Migrate from deployed Firebase project
node migrate-functions.js --firebase-project my-firebase-project --output ./supabase/functions

# Verbose output
node migrate-functions.js --source ./functions --output ./supabase/functions --verbose
```

### Example Migration

Let's say you have a Firebase function like this:

```javascript
// Firebase Function (functions/index.js)
const functions = require('firebase-functions');
const admin = require('firebase-admin');

exports.createUser = functions.https.onRequest(async (req, res) => {
  const { email, name } = req.body;
  
  try {
    const userRecord = await admin.auth().createUser({
      email: email,
      displayName: name
    });
    
    await admin.firestore()
      .collection('users')
      .doc(userRecord.uid)
      .set({
        email: email,
        name: name,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    
    res.json({ success: true, uid: userRecord.uid });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

**After migration**, you'll get:

```typescript
// Supabase Edge Function (supabase/functions/createUser/index.ts)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { email, name } = await req.json();
    
    // Create user in Supabase Auth
    const { data: userRecord, error: authError } = await supabaseClient.auth.admin.createUser({
      email: email,
      user_metadata: { name: name }
    });
    
    if (authError) throw authError;
    
    // Insert user data into database
    const { error: dbError } = await supabaseClient
      .from('users')
      .insert({
        id: userRecord.user.id,
        email: email,
        name: name,
        created_at: new Date().toISOString()
      });
    
    if (dbError) throw dbError;

    return new Response(
      JSON.stringify({ success: true, uid: userRecord.user.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
```

## Migration Process

### 1. Run the Migration Tool

```bash
node migrate-functions.js --source ./functions --output ./supabase/functions
```

### 2. Review Generated Functions

The tool creates:
- `supabase/functions/[function-name]/index.ts` - The main function code
- `supabase/functions/[function-name]/deno.json` - Deno configuration
- `supabase/functions/MIGRATION_REPORT.md` - Detailed migration report

### 3. Configure Environment Variables

Add to your `.env` file:

```bash
# Required for all functions
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# For webhook functions (Firestore/Auth triggers)
SUPABASE_WEBHOOK_SECRET=your-secure-random-string

# For scheduled functions
CRON_SECRET=your-cron-secret

# Third-party services (as needed)
STRIPE_SECRET_KEY=sk_test_...
SENDGRID_API_KEY=SG....
OPENAI_API_KEY=sk-...
```

### 4. Set Up Database Webhooks (for Firestore triggers)

For each Firestore trigger function, run the generated SQL in your Supabase SQL Editor:

```sql
-- Example for a user creation trigger
CREATE OR REPLACE FUNCTION trigger_onUserCreate_webhook()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://your-project.supabase.co/functions/v1/onUserCreate',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer " || current_setting("app.webhook_secret")}',
    body := json_build_object(
      'type', TG_OP,
      'table', TG_TABLE_NAME,
      'record', row_to_json(NEW),
      'old_record', row_to_json(OLD)
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_user_create
  AFTER INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION trigger_onUserCreate_webhook();
```

### 5. Set Up Scheduled Functions (pg_cron)

For scheduled functions, set up pg_cron:

```sql
-- Enable pg_cron (run once)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule your function
SELECT cron.schedule(
  'daily-cleanup',
  '0 2 * * *', -- Every day at 2 AM
  $$
  SELECT net.http_post(
    url := 'https://your-project.supabase.co/functions/v1/dailyCleanup',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_CRON_SECRET"}'
  );
  $$
);
```

### 6. Test Functions Locally

```bash
# Start Supabase local development
supabase start

# Test a function
curl -X POST 'http://localhost:54321/functions/v1/createUser' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' \
  -H 'Content-Type: application/json' \
  -d '{"email": "test@example.com", "name": "Test User"}'
```

### 7. Deploy to Production

```bash
# Deploy all functions
supabase functions deploy

# Deploy specific function
supabase functions deploy createUser
```

## Manual Review Checklist

After migration, review each function for:

- [ ] **API Conversions**: Check that Firebase Admin SDK calls are properly converted to Supabase equivalents
- [ ] **Authentication**: Verify JWT verification and user context handling
- [ ] **Error Handling**: Ensure proper error responses and logging
- [ ] **Environment Variables**: Confirm all secrets are properly configured
- [ ] **CORS Headers**: Add appropriate CORS configuration for web clients
- [ ] **Database Schema**: Ensure referenced tables and columns exist in Supabase
- [ ] **Webhook Security**: Verify webhook authentication for trigger functions
- [ ] **Performance**: Review for any performance optimizations needed

## Common Issues & Solutions

### Issue: "Function not found" error
**Solution**: Ensure the function is properly deployed and the name matches exactly

### Issue: CORS errors in browser
**Solution**: Add appropriate CORS headers to function responses

### Issue: Database connection errors
**Solution**: Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables

### Issue: Webhook not triggering
**Solution**: Verify webhook secret configuration and database trigger setup

### Issue: Scheduled function not running
**Solution**: Check pg_cron setup and cron secret configuration

## Advanced Configuration

### Custom API Mappings

You can extend the migration tool to handle custom Firebase extensions or specific API patterns by modifying the `convertFirebaseToSupabase()` method in `migrate-functions.js`.

### Batch Migration

For large projects with many functions, consider running migrations in batches:

```bash
# Migrate specific functions only
node migrate-functions.js --source ./functions --output ./supabase/functions --filter="user,payment,notification"
```

## Support & Troubleshooting

1. Check the generated `MIGRATION_REPORT.md` for warnings and errors
2. Review TODO comments in generated function code
3. Test functions locally before deploying to production
4. Refer to Supabase Edge Functions documentation for advanced features

---

**Next Steps**: After running the migration tool, follow the post-migration checklist in your `MIGRATION_REPORT.md` file.