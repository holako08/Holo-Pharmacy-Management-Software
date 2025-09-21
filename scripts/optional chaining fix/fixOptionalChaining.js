const fs = require('fs');

const FILE = 'server.js';
const BACKUP = FILE + '.bak';

if (!fs.existsSync(FILE)) {
  console.error(`❌ ${FILE} not found.`);
  process.exit(1);
}

// Backup original
fs.copyFileSync(FILE, BACKUP);
console.log(`✅ Backup created: ${BACKUP}`);

let content = fs.readFileSync(FILE, 'utf8');
let original = content;

let count = 0;

// Fix .method() or .property
content = content.replace(/([a-zA-Z0-9_$\[\]\.]+)\?\.(\w+)\(/g, (_, obj, method) => {
  count++;
  return `(${obj} && ${obj}.${method}(`;
});

content = content.replace(/([a-zA-Z0-9_$\[\]\.]+)\?\.(\w+)/g, (_, obj, prop) => {
  count++;
  return `(${obj} && ${obj}.${prop})`;
});

if (count > 0) {
  fs.writeFileSync(FILE, content, 'utf8');
  console.log(`✅ Fixed ${count} optional chaining issues in ${FILE}`);
} else {
  console.log('ℹ️ No optional chaining found to fix.');
}
