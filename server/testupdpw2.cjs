const {Pool}=require('pg');
const p=new Pool({host:'localhost',port:5432,user:'postgres',password:'postgres',database:'pms_db'});
p.query('UPDATE users SET role= WHERE email=',['TM','mercy@gmail.com'],(e,r)=>{
  if(e){console.log('ERR',e.message, e.detail, e.hint);} else {console.log('updated',r.rowCount);}
  p.end();
});
