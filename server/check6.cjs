const {Pool}=require('pg');
const p=new Pool({host:'localhost',port:5432,user:'postgres',password:'postgres',database:'pms_db'});
p.query('SELECT 1', [], (e,r)=>{
  if(e){ console.error(e.message); p.end(); process.exit(1); } else { 
    p.query('select current_schema()', (e2,r2)=>{
      if(e2){console.error(e2.message);} else {console.log(r2.rows);}
      p.end(); process.exit(0);
    });
  }
});
