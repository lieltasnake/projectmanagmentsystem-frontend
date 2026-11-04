const {Pool}=require('pg');
const p=new Pool({host:'localhost',port:5432,user:'postgres',password:'postgres',database:'pms_db'});
p.query("SELECT column_name FROM information_schema.columns WHERE table_name='users'", (e,r)=>{
  if(e){console.log(e.message);p.end();return;}
  console.log(JSON.stringify(r.rows)); p.end();
});
