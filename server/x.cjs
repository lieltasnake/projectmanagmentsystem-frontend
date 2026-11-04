const {Pool}=require('pg');
const p=new Pool({host:'localhost',port:5432,user:'postgres',password:'postgres',database:'pms_db'});
p.query('SELECT lower(cast( as text))', ['ABC'], (e,r)=>{
  if(e){ console.log('e'); p.end(); return; }
  console.log(r.rows);
  p.end();
});
