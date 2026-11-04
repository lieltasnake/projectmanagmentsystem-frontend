const {Pool}=require('pg');
const p=new Pool({host:'localhost',port:5432,user:'postgres',password:'postgres',database:'pms_db'});
p.query(\"UPDATE users SET password_hash = 'updated' WHERE email='test.tester.1793341439791@pms.local'\", (e,r)=>{
  if(e){console.log('ERR',e.message);} else {console.log('updated',r.rowCount);}
  p.end();
});
