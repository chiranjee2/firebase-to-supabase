#!/usr/bin/env node

/**
 * Google Cloud Functions to Supabase Edge Functions Migration Script
 * 
 * This script automatically converts Firebase/GCP Cloud Functions to Supabase Edge Functions
 * 
 * Usage:
 *   node migrate-functions.js --source ./path/to/functions --output ./supabase/functions
 *   node migrate-functions.js --firebase-project my-project --output ./supabase/functions
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class FunctionMigrator {
  constructor(options = {}) {
    this.sourceDir = options.source;
    this.outputDir = options.output || './supabase/functions';
    this.firebaseProject = options.firebaseProject;
    this.verbose = options.verbose || false;
    this.migrationReport = {
      total: 0,
      migrated: 0,
      failed: 0,
      warnings: [],
      errors: []
    };
  }

  log(message, type = 'info') {
    const prefix = type === 'error' ? '❌' : type === 'warn' ? '⚠️' : 'ℹ️';
    console.log(`${prefix} ${message}`);
    
    if (type === 'error') {
      this.migrationReport.errors.push(message);
    } else if (type === 'warn') {
      this.migrationReport.warnings.push(message);
    }
  }

  /**
   * Recursively find all JavaScript/TypeScript files in the directory
   */
  getAllFunctionFiles(dir) {
    const files = [];
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        // Skip node_modules and other common directories
        if (!['node_modules', '.git', 'dist', 'build', '.idea', '.vscode'].includes(item)) {
          files.push(...this.getAllFunctionFiles(fullPath));
        }
      } else if (stat.isFile()) {
        // Include JavaScript/TypeScript files but exclude package files
        if ((item.endsWith('.js') || item.endsWith('.ts') || item.endsWith('.mjs')) && 
            !['package.json', 'package-lock.json', 'tsconfig.json'].includes(item)) {
          files.push(fullPath);
        }
      }
    }
    
    return files;
  }

  /**
   * Parse Firebase Functions source code
   */
  async parseFunctionsFromSource(sourceDir) {
    this.log(`Parsing functions from source directory: ${sourceDir}`);
    const functions = [];

    try {
      // Recursively scan directories for function files
      const functionFiles = this.getAllFunctionFiles(sourceDir);

      if (functionFiles.length === 0) {
        throw new Error('No JavaScript/TypeScript files found in functions directory');
      }

      this.log(`Found ${functionFiles.length} function files to scan`);

      // Process each function file
      for (const filePath of functionFiles) {
        const relativePath = path.relative(sourceDir, filePath);
        const content = fs.readFileSync(filePath, 'utf8');
        const parsedFunctions = this.parseCloudFunctions(content, relativePath);
        functions.push(...parsedFunctions);
      }

    } catch (error) {
      this.log(`Error parsing functions: ${error.message}`, 'error');
    }

    return functions;
  }

  /**
   * Parse Cloud Functions from deployed Firebase project
   */
  async parseFunctionsFromFirebase(projectId) {
    this.log(`Fetching functions from Firebase project: ${projectId}`);
    const functions = [];

    try {
      // Get list of deployed functions
      const output = execSync(`firebase functions:list --project ${projectId}`, 
        { encoding: 'utf8' });
      
      const lines = output.split('\n');
      for (const line of lines) {
        if (line.includes('https://')) {
          const match = line.match(/(\w+)\s+.*https:\/\/.*/);
          if (match) {
            const functionName = match[1];
            functions.push({
              name: functionName,
              type: 'https', // Default to HTTPS trigger
              source: 'firebase-deployed',
              url: line.match(/https:\/\/[^\s]+/)[0]
            });
          }
        }
      }

      // Try to get function source code if possible
      try {
        const sourceOutput = execSync(`firebase functions:code:get --project ${projectId}`, 
          { encoding: 'utf8' });
        // Parse the downloaded source if available
      } catch (e) {
        this.log('Could not retrieve source code, generating basic templates', 'warn');
      }

    } catch (error) {
      this.log(`Error fetching Firebase functions: ${error.message}`, 'error');
    }

    return functions;
  }

  /**
   * Parse Cloud Functions from JavaScript/TypeScript code
   */
  parseCloudFunctions(content, filename = 'index.js') {
    const functions = [];
    
    // Patterns for different function types (support both CommonJS and ES6)
    const patterns = {
      // CommonJS exports
      https: /exports\.(\w+)\s*=\s*functions\.https\.onRequest/g,
      callable: /exports\.(\w+)\s*=\s*functions\.https\.onCall/g,
      firestore: /exports\.(\w+)\s*=\s*functions\.firestore\.document\(['"`]([^'"`]+)['"`]\)\.(\w+)/g,
      auth: /exports\.(\w+)\s*=\s*functions\.auth\.user\(\)\.(\w+)/g,
      storage: /exports\.(\w+)\s*=\s*functions\.storage\.object\(\)\.(\w+)/g,
      pubsub: /exports\.(\w+)\s*=\s*functions\.pubsub\.(?:topic|schedule)\(['"`]([^'"`]+)['"`]\)\.onRun/g,
      scheduler: /exports\.(\w+)\s*=\s*functions\.pubsub\.schedule\(['"`]([^'"`]+)['"`]\)/g,
      
      // ES6 exports
      https_es6: /export\s+const\s+(\w+)\s*=\s*createHttpFunction/g,
      callable_es6: /export\s+const\s+(\w+)\s*=\s*functions\.https\.onCall/g,
      firestore_es6: /export\s+const\s+(\w+)\s*=\s*functions\.firestore\.document\(['"`]([^'"`]+)['"`]\)\.(\w+)/g,
      auth_es6: /export\s+const\s+(\w+)\s*=\s*functions\.auth\.user\(\)\.(\w+)/g,
      
      // Modern Firebase function factory patterns
      http_factory: /createHttpFunction\s*\(\s*['"`]([^'"`]+)['"`]/g,
      callable_factory: /createCallableFunction\s*\(\s*['"`]([^'"`]+)['"`]/g,
      firestore_factory: /createFirestoreFunction\s*\(\s*['"`]([^'"`]+)['"`]/g,
      scheduled_factory: /createScheduledFunction\s*\(\s*['"`]([^'"`]+)['"`]/g,
      
      // Also match export patterns with function factories
      export_http: /export\s+const\s+(\w+)\s*=\s*createHttpFunction/g,
      export_callable: /export\s+const\s+(\w+)\s*=\s*createCallableFunction/g,
      export_firestore: /export\s+const\s+(\w+)\s*=\s*createFirestoreFunction/g,
      export_scheduled: /export\s+const\s+(\w+)\s*=\s*createScheduledFunction/g,
      
      // Handler function patterns (to extract the actual logic)
      handler: /const\s+(\w+Handler)\s*=\s*\([^)]*\)\s*=>/g,
      async_handler: /async function\s+(\w+)\s*\([^)]*\)/g
    };

    // Extract function definitions
    for (const [type, pattern] of Object.entries(patterns)) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        let func = {
          name: match[1],
          type: this.normalizeType(type),
          source: filename,
          raw: match[0]
        };

        // Handle different function patterns
        if (type === 'http_factory' || type === 'export_http') {
          // For createHttpFunction pattern, the name is in the first capture group
          func.name = match[1];
          func.type = 'https';
        } else if (type === 'callable_factory' || type === 'export_callable') {
          func.name = match[1];
          func.type = 'callable';
        } else if (type === 'firestore_factory' || type === 'export_firestore') {
          func.name = match[1];
          func.type = 'firestore';
        } else if (type === 'scheduled_factory' || type === 'export_scheduled') {
          func.name = match[1];
          func.type = 'scheduler';
        } else if (type.includes('handler') || type.includes('async_handler')) {
          // Skip handler patterns for now, we'll extract the main export
          continue;
        }

        // Add specific properties based on type
        if (type.includes('firestore')) {
          func.document = match[2];
          func.trigger = match[3]; // onCreate, onUpdate, etc.
        } else if (type.includes('auth')) {
          func.trigger = match[2]; // onCreate, onDelete
        } else if (type.includes('storage')) {
          func.trigger = match[2]; // onFinalize, onDelete
        } else if (type.includes('pubsub') || type.includes('scheduler')) {
          func.schedule = match[2];
        }

        // Extract function body - for modern functions, look for handler functions
        if (type.includes('_es6') || type.includes('_factory') || type.includes('export_')) {
          func.body = this.extractModernFunctionBody(content, func.name);
        } else {
          func.body = this.extractFunctionBody(content, match.index);
        }
        
        // Only add if we found a meaningful function
        if (func.body && func.body.length > 10) {
          functions.push(func);
        }
      }
    }

    return functions;
  }

  /**
   * Normalize function type names
   */
  normalizeType(type) {
    if (type.includes('https') || type.includes('http')) return 'https';
    if (type.includes('callable')) return 'callable';
    if (type.includes('firestore')) return 'firestore';
    if (type.includes('auth')) return 'auth';
    if (type.includes('storage')) return 'storage';
    if (type.includes('pubsub')) return 'pubsub';
    if (type.includes('scheduler')) return 'scheduler';
    return type;
  }

  /**
   * Extract modern function body (for ES6 modules and function factories)
   */
  extractModernFunctionBody(content, functionName) {
    // Look for the handler function associated with this function
    const handlerPattern = new RegExp(`const\\s+${functionName}.*?Handler\\s*=\\s*\\([^)]*\\)\\s*=>`, 'g');
    const handlerMatch = handlerPattern.exec(content);
    
    if (handlerMatch) {
      return this.extractFunctionBody(content, handlerMatch.index);
    }
    
    // If no specific handler found, try to find the main function logic
    const exportPattern = new RegExp(`export\\s+const\\s+${functionName}[\\s\\S]*?;`, 'g');
    const exportMatch = exportPattern.exec(content);
    
    if (exportMatch) {
      return exportMatch[0];
    }
    
    // Fallback: extract any significant async function or handler
    const asyncFunctionPattern = /async\s+function[^{]*{[^}]*}/g;
    const asyncMatch = asyncFunctionPattern.exec(content);
    
    return asyncMatch ? asyncMatch[0] : content.substring(0, Math.min(1000, content.length));
  }

  /**
   * Extract function body from source code
   */
  extractFunctionBody(content, startIndex) {
    let depth = 0;
    let inFunction = false;
    let body = '';
    
    for (let i = startIndex; i < content.length; i++) {
      const char = content[i];
      
      if (char === '{') {
        depth++;
        inFunction = true;
      }
      
      if (inFunction) {
        body += char;
      }
      
      if (char === '}') {
        depth--;
        if (depth === 0 && inFunction) {
          break;
        }
      }
    }
    
    return body;
  }

  /**
   * Generate Supabase Edge Function from Cloud Function
   */
  generateEdgeFunction(cloudFunction) {
    const templates = {
      https: this.generateHttpsFunction,
      callable: this.generateCallableFunction,
      firestore: this.generateFirestoreFunction,
      auth: this.generateAuthFunction,
      storage: this.generateStorageFunction,
      pubsub: this.generatePubSubFunction,
      scheduler: this.generateSchedulerFunction
    };

    const generator = templates[cloudFunction.type];
    if (!generator) {
      this.log(`Unsupported function type: ${cloudFunction.type}`, 'warn');
      return null;
    }

    return generator.call(this, cloudFunction);
  }

  /**
   * Generate HTTPS Edge Function
   */
  generateHttpsFunction(func) {
    const functionBody = this.convertFirebaseToSupabase(func.body);
    
    return `// Migrated from Firebase Cloud Function: ${func.name}
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    ${this.indentCode(functionBody, 4)}

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  } catch (error) {
    console.error('Function error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})

/* Migration Notes:
 * - Original function type: ${func.type}
 * - Source file: ${func.source}
 * - TODO: Review and test the converted function
 * - TODO: Update any Firebase-specific APIs to Supabase equivalents
 * - TODO: Test with appropriate request payloads
 */`;
  }

  /**
   * Generate Callable Edge Function
   */
  generateCallableFunction(func) {
    const functionBody = this.convertFirebaseToSupabase(func.body);
    
    return `// Migrated from Firebase Callable Function: ${func.name}
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify JWT token
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Verify the JWT token
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request data
    const data = await req.json()

    // Create context object (similar to Firebase callable functions)
    const context = {
      auth: {
        uid: user.id,
        token: user
      }
    }

    ${this.indentCode(functionBody, 4)}

    return new Response(
      JSON.stringify(result),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  } catch (error) {
    console.error('Callable function error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})

/* Migration Notes:
 * - Original function type: ${func.type} (Firebase Callable)
 * - Source file: ${func.source}
 * - TODO: Review authentication logic
 * - TODO: Test with authenticated requests
 * - TODO: Update error handling to match Firebase callable format
 */`;
  }

  /**
   * Generate Storage trigger Edge Function
   */
  generateStorageFunction(func) {
    return `// Migrated from Storage trigger: ${func.name}
// Original trigger: ${func.trigger}
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  // Verify webhook authenticity
  const webhookSecret = Deno.env.get('SUPABASE_WEBHOOK_SECRET')
  const authHeader = req.headers.get('authorization')
  
  if (!authHeader || authHeader !== \`Bearer \${webhookSecret}\`) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const { type, record, old_record } = await req.json()
    
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Original function logic (converted)
    ${this.indentCode(this.convertFirebaseToSupabase(func.body), 4)}

    return new Response('OK', { status: 200 })
  } catch (error) {
    console.error('Storage webhook error:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
})

/* Migration Notes:
 * - Original Storage trigger: ${func.trigger}
 * - TODO: Set up Storage webhook in Supabase Dashboard
 * - TODO: Configure SUPABASE_WEBHOOK_SECRET environment variable
 * - Webhook URL: https://YOUR_PROJECT.supabase.co/functions/v1/${func.name}
 */`;
  }

  /**
   * Generate Pub/Sub Edge Function
   */
  generatePubSubFunction(func) {
    return `// Migrated from Pub/Sub function: ${func.name}
// Original topic: ${func.schedule || 'N/A'}
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  // Verify webhook authenticity
  const webhookSecret = Deno.env.get('SUPABASE_WEBHOOK_SECRET')
  const authHeader = req.headers.get('authorization')
  
  if (!authHeader || authHeader !== \`Bearer \${webhookSecret}\`) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    // Parse message data
    const message = await req.json()
    const messageData = message.json || message.data
    
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Create context object similar to Firebase
    const context = {
      timestamp: new Date().toISOString()
    }

    // Original function logic (converted)
    ${this.indentCode(this.convertFirebaseToSupabase(func.body), 4)}

    return new Response('Message processed', { status: 200 })
  } catch (error) {
    console.error('Pub/Sub function error:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
})

/* Migration Notes:
 * - Original Pub/Sub topic: ${func.schedule || 'N/A'}
 * - TODO: Set up message queue or webhook system
 * - TODO: Configure SUPABASE_WEBHOOK_SECRET environment variable
 * - Consider using Supabase Realtime or external message queue service
 */`;
  }

  /**
   * Generate Firestore trigger Edge Function
   */
  generateFirestoreFunction(func) {
    return `// Migrated from Firestore trigger: ${func.name}
// Original trigger: ${func.document} (${func.trigger})
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  // Verify webhook authenticity
  const webhookSecret = Deno.env.get('SUPABASE_WEBHOOK_SECRET')
  const authHeader = req.headers.get('authorization')
  
  if (!authHeader || authHeader !== \`Bearer \${webhookSecret}\`) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const { type, table, record, old_record } = await req.json()
    
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Original function logic (converted)
    ${this.indentCode(this.convertFirebaseToSupabase(func.body), 4)}

    return new Response('OK', { status: 200 })
  } catch (error) {
    console.error('Webhook error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})

/* Migration Notes:
 * - Original Firestore trigger: ${func.document}
 * - Original event: ${func.trigger}
 * - TODO: Set up database webhook in Supabase Dashboard
 * - TODO: Configure SUPABASE_WEBHOOK_SECRET environment variable
 * 
 * Database Webhook Setup (run in Supabase SQL Editor):
 * 
 * CREATE OR REPLACE FUNCTION trigger_${func.name}_webhook()
 * RETURNS TRIGGER AS $$
 * BEGIN
 *   PERFORM net.http_post(
 *     url := 'https://YOUR_PROJECT.supabase.co/functions/v1/${func.name}',
 *     headers := '{"Content-Type": "application/json", "Authorization": "Bearer " || current_setting("app.webhook_secret")}',
 *     body := json_build_object(
 *       'type', TG_OP,
 *       'table', TG_TABLE_NAME,
 *       'record', row_to_json(NEW),
 *       'old_record', row_to_json(OLD)
 *     )::text
 *   );
 *   RETURN COALESCE(NEW, OLD);
 * END;
 * $$ LANGUAGE plpgsql;
 * 
 * CREATE TRIGGER on_${func.name}
 *   AFTER INSERT OR UPDATE OR DELETE ON your_table
 *   FOR EACH ROW
 *   EXECUTE FUNCTION trigger_${func.name}_webhook();
 */`;
  }

  /**
   * Generate Auth trigger Edge Function
   */
  generateAuthFunction(func) {
    return `// Migrated from Auth trigger: ${func.name}
// Original trigger: ${func.trigger}
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  // Verify webhook authenticity
  const webhookSecret = Deno.env.get('SUPABASE_WEBHOOK_SECRET')
  const authHeader = req.headers.get('authorization')
  
  if (!authHeader || authHeader !== \`Bearer \${webhookSecret}\`) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const { type, record, old_record } = await req.json()
    
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Original function logic (converted)
    ${this.indentCode(this.convertFirebaseToSupabase(func.body), 4)}

    return new Response('OK', { status: 200 })
  } catch (error) {
    console.error('Auth webhook error:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
})

/* Migration Notes:
 * - Original Auth trigger: ${func.trigger}
 * - TODO: Set up Auth webhook in Supabase Dashboard
 * - TODO: Configure webhook URL in Supabase Auth settings
 * - Webhook URL: https://YOUR_PROJECT.supabase.co/functions/v1/${func.name}
 */`;
  }

  /**
   * Generate Scheduler Edge Function
   */
  generateSchedulerFunction(func) {
    return `// Migrated from scheduled function: ${func.name}
// Original schedule: ${func.schedule || 'N/A'}
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  // Verify cron secret for security
  const cronSecret = req.headers.get('authorization')
  const expectedAuth = \`Bearer \${Deno.env.get('CRON_SECRET')}\`
  
  if (cronSecret !== expectedAuth) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Original scheduled function logic (converted)
    ${this.indentCode(this.convertFirebaseToSupabase(func.body), 4)}

    return new Response('Scheduled task completed', { status: 200 })
  } catch (error) {
    console.error('Scheduled function error:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
})

/* Migration Notes:
 * - Original schedule: ${func.schedule || 'N/A'}
 * - TODO: Set up pg_cron in Supabase for scheduling
 * - TODO: Configure CRON_SECRET environment variable
 * 
 * Supabase pg_cron Setup (run in Supabase SQL Editor):
 * 
 * -- Enable pg_cron extension (run once)
 * CREATE EXTENSION IF NOT EXISTS pg_cron;
 * 
 * -- Schedule the function (adjust schedule as needed)
 * SELECT cron.schedule(
 *   '${func.name}',
 *   '${func.schedule || '0 2 * * *'}', -- Original or default schedule
 *   $$
 *   SELECT net.http_post(
 *     url := 'https://YOUR_PROJECT.supabase.co/functions/v1/${func.name}',
 *     headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_CRON_SECRET"}'
 *   );
 *   $$
 * );
 */`;
  }

  /**
   * Convert Firebase-specific code to Supabase equivalents
   */
  convertFirebaseToSupabase(code) {
    let converted = code;

    // Convert Firebase Admin SDK calls
    converted = converted.replace(/admin\.firestore\(\)/g, 'supabaseClient');
    converted = converted.replace(/admin\.auth\(\)/g, 'supabaseClient.auth.admin');
    converted = converted.replace(/admin\.storage\(\)/g, 'supabaseClient.storage');
    
    // Convert Firestore operations
    converted = converted.replace(/\.collection\(['"`](\w+)['"`]\)/g, '.from(\'$1\')');
    converted = converted.replace(/\.doc\(['"`]([^'"`]+)['"`]\)/g, '.select().eq(\'id\', \'$1\').single()');
    converted = converted.replace(/\.get\(\)/g, '');
    converted = converted.replace(/\.data\(\)/g, '');
    converted = converted.replace(/\.set\(/g, '.insert(');
    converted = converted.replace(/\.update\(/g, '.update(');
    converted = converted.replace(/\.delete\(\)/g, '.delete()');
    
    // Convert Firebase Auth
    converted = converted.replace(/user\.uid/g, 'user.id');
    converted = converted.replace(/context\.auth\.uid/g, 'user.id');
    
    // Convert timestamps
    converted = converted.replace(/admin\.firestore\.FieldValue\.serverTimestamp\(\)/g, 'new Date().toISOString()');
    
    // Convert response format
    converted = converted.replace(/res\.json\(/g, 'return new Response(JSON.stringify(');
    converted = converted.replace(/res\.status\((\d+)\)\.send\(/g, 'return new Response($1, ');
    converted = converted.replace(/res\.send\(/g, 'return new Response(');
    
    // Add TODO comments for manual review
    if (converted.includes('admin.')) {
      converted = '// TODO: Review Firebase Admin SDK usage\n    ' + converted;
    }
    
    if (converted.includes('functions.')) {
      converted = '// TODO: Review Firebase Functions usage\n    ' + converted;
    }

    return converted;
  }

  /**
   * Indent code by specified number of spaces
   */
  indentCode(code, spaces) {
    const indent = ' '.repeat(spaces);
    return code.split('\n').map(line => 
      line.trim() ? indent + line : line
    ).join('\n');
  }

  /**
   * Create Edge Function files
   */
  async createEdgeFunctions(functions) {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    const migrationSummary = [];

    for (const func of functions) {
      try {
        const edgeFunctionCode = this.generateEdgeFunction(func);
        
        if (!edgeFunctionCode) {
          this.log(`Skipping function ${func.name} - unsupported type`, 'warn');
          continue;
        }

        // Create function directory
        const functionDir = path.join(this.outputDir, func.name);
        if (!fs.existsSync(functionDir)) {
          fs.mkdirSync(functionDir, { recursive: true });
        }

        // Write function code
        const indexPath = path.join(functionDir, 'index.ts');
        fs.writeFileSync(indexPath, edgeFunctionCode);

        // Create deno.json
        const denoConfig = {
          imports: {
            "supabase": "https://esm.sh/@supabase/supabase-js@2"
          }
        };
        fs.writeFileSync(
          path.join(functionDir, 'deno.json'), 
          JSON.stringify(denoConfig, null, 2)
        );

        this.log(`✅ Created Edge Function: ${func.name}`);
        this.migrationReport.migrated++;

        migrationSummary.push({
          name: func.name,
          type: func.type,
          status: 'migrated',
          path: functionDir
        });

      } catch (error) {
        this.log(`Failed to migrate function ${func.name}: ${error.message}`, 'error');
        this.migrationReport.failed++;
        migrationSummary.push({
          name: func.name,
          type: func.type,
          status: 'failed',
          error: error.message
        });
      }
    }

    return migrationSummary;
  }

  /**
   * Generate migration report
   */
  generateReport(summary) {
    const reportPath = path.join(this.outputDir, 'MIGRATION_REPORT.md');
    
    const report = `# Function Migration Report

Generated: ${new Date().toISOString()}

## Summary
- Total functions found: ${this.migrationReport.total}
- Successfully migrated: ${this.migrationReport.migrated}
- Failed migrations: ${this.migrationReport.failed}
- Warnings: ${this.migrationReport.warnings.length}

## Migrated Functions

${summary.map(func => `
### ${func.name}
- **Type**: ${func.type}
- **Status**: ${func.status}
- **Path**: ${func.path || 'N/A'}
${func.error ? `- **Error**: ${func.error}` : ''}
`).join('')}

## Next Steps

1. **Review generated functions** - Check TODO comments in each function
2. **Set up environment variables** - Configure secrets and API keys
3. **Test functions locally** - Run \`supabase start\` and test endpoints
4. **Set up database webhooks** - For Firestore trigger replacements
5. **Set up scheduled functions** - Configure pg_cron for scheduled tasks
6. **Deploy functions** - Run \`supabase functions deploy\`

## Warnings

${this.migrationReport.warnings.map(w => `- ${w}`).join('\n')}

## Errors

${this.migrationReport.errors.map(e => `- ${e}`).join('\n')}

---

*This report was generated by the Firebase to Supabase migration tool.*
`;

    fs.writeFileSync(reportPath, report);
    this.log(`📊 Migration report saved to: ${reportPath}`);
  }

  /**
   * Main migration function
   */
  async migrate() {
    console.log('🚀 Starting Firebase to Supabase Functions Migration...\n');

    let functions = [];

    // Parse functions from source or Firebase project
    if (this.sourceDir) {
      functions = await this.parseFunctionsFromSource(this.sourceDir);
    } else if (this.firebaseProject) {
      functions = await this.parseFunctionsFromFirebase(this.firebaseProject);
    } else {
      this.log('Either --source or --firebase-project must be specified', 'error');
      return;
    }

    this.migrationReport.total = functions.length;

    if (functions.length === 0) {
      this.log('No functions found to migrate', 'warn');
      return;
    }

    this.log(`Found ${functions.length} functions to migrate\n`);

    // Create Edge Functions
    const summary = await this.createEdgeFunctions(functions);

    // Generate migration report
    this.generateReport(summary);

    console.log('\n🎉 Migration completed!');
    console.log(`✅ ${this.migrationReport.migrated} functions migrated successfully`);
    if (this.migrationReport.failed > 0) {
      console.log(`❌ ${this.migrationReport.failed} functions failed to migrate`);
    }
    if (this.migrationReport.warnings.length > 0) {
      console.log(`⚠️ ${this.migrationReport.warnings.length} warnings generated`);
    }
  }
}

// CLI handling
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace('--', '');
    const value = args[i + 1];
    
    if (key === 'source') options.source = value;
    else if (key === 'output') options.output = value;
    else if (key === 'firebase-project') options.firebaseProject = value;
    else if (key === 'verbose') { options.verbose = true; i--; }
  }

  const migrator = new FunctionMigrator(options);
  migrator.migrate().catch(console.error);
}

module.exports = FunctionMigrator;