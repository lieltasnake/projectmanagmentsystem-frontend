const {Pool}=require('pg');
const p=new Pool({host:'localhost',port:5432,user:'postgres',password:'postgres',database:'pms_db'});
p.query("SELECT lower('ABC')", (e,r)=>{
  if(e){ console.log(e.message); p.end(); process.exit(0); }
  console.log(r.rows);
  p.end();
});
