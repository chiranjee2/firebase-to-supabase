#!/usr/bin/env node

/**
 * Script to fix malformed Edge Functions that still contain Firebase function factory code
 */

const fs = require('fs');
const path = require('path');

const FUNCTIONS_DIR = './supabase/functions';

/**
 * Clean up malformed function code
 */
function cleanupFunctionFile(functionPath) {
  const indexPath = path.join(functionPath, 'index.ts');
  
  if (!fs.existsSync(indexPath)) {
    console.log(`⚠️  No index.ts found in ${functionPath}`);
    return;
  }

  const content = fs.readFileSync(indexPath, 'utf8');
  const functionName = path.basename(functionPath);

  let updatedContent = content;

  // Remove export const functionName = createFirestoreFunction lines
  updatedContent = updatedContent.replace(
    /export const \w+ = create\w+Function\([^}]*\};?\s*/gs,
    ''
  );

  // Remove any malformed function export blocks
  updatedContent = updatedContent.replace(
    /\/\/ Original function logic \(converted\)\s*export const \w+.*?\);/gs,
    '// TODO: Implement the actual function logic here'
  );

  // Remove any remaining createFirestoreFunction, createHttpFunction, etc. calls
  updatedContent = updatedContent.replace(
    /create\w+Function\([^)]*\)/g,
    '// TODO: Replace with actual function logic'
  );

  // Clean up malformed response returns inside try blocks
  updatedContent = updatedContent.replace(
    /\/\/ Original function logic \(converted\)[\s\S]*?return new Response\('OK', \{ status: 200 \}\)/,
    `// TODO: Implement the actual function logic here
    
    return new Response('OK', { status: 200 })`
  );

  // Remove malformed scheduled function exports
  updatedContent = updatedContent.replace(
    /\/\/ Original scheduled function logic \(converted\)[\s\S]*?return new Response\('Scheduled task completed', \{ status: 200 \}\)/,
    `// TODO: Implement the actual scheduled function logic here
    
    return new Response('Scheduled task completed', { status: 200 })`
  );

  // Clean up any remaining malformed blocks
  updatedContent = updatedContent.replace(
    /{\s*corsHandler.*?}\s*return new Response/gs,
    'return new Response'
  );

  // Remove any standalone export lines that might be left
  updatedContent = updatedContent.replace(/^\s*export const \w+.*$/gm, '');

  // Clean up multiple consecutive newlines
  updatedContent = updatedContent.replace(/\n\n\n+/g, '\n\n');

  // Write updated content
  fs.writeFileSync(indexPath, updatedContent);
  console.log(`✅ ${functionName} - Cleaned up successfully`);
}

/**
 * Main execution
 */
function main() {
  console.log('🧹 Cleaning up malformed Edge Functions...\n');

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

  console.log(`Found ${functionDirs.length} functions to clean up:\n`);

  functionDirs.forEach(functionDir => {
    const functionPath = path.join(FUNCTIONS_DIR, functionDir);
    cleanupFunctionFile(functionPath);
  });

  console.log(`\n🎉 Cleaned up ${functionDirs.length} functions!`);
  console.log('\n📋 Next steps:');
  console.log('1. Review the cleaned functions');
  console.log('2. Add proper function logic where TODOs are marked');
  console.log('3. Test and deploy with `supabase functions deploy`');
}

if (require.main === module) {
  main();
}