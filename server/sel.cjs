const {Pool}=require('pg');
const p=new Pool({host:'localhost',port:5432,user:'postgres',password:'postgres',database:'pms_db'});
p.query('SELECT * FROM users LIMIT 1', (e,r)=>{
  if(e){console.log('ERR',e.message);} else {console.log(JSON.stringify(r.rows));}
  p.end();
});
