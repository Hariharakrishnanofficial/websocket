import WebSocket from 'ws';
const url = process.argv[2];
console.log('Simulating ESP32 robot ->', url);
const ws = new WebSocket(url, { handshakeTimeout: 8000 });
ws.on('open', () => {
  console.log('OPEN -> sending {"type":"robot"}');
  ws.send('{"type":"robot"}');
});
ws.on('message', (m) => console.log('SERVER:', m.toString()));
ws.on('unexpected-response', (req, res) => {
  console.log(`HTTP ${res.statusCode} ${res.statusMessage}`);
  process.exit(1);
});
ws.on('error', (e) => console.log('ERROR:', e.message));
ws.on('close', (c, r) => { console.log('CLOSE code=', c, 'reason=', r?.toString()); process.exit(0); });
setTimeout(()=>{ console.log('--- 3s elapsed, closing cleanly ---'); ws.close(1000,'bye'); }, 3000);
