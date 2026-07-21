const express = require('express');
const router = express.Router();

const orders = require('../orders');

router.get('/orders/:id/status', async (req, res) => {
  try {
    const order = await orders.checkAndSync(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order tidak ditemukan' });
    res.json({
      orderId: order.orderId,
      status: order.status,
      items: order.items || null,
      expiredAt: order.expiredAt,
    });
  } catch (err) {
    // Gagal cek ke Pakasir (jaringan dsb) - jangan ubah status, biar client coba poll lagi nanti.
    res.status(502).json({ error: err.message });
  }
});

router.post('/orders/:id/cancel', async (req, res) => {
  try {
    const order = await orders.cancelOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order tidak ditemukan' });
    res.json({ orderId: order.orderId, status: order.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
