const http = require('http');
function req(path, method = 'GET', body = null, token = null) {
  return new Promise((res) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({
      hostname: 'localhost',
      port: 5000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': 'Bearer ' + token } : {})
      }
    }, (resp) => {
      let d = '';
      resp.on('data', c => d += c);
      resp.on('end', () => res({ status: resp.statusCode, body: d }));
    });
    if (data) r.write(data);
    r.end();
  });
}
(async () => {
  const l = await req('/api/auth/login', 'POST', { email: 'test@test.com', password: 'test123' });
  console.log('login', l.status, l.body);
  let t;
  try { t = JSON.parse(l.body).token; } catch {}
  if (t) {
    const r = await req('/api/users/roles', 'GET', null, t);
    console.log('roles', r.status, r.body);
  }
  process.exit(0);
})();