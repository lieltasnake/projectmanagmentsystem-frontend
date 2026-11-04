const {Pool}=require('pg');
const p=new Pool({host:'localhost',port:5432,user:'postgres',password:'postgres',database:'pms_db'});
p.query('CREATE OR REPLACE FUNCTION lower(text) RETURNS text AS  SELECT ::text  LANGUAGE sql IMMUTABLE;', [], (e,r)=>{
  if(e){ console.error('c',e.message); p.end(); process.exit(1); } else { console.log('cok'); p.end(); process.exit(0); }
});
