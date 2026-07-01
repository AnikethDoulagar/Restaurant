const express = require('express');
const QRCode = require('qrcode');

const router = express.Router();

router.get('/', (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'url parameter required' });

  QRCode.toDataURL(url, { width: 300, margin: 1 }, (err, dataUrl) => {
    if (err) return res.status(500).json({ error: 'QR generation failed' });
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    const img = Buffer.from(base64, 'base64');
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(img);
  });
});

module.exports = router;
