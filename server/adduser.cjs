const bcrypt=require('bcrypt');
const {Pool}=require('pg');
const p=new Pool({host:'localhost',port:5432,user:'postgres',password:'postgres',database:'pms_db'});
const h=bcrypt.hashSync('test123',10);
p.query("INSERT INTO users (name, email, password_hash, role, team, is_active, must_change_password) VALUES ('Test User', 'test@test.com', $1, 'PM', 'Engineering', true, false) ON CONFLICT (email) DO UPDATE SET password_hash=$1", [h], (e,r)=>{
  if(e){console.log('ERR',e.message);} else {console.log('done',r.rowCount);}
  p.end();
});