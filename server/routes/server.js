const express = require('express');
const os = require('os');

const router = express.Router();

function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

router.get('/info', (req, res) => {
  const ip = getLocalIP();
  const port = req.socket.localPort || 3000;
  res.json({
    ip,
    port,
    localUrl: `http://${ip}:${port}`,
    host: req.headers.host || `localhost:${port}`,
    adminPath: process.env.ADMIN_SECRET_PATH || null,
    customerUrl: '/customer/menu.html'
  });
});

module.exports = router;
