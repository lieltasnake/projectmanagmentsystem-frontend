const http=require('http');
http.get('http://localhost:5000/api/health', (r)=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{console.log(r.statusCode,d);process.exit(0);});}).on('error',e=>{console.log('err',e.message);process.exit(1);});
