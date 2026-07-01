const express = require('express');
const http = require('http');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3003;
const API_HOST = process.env.API_HOST || 'api';
const API_PORT = process.env.API_PORT || 3000;

function proxy(req, res, targetPath) {
  const options = {
    hostname: API_HOST,
    port: API_PORT,
    path: targetPath,
    method: req.method,
    headers: { ...req.headers, host: API_HOST + ':' + API_PORT }
  };
  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxyReq.on('error', () => res.status(502).json({ error: 'API unavailable' }));
  req.pipe(proxyReq);
}

app.use('/api', (req, res) => proxy(req, res, '/api' + req.url));
app.use('/uploads', (req, res) => proxy(req, res, '/uploads' + req.url));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log('Customer app running on http://localhost:' + PORT);
});
