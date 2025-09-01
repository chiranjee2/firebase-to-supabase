# Google Cloud Functions to Supabase Edge Functions Migration Guide

Complete guide for migrating your Google Cloud Platform (GCP) Cloud Functions to Supabase Edge Functions with practical examples and best practices.

---

## 📋 Table of Contents

1. [Platform Comparison](#platform-comparison)
2. [Prerequisites](#prerequisites)
3. [Migration Strategy](#migration-strategy)
4. [Function Types & Migration Patterns](#function-types--migration-patterns)
5. [Code Examples](#code-examples)
6. [Deployment Guide](#deployment-guide)
7. [Testing & Debugging](#testing--debugging)
8. [Best Practices](#best-practices)
9. [Troubleshooting](#troubleshooting)

---

## 🔄 Platform Comparison

### **Google Cloud Functions**
- **Runtime**: Node.js, Python, Go, Java, .NET
- **Triggers**: HTTP, Pub/Sub, Cloud Storage, Firestore, Firebase Auth
- **Scaling**: Automatic, pay-per-invocation
- **Integration**: Deep Google ecosystem integration
- **Database**: Firestore (NoSQL), Cloud SQL

### **Supabase Edge Functions**
- **Runtime**: Deno (TypeScript-first)
- **Triggers**: HTTP requests, webhooks, database triggers
- **Scaling**: Automatic, global edge distribution
- **Integration**: Native PostgreSQL integration
- **Database**: PostgreSQL with real-time subscriptions

### **Key Advantages of Supabase Edge Functions:**
- ✅ Global edge distribution (30+ data centers)
- ✅ TypeScript-first development
- ✅ Direct PostgreSQL integration
- ✅ No vendor lock-in (open source)
- ✅ Real-time subscriptions
- ✅ Generous free tier (500k invocations/month)

---

## 🛠 Prerequisites

### **Install Supabase CLI**
```bash
# macOS (Recommended)
brew install supabase/tap/supabase

# Windows
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

# Linux/Manual Installation
curl -L https://github.com/supabase/cli/releases/latest/download/supabase_linux_amd64.tar.gz | tar -xz
sudo mv supabase /usr/local/bin/

# Alternative: Use npx (no installation required)
npx supabase init
npx supabase functions new my-function

# Verify installation
supabase --version
```

**Note:** Global npm installation (`npm install -g supabase`) is no longer supported.

### **Project Setup**
```bash
# Initialize Supabase project
supabase init

# Login to Supabase
supabase login

# Link to your remote project
supabase link --project-ref YOUR_PROJECT_ID
```

### **Required Tools**
- Deno (automatically managed by Supabase CLI)
- Node.js (for migration scripts)
- Git (version control)

---

## 🎯 Migration Strategy

### **Phase 1: Assessment**
1. Inventory your existing Cloud Functions
2. Identify function types and triggers
3. Assess dependencies and external integrations
4. Plan migration order (start with simple HTTP functions)

### **Phase 2: Environment Setup**
1. Set up Supabase project and CLI
2. Configure local development environment
3. Set up CI/CD pipeline
4. Migrate environment variables and secrets

### **Phase 3: Function Migration**
1. Migrate functions one by one
2. Update database queries from Firestore to PostgreSQL
3. Test each function locally
4. Deploy and test in staging environment

### **Phase 4: Cutover**
1. Update client applications to use new endpoints
2. Monitor performance and errors
3. Gradually sunset old Cloud Functions
4. Update documentation and team processes

---

## 📝 Function Types & Migration Patterns

### **1. HTTP Triggered Functions**

**Google Cloud Functions:**
```javascript
// index.js
const functions = require('firebase-functions');

exports.helloWorld = functions.https.onRequest((request, response) => {
  response.json({message: "Hello from Firebase!"});
});
```

**Supabase Edge Function:**
```typescript
// supabase/functions/hello-world/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req) => {
  return new Response(
    JSON.stringify({message: "Hello from Supabase Edge Functions!"}),
    { 
      headers: { "Content-Type": "application/json" },
      status: 200 
    }
  )
})
```

### **2. Database Triggered Functions**

**Google Cloud Functions (Firestore):**
```javascript
const functions = require('firebase-functions');
const admin = require('firebase-admin');

exports.onUserCreate = functions.firestore
  .document('users/{userId}')
  .onCreate((snap, context) => {
    const userData = snap.data();
    // Send welcome email
    return sendWelcomeEmail(userData.email);
  });
```

**Supabase Edge Function + Database Webhook:**
```typescript
// supabase/functions/on-user-create/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!
const supabase = createClient(supabaseUrl, supabaseKey)

serve(async (req) => {
  const { record } = await req.json()
  
  if (req.method === 'POST') {
    // User was created, send welcome email
    await sendWelcomeEmail(record.email)
    
    return new Response('OK', { status: 200 })
  }
  
  return new Response('Method not allowed', { status: 405 })
})

async function sendWelcomeEmail(email: string) {
  // Email sending logic
}
```

**Set up Database Webhook in Supabase:**
```sql
-- Create webhook trigger in Supabase Dashboard or SQL Editor
CREATE OR REPLACE FUNCTION trigger_user_webhook()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://YOUR_PROJECT.supabase.co/functions/v1/on-user-create',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}',
    body := json_build_object('record', row_to_json(NEW), 'type', TG_OP, 'table', TG_TABLE_NAME)::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_user_created
  AFTER INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION trigger_user_webhook();
```

### **3. Authentication Triggered Functions**

**Google Cloud Functions:**
```javascript
exports.onUserCreate = functions.auth.user().onCreate((user) => {
  return admin.firestore().collection('users').doc(user.uid).set({
    email: user.email,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
});
```

**Supabase Edge Function:**
```typescript
// supabase/functions/auth-user-create/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const authHeader = req.headers.get('Authorization')!
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )

  const { record } = await req.json()

  // Insert user profile when auth user is created
  const { error } = await supabaseClient
    .from('profiles')
    .insert({
      id: record.id,
      email: record.email,
      created_at: new Date().toISOString()
    })

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  return new Response('OK', { status: 200 })
})
```

### **4. Scheduled Functions (Cron Jobs)**

**Google Cloud Functions:**
```javascript
const functions = require('firebase-functions');

exports.dailyCleanup = functions.pubsub
  .schedule('0 2 * * *') // Daily at 2 AM
  .onRun(async (context) => {
    // Cleanup logic
    await cleanupExpiredSessions();
  });
```

**Supabase Edge Function + pg_cron:**
```typescript
// supabase/functions/daily-cleanup/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  // Verify cron secret for security
  const cronSecret = req.headers.get('authorization')
  if (cronSecret !== `Bearer ${Deno.env.get('CRON_SECRET')}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Cleanup expired sessions
  const { error } = await supabase
    .from('sessions')
    .delete()
    .lt('expires_at', new Date().toISOString())

  if (error) {
    return new Response(`Error: ${error.message}`, { status: 500 })
  }

  return new Response('Cleanup completed', { status: 200 })
})
```

**Set up pg_cron in Supabase:**
```sql
-- Enable pg_cron extension (run once)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule daily cleanup at 2 AM UTC
SELECT cron.schedule(
  'daily-cleanup',
  '0 2 * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT.supabase.co/functions/v1/daily-cleanup',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_CRON_SECRET"}'
  );
  $$
);
```

---

## 🚀 Deployment Guide

### **1. Local Development**

```bash
# Create new edge function
supabase functions new my-function

# Start local development server
supabase start

# Your function will be available at:
# http://localhost:54321/functions/v1/my-function

# Test locally
curl -X POST \
  http://localhost:54321/functions/v1/my-function \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"name": "test"}'
```

### **2. Environment Variables**

```bash
# Set secrets for edge functions
supabase secrets set MY_SECRET_KEY=your_secret_value
supabase secrets set STRIPE_WEBHOOK_SECRET=your_stripe_secret

# List all secrets
supabase secrets list
```

### **3. Production Deployment**

```bash
# Deploy all functions
supabase functions deploy

# Deploy specific function
supabase functions deploy my-function

# Deploy with no-verify-jwt flag (if needed)
supabase functions deploy my-function --no-verify-jwt

# Check deployment status
supabase functions list
```

### **4. CI/CD Pipeline (GitHub Actions)**

```yaml
# .github/workflows/deploy-functions.yml
name: Deploy Edge Functions

on:
  push:
    branches:
      - main
    paths:
      - 'supabase/functions/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      
      - name: Deploy functions
        run: supabase functions deploy --project-ref ${{ secrets.SUPABASE_PROJECT_ID }}
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
```

---

## 🧪 Testing & Debugging

### **Local Testing**

```typescript
// supabase/functions/my-function/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req) => {
  try {
    const { name } = await req.json()
    
    // Log for debugging (visible in local console)
    console.log('Function called with name:', name)
    
    return new Response(
      JSON.stringify({ message: `Hello ${name}!` }),
      { headers: { "Content-Type": "application/json" } }
    )
  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    )
  }
})
```

### **Production Monitoring**

```bash
# View function logs
supabase functions logs my-function

# View logs in real-time
supabase functions logs my-function --follow

# View logs for specific time range
supabase functions logs my-function --since 1h
```

### **Testing Webhooks Locally**

```bash
# Use ngrok to expose local functions to internet
ngrok http 54321

# Your webhook URL will be:
# https://abc123.ngrok.io/functions/v1/my-webhook
```

---

## 📚 Best Practices

### **1. Error Handling**
```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req) => {
  try {
    // Your function logic
    const result = await someOperation()
    
    return new Response(
      JSON.stringify({ success: true, data: result }),
      { headers: { "Content-Type": "application/json" } }
    )
  } catch (error) {
    console.error('Function error:', error)
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    )
  }
})
```

### **2. Authentication & Authorization**
```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const authHeader = req.headers.get('Authorization')
  
  if (!authHeader) {
    return new Response('Missing Authorization header', { status: 401 })
  }

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )

  // Get current user
  const { data: { user }, error } = await supabaseClient.auth.getUser()
  
  if (error || !user) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Function logic with authenticated user
  return new Response(`Hello ${user.email}!`)
})
```

### **3. Database Connections**
```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, // Use service role for admin operations
  )

  const { data, error } = await supabaseClient
    .from('users')
    .select('id, email, created_at')
    .limit(10)

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }

  return new Response(
    JSON.stringify(data),
    { headers: { "Content-Type": "application/json" } }
  )
})
```

### **4. CORS Configuration**
```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Your function logic
  const result = { message: "Hello World" }

  return new Response(
    JSON.stringify(result),
    { 
      headers: { 
        ...corsHeaders,
        'Content-Type': 'application/json'
      } 
    }
  )
})
```

---

## 🔧 Migration Examples

### **Complete Migration Example: User Registration**

**Original Google Cloud Function:**
```javascript
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const sgMail = require('@sendgrid/mail');

exports.registerUser = functions.https.onRequest(async (req, res) => {
  try {
    const { email, name } = req.body;
    
    // Create user in Firebase Auth
    const userRecord = await admin.auth().createUser({
      email,
      displayName: name
    });
    
    // Save to Firestore
    await admin.firestore().collection('users').doc(userRecord.uid).set({
      email,
      name,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Send welcome email
    await sgMail.send({
      to: email,
      from: 'noreply@example.com',
      subject: 'Welcome!',
      text: `Welcome ${name}!`
    });
    
    res.json({ success: true, userId: userRecord.uid });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

**Migrated Supabase Edge Function:**
```typescript
// supabase/functions/register-user/index.ts
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
    const { email, name } = await req.json()
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    
    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabaseClient.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { name }
    })
    
    if (authError) throw authError
    
    // Insert user profile
    const { error: profileError } = await supabaseClient
      .from('profiles')
      .insert({
        id: authData.user.id,
        email,
        name,
        created_at: new Date().toISOString()
      })
    
    if (profileError) throw profileError
    
    // Send welcome email
    await sendWelcomeEmail(email, name)
    
    return new Response(
      JSON.stringify({ success: true, userId: authData.user.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Registration error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})

async function sendWelcomeEmail(email: string, name: string) {
  const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY')!
  
  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SENDGRID_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      personalizations: [{
        to: [{ email }],
        subject: 'Welcome!'
      }],
      from: { email: 'noreply@example.com' },
      content: [{
        type: 'text/plain',
        value: `Welcome ${name}!`
      }]
    })
  })
  
  if (!response.ok) {
    throw new Error(`Email sending failed: ${response.statusText}`)
  }
}
```

---

## 🐛 Troubleshooting

### **Common Issues & Solutions**

#### **1. Import Errors**
```typescript
// ❌ Wrong - Node.js style imports don't work
import { functions } from 'firebase-functions'

// ✅ Correct - Use Deno imports
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
```

#### **2. Environment Variables**
```bash
# Check if secrets are set
supabase secrets list

# Set missing secrets
supabase secrets set API_KEY=your_key_here
```

#### **3. CORS Issues**
```typescript
// Always handle OPTIONS requests for CORS
if (req.method === 'OPTIONS') {
  return new Response('ok', { headers: corsHeaders })
}
```

#### **4. Database Connection Issues**
```typescript
// Use service role key for admin operations
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')! // Not SUPABASE_ANON_KEY
)
```

#### **5. Function Timeout**
```typescript
// Set appropriate timeout in function logic
const controller = new AbortController()
const timeoutId = setTimeout(() => controller.abort(), 25000) // 25 seconds

try {
  const result = await fetch(url, { 
    signal: controller.signal 
  })
  clearTimeout(timeoutId)
  return result
} catch (error) {
  if (error.name === 'AbortError') {
    throw new Error('Function timeout')
  }
  throw error
}
```

---

## 📊 Migration Checklist

### **Pre-Migration**
- [ ] Inventory all existing Cloud Functions
- [ ] Identify dependencies and integrations
- [ ] Set up Supabase project and CLI
- [ ] Plan migration order and timeline
- [ ] Prepare test data and scenarios

### **During Migration**
- [ ] Migrate functions one by one
- [ ] Update database queries from Firestore to PostgreSQL
- [ ] Test each function locally
- [ ] Deploy to staging environment
- [ ] Update client applications
- [ ] Monitor for errors and performance issues

### **Post-Migration**
- [ ] Monitor function performance and logs
- [ ] Update documentation
- [ ] Train team on new workflow
- [ ] Optimize function performance
- [ ] Set up proper monitoring and alerting
- [ ] Clean up old Cloud Functions

---

## 🎉 Conclusion

Migrating from Google Cloud Functions to Supabase Edge Functions offers several advantages:

- **Better Performance**: Global edge distribution for lower latency
- **Modern Development**: TypeScript-first with Deno runtime
- **Database Integration**: Direct PostgreSQL access with real-time features
- **Cost Effective**: Generous free tier and pay-per-use pricing
- **No Vendor Lock-in**: Open source solution you can self-host

The migration process requires careful planning and testing, but the result is a more modern, performant, and flexible serverless architecture.

---

## 📞 Support Resources

- [Supabase Edge Functions Documentation](https://supabase.com/docs/guides/functions)
- [Deno Documentation](https://deno.land/manual)
- [Supabase CLI Reference](https://supabase.com/docs/reference/cli)
- [Community Support](https://github.com/supabase/supabase/discussions)

Happy migrating! 🚀