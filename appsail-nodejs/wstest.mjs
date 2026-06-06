import WebSocket from 'ws';
const url = process.argv[2];
console.log('Testing:', url);
const ws = new WebSocket(url, { handshakeTimeout: 8000 });
const t0 = Date.now();
ws.on('open', () => {
  console.log(`OPEN in ${Date.now()-t0}ms`);
  try { ws.send(JSON.stringify({type:'hello', from:'test'})); } catch(e){}
});
ws.on('message', (m) => console.log('MSG:', m.toString().slice(0,200)));
ws.on('unexpected-response', (req, res) => {
  console.log(`HTTP ${res.statusCode} ${res.statusMessage}`);
  let body=''; res.on('data',c=>body+=c); res.on('end',()=>{console.log('body:',body.slice(0,400)); process.exit(1);});
});
ws.on('error', (e) => { console.log('ERROR:', e.message); });
ws.on('close', (c) => { console.log('CLOSE code=', c); process.exit(0); });
setTimeout(()=>{ console.log('--- timeout, closing ---'); try{ws.close();}catch(e){} process.exit(0); }, 5000);
