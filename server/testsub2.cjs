const {Pool}=require('pg');
const p=new Pool({host:'localhost',port:5432,user:'postgres',password:'postgres',database:'pms_db'});
p.query(\"SELECT substr('abc',1,1)\", (e,r)=>{
  if(e){ console.error(e.message); p.end(); process.exit(1); } else { console.log(r.rows); p.end(); process.exit(0); }
});
