const fs = require('fs');
const path = require('path');

function fixMissingParentheses(content) {
  let lines = content.split('\n');
  let modified = false;
  
  // Look for missing closing parentheses patterns
  for (let i = 0; i < lines.length - 2; i++) {
    const line = lines[i].trim();
    const nextLine = lines[i+1].trim();
    const lineAfter = lines[i+2].trim();
    
    // Pattern: return new Response( ... { ... } without closing )
    if (line.includes('return new Response(') || line.includes('JSON.stringify(')) {
      // Look ahead for the closing pattern
      for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
        const checkLine = lines[j].trim();
        const nextCheckLine = j < lines.length - 1 ? lines[j + 1].trim() : '';
        
        // Found closing brace followed by catch/function end
        if (checkLine === '}' && (nextCheckLine.includes('} catch') || nextCheckLine.includes('} finally') || nextCheckLine === '})')) {
          // Insert closing parenthesis
          const indent = lines[j].match(/^\s*/)[0];
          lines[j] = lines[j] + '\n' + indent + ')';
          modified = true;
          break;
        }
      }
    }
  }
  
  // Also fix any remaining syntax issues
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    
    // Fix lines ending with } followed by catch without closing )
    if (line.trim() === '}' && i < lines.length - 1) {
      const nextLine = lines[i + 1].trim();
      if (nextLine.includes('} catch') || nextLine.includes('catch (error)')) {
        // Check if we're missing a closing parenthesis for a Response call
        let foundResponse = false;
        for (let j = i - 1; j >= Math.max(0, i - 10); j--) {
          if (lines[j].includes('return new Response(')) {
            foundResponse = true;
            break;
          }
        }
        if (foundResponse) {
          const indent = line.match(/^\s*/)[0];
          lines[i] = line + '\n' + indent + ')';
          modified = true;
        }
      }
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

console.log('🔧 Final parentheses fix for all functions...\n');

let totalFixed = 0;
functions.forEach(functionName => {
  const indexPath = path.join(functionsDir, functionName, 'index.ts');
  if (fs.existsSync(indexPath)) {
    try {
      const content = fs.readFileSync(indexPath, 'utf8');
      const result = fixMissingParentheses(content);
      
      if (result.modified) {
        fs.writeFileSync(indexPath, result.content);
        console.log(`✅ ${functionName} - Fixed missing parentheses`);
        totalFixed++;
      } else {
        console.log(`ℹ️  ${functionName} - No parentheses issues`);
      }
    } catch (error) {
      console.log(`❌ ${functionName} - Error: ${error.message}`);
    }
  }
});

console.log(`\n🎉 Fixed parentheses in ${totalFixed} functions.\n`);