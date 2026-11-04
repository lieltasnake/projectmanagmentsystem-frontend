const {pool} = require('./dist/db');
const fs = require('fs');
const path = require('path');
async function run() {
  const client = await pool.connect();
  try {
    const files = ['022_create_roles_catalog.sql','023_create_skills_catalog.sql'];
    for (const f of files) {
      const sql = fs.readFileSync(path.join(__dirname,'migrations',f),'utf8');
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(filename) VALUES() ON CONFLICT DO NOTHING', [f]);
      await client.query('COMMIT');
      console.log('applied', f);
    }
  } catch(e) {
    console.error('err', e.message);
    try { await client.query('ROLLBACK'); } catch(e2){}
  } finally {
    client.release();
    process.exit(0);
  }
}
run();
