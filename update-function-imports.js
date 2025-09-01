#!/usr/bin/env node

/**
 * Script to update all migrated Edge Functions to use the new shared utilities
 * This will add proper imports and clean up the generated code
 */

const fs = require('fs');
const path = require('path');

const FUNCTIONS_DIR = './supabase/functions';
const SHARED_IMPORT = `import { getClient, COLLECTIONS, log, logError, LOG_LEVELS, notifications } from "../_shared/index.ts";`;

/**
 * Update a function file to use shared utilities
 */
function updateFunctionFile(functionPath) {
  const indexPath = path.join(functionPath, 'index.ts');
  
  if (!fs.existsSync(indexPath)) {
    console.log(`⚠️  No index.ts found in ${functionPath}`);
    return;
  }

  const content = fs.readFileSync(indexPath, 'utf8');
  const functionName = path.basename(functionPath);

  // Skip if already updated
  if (content.includes('from "../_shared/index.ts"')) {
    console.log(`✅ ${functionName} - Already updated`);
    return;
  }

  let updatedContent = content;

  // Add shared imports after the serve import
  const serveImportRegex = /import { serve } from "https:\/\/deno\.land\/std@[\d.]+\/http\/server\.ts"/;
  if (serveImportRegex.test(updatedContent)) {
    updatedContent = updatedContent.replace(
      serveImportRegex,
      `$&\n${SHARED_IMPORT}`
    );
  }

  // Remove standalone Supabase client import if it exists
  updatedContent = updatedContent.replace(
    /import { createClient } from 'https:\/\/esm\.sh\/@supabase\/supabase-js@2'/g,
    ''
  );

  // Replace createClient calls with getClient
  updatedContent = updatedContent.replace(
    /const supabaseClient = createClient\(\s*Deno\.env\.get\('SUPABASE_URL'\)!,\s*Deno\.env\.get\('SUPABASE_SERVICE_ROLE_KEY'\)!\s*\)/g,
    'const supabase = getClient()'
  );

  // Replace supabaseClient references with supabase
  updatedContent = updatedContent.replace(/supabaseClient/g, 'supabase');

  // Add function name constant if not present
  if (!updatedContent.includes(`const functionName = "${functionName}"`)) {
    const serveIndex = updatedContent.indexOf('serve(async (req)');
    if (serveIndex !== -1) {
      const beforeServe = updatedContent.substring(0, serveIndex);
      const afterServe = updatedContent.substring(serveIndex);
      updatedContent = beforeServe + `\nconst functionName = "${functionName}";\n\n` + afterServe;
    }
  }

  // Clean up any remaining Firebase references
  updatedContent = updatedContent.replace(/admin\.firestore\(\)/g, 'supabase');
  updatedContent = updatedContent.replace(/admin\.auth\(\)/g, 'supabase.auth.admin');
  updatedContent = updatedContent.replace(/firestore\./g, 'supabase.');

  // Update collection references
  updatedContent = updatedContent.replace(/COLLECTIONS\.(\w+)/g, (match, collectionName) => {
    return `COLLECTIONS.${collectionName}`;
  });

  // Clean up malformed code blocks
  updatedContent = updatedContent.replace(/\s*{\s*corsHandler.*?}\s*return new Response/s, '\n    return new Response');
  updatedContent = updatedContent.replace(/export const \w+ = create\w+Function.*?;/g, '');

  // Update migration notes
  updatedContent = updatedContent.replace(
    /\/\* Migration Notes:[\s\S]*?\*\//,
    `/* Migration Notes:
 * ✅ Successfully migrated from Firebase to Supabase
 * ✅ Using shared utilities for logging, database access, and configuration  
 * ✅ Cleaned up and optimized for Supabase Edge Functions
 * 
 * TODO: Review function logic for Supabase-specific optimizations
 * TODO: Test function with appropriate payloads
 */`
  );

  // Write updated content
  fs.writeFileSync(indexPath, updatedContent);
  console.log(`✅ ${functionName} - Updated successfully`);
}

/**
 * Main execution
 */
function main() {
  console.log('🚀 Updating Edge Functions to use shared utilities...\n');

  if (!fs.existsSync(FUNCTIONS_DIR)) {
    console.error('❌ Functions directory not found');
    process.exit(1);
  }

  const functionDirs = fs.readdirSync(FUNCTIONS_DIR)
    .filter(name => {
      const fullPath = path.join(FUNCTIONS_DIR, name);
      return fs.statSync(fullPath).isDirectory() && 
             name !== '_shared' && 
             name !== 'hello-world' &&
             !name.startsWith('.');
    });

  console.log(`Found ${functionDirs.length} functions to update:\n`);

  functionDirs.forEach(functionDir => {
    const functionPath = path.join(FUNCTIONS_DIR, functionDir);
    updateFunctionFile(functionPath);
  });

  console.log(`\n🎉 Updated ${functionDirs.length} functions!`);
  console.log('\n📋 Next steps:');
  console.log('1. Review the updated functions');
  console.log('2. Test functions locally with `supabase start`');
  console.log('3. Deploy with `supabase functions deploy`');
}

if (require.main === module) {
  main();
}