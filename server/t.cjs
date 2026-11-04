const {Pool}=require('pg');
const p=new Pool({host:'localhost',port=5432,user='postgres',password='postgres',database='pms_db'});
p.query('SELECT 1', (e,r)=>{
  if(e){console.log(e.message);p.end();return;}
  p.query('SELECT lower()', ['x'], (e2,r2)=>{
    if(e2){console.log('e2',e2.message);} else {console.log(r2.rows);}
    p.end();
  });
});
