const http = require('http');

const data = JSON.stringify({
  message: "Hello",
  mode: "analyze", // Using 'analyze' instead of 'scientist'
  context: { lat: null, lon: null, depth: null, date: null },
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

req.write(data);
req.end();
