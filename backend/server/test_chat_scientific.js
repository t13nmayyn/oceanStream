const http = require('http');

const data = JSON.stringify({
  message: "What measurements are available here?",
  mode: "scientist",
  context: {
    lat: 14.5,
    lon: 78.5,
    depth: 50,
    date: "2026-09-16"
  },
  history: []
});

const req = http.request({
  hostname: 'localhost',
  port: 3001,
  path: '/api/ai/chat',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log(`STATUS: ${res.statusCode}`);
    console.log(`BODY: ${body}`);
  });
});

req.on('error', e => console.error(`Problem with request: ${e.message}`));
req.write(data);
req.end();
