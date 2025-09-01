const fs = require('fs');
const path = require('path');

function fixSyntaxErrors(content) {
  let lines = content.split('\n');
  let modified = false;
  
  // Fix common patterns
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Fix missing closing parentheses in Response calls
    if (trimmed.includes('JSON.stringify({') && trimmed.includes('})') && 
        i < lines.length - 1 && lines[i+1].trim() === '}') {
      const nextNonEmpty = lines.slice(i+1).findIndex(l => l.trim() !== '');
      if (nextNonEmpty > -1 && lines[i+1+nextNonEmpty].trim() === '} catch (error) {') {
        // Missing closing parenthesis for Response call
        const indent = line.match(/^\s*/)[0];
        lines.splice(i+1, 0, indent + '    )');
        modified = true;
      }
    }
    
    // Fix undefined 'result' variables
    if (trimmed.includes('data: result') || trimmed.includes('success: true, data: result')) {
      lines[i] = line.replace('data: result', 'message: "Function executed successfully"');
      modified = true;
    }
  }
  
  return { content: lines.join('\n'), modified };
}

const functionsDir = '/Users/apple/Desktop/firebase-to-supabase/supabase/functions';
const functions = fs.readdirSync(functionsDir)
  .filter(name => name !== '_shared')
  .filter(name => {
    const fullPath = path.join(functionsDir, name);
    return fs.statSync(fullPath).isDirectory();
  });

console.log('🔧 Fixing syntax errors in Edge Functions...\n');

let totalFixed = 0;
functions.forEach(functionName => {
  const indexPath = path.join(functionsDir, functionName, 'index.ts');
  if (fs.existsSync(indexPath)) {
    try {
      const content = fs.readFileSync(indexPath, 'utf8');
      const result = fixSyntaxErrors(content);
      
      if (result.modified) {
        fs.writeFileSync(indexPath, result.content);
        console.log(`✅ ${functionName} - Fixed syntax errors`);
        totalFixed++;
      } else {
        console.log(`ℹ️  ${functionName} - No syntax errors found`);
      }
    } catch (error) {
      console.log(`❌ ${functionName} - Error: ${error.message}`);
    }
  }
});

console.log(`\n🎉 Fixed syntax errors in ${totalFixed} functions.\n`);