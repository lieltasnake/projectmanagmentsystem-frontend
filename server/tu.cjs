const {Pool}=require('pg');
const p=new Pool({host:'localhost',port:5432,user:'postgres',password:'postgres',database:'pms_db'});
p.query("SELECT UPPER('abc')", (e,r)=>{
  if(e){ console.error(e.message); p.end(); return; } 
  console.log(JSON.stringify(r.rows));
  p.end();
});
