const bcrypt=require('bcrypt');
const {Pool}=require('pg');
const p=new Pool({host:'localhost',port:5432,user:'postgres',password:'postgres',database:'pms_db'});
bcrypt.hash('Password123',10).then(h=>{
  p.query('UPDATE users SET password_hash=, must_change_password=FALSE WHERE email=',[h,'mercy@gmail.com'],(e,r)=>{
    if(e){console.log(e.message);} else {console.log('updated',r.rowCount);}
    p.end();
  });
});
