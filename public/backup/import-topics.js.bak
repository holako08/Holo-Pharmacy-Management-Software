const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

(async () => {
  const db = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '200800', // adjust if needed
    database: 'cross_selling_db'
  });

  const folder = path.join(__dirname, 'text');
  const files = fs.readdirSync(folder);

  for (let file of files) {
    const content = fs.readFileSync(path.join(folder, file), 'utf8');
    const title = file.replace('.txt', '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    try {
      await db.execute('INSERT INTO topics (title, content) VALUES (?, ?)', [title, content]);
      console.log(`Inserted: ${title}`);
    } catch (err) {
      console.error(`Skipped (maybe duplicate): ${title}`);
    }
  }

  console.log('✅ Import completed');
  db.end();
})();
