const {Pool}=require('pg');
const p=new Pool({host:'localhost',port:5432,user:'postgres',password:'postgres',database:'pms_db'});
p.query('select lcase()',['X'],(e,r)=>{
  if(e){console.log(e.message);process.exit(1);} else {console.log(r.rows);p.end();process.exit(0);}
});
