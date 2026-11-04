const {Pool}=require('pg');
const p=new Pool({host:'localhost',port:5432,user:'postgres',password:'postgres',database:'pms_db'});
p.query('CREATE OR REPLACE FUNCTION public.lower(t text) RETURNS text AS  SELECT t  LANGUAGE sql IMMUTABLE;', (e,r)=>{
  if(e){ console.error(e.message); p.end(); process.exit(1); } else { console.log('ok'); p.end(); process.exit(0); }
});
