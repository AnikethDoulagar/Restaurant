const express = require('express');
const http = require('http');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3002;
const API_HOST = process.env.API_HOST || 'api';
const API_PORT = process.env.API_PORT || 3000;
const CUSTOMER_HOST = process.env.CUSTOMER_HOST || 'customer-app';
const CUSTOMER_PORT = process.env.CUSTOMER_PORT || 3003;
const ADMIN_HOST = process.env.ADMIN_HOST || 'admin-app';
const ADMIN_PORT = process.env.ADMIN_PORT || 3001;

function proxy(req, res, hostname, port, targetPath) {
  const options = {
    hostname, port,
    path: targetPath,
    method: req.method,
    headers: { ...req.headers, host: hostname + ':' + port }
  };
  const proxyReq = http.request(options, (proxyRes) => {
    const forwardHeaders = { ...proxyRes.headers };
    if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && forwardHeaders.location) {
      const loc = forwardHeaders.location;
      if (loc.startsWith('/')) forwardHeaders.location = '/customer' + loc;
    }
    res.writeHead(proxyRes.statusCode, forwardHeaders);
    proxyRes.pipe(res);
  });
  proxyReq.on('error', () => { if (!res.headersSent) res.status(502).json({ error: 'Service unavailable' }); });
  req.pipe(proxyReq);
}

app.use('/api', (req, res) => proxy(req, res, API_HOST, API_PORT, '/api' + req.url));
app.use('/uploads', (req, res) => proxy(req, res, API_HOST, API_PORT, '/uploads' + req.url));
app.use('/customer', (req, res) => proxy(req, res, CUSTOMER_HOST, CUSTOMER_PORT, req.url));
app.use('/admin', (req, res) => proxy(req, res, ADMIN_HOST, ADMIN_PORT, req.url));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log('Owner app running on http://localhost:' + PORT);
});
