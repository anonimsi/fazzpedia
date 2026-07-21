const express = require('express');
const router = express.Router();

const db = require('../db');
const orders = require('../orders');
const { SHOP_NAME } = require('../config');
const { formatRupiah, formatDate, STATUS_LABEL } = require('../utils');

router.get('/', async (req, res, next) => {
  try {
    const products = await db.listProducts();
    const withStock = await Promise.all(products.map(async (p) => ({ ...p, stock: await db.getStockCount(p.id) })));
    res.render('index', { title: SHOP_NAME, products: withStock.slice(0, 6) });
  } catch (err) {
    next(err);
  }
});

router.get('/produk', async (req, res, next) => {
  try {
    const products = await db.listProducts();
    const withStock = await Promise.all(products.map(async (p) => ({ ...p, stock: await db.getStockCount(p.id) })));
    res.render('catalog', { title: `Katalog — ${SHOP_NAME}`, products: withStock });
  } catch (err) {
    next(err);
  }
});

router.get('/produk/:id', async (req, res, next) => {
  try {
    const product = await db.getProduct(req.params.id);
    if (!product) return res.status(404).render('404', { title: 'Tidak ditemukan' });
    const stock = await db.getStockCount(product.id);
    res.render('product', { title: `${product.name} — ${SHOP_NAME}`, product, stock, formatRupiah });
  } catch (err) {
    next(err);
  }
});

router.post('/order', async (req, res, next) => {
  const { productId, qty } = req.body;
  const qtyNum = Math.max(1, parseInt(qty, 10) || 1);

  try {
    const order = await orders.createInvoice({ buyerId: req.buyerId, productId, qty: qtyNum });
    res.redirect(`/invoice/${order.orderId}`);
  } catch (err) {
    try {
      const product = await db.getProduct(productId);
      res.status(400).render('product', {
        title: `${product ? product.name : 'Produk'} — ${SHOP_NAME}`,
        product,
        stock: product ? await db.getStockCount(product.id) : 0,
        formatRupiah,
        error: err.message,
      });
    } catch (innerErr) {
      next(innerErr);
    }
  }
});

router.get('/invoice/:id', async (req, res, next) => {
  try {
    const order = await db.getOrder(req.params.id);
    if (!order) return res.status(404).render('404', { title: 'Invoice tidak ditemukan' });

    const product = await db.getProduct(order.productId);
    let qrDataUrl = null;
    if (order.status === 'pending' && order.paymentNumber) {
      qrDataUrl = await orders.getQrDataUrl(order.paymentNumber);
    }

    res.render('invoice', {
      title: `Invoice ${order.orderId} — ${SHOP_NAME}`,
      order,
      product,
      qrDataUrl,
      formatRupiah,
      formatDate,
      STATUS_LABEL,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/pesanan-saya', async (req, res, next) => {
  try {
    const rawList = await db.listOrders({ buyerId: req.buyerId });
    const list = await Promise.all(
      rawList.sort((a, b) => b.createdAt - a.createdAt).map(async (o) => ({ ...o, product: await db.getProduct(o.productId) }))
    );
    res.render('my-orders', { title: `Pesanan Saya — ${SHOP_NAME}`, orders: list, formatRupiah, formatDate, STATUS_LABEL });
  } catch (err) {
    next(err);
  }
});

router.get('/tutorial', (req, res) => {
  res.render('tutorial', { title: `Cara Order — ${SHOP_NAME}` });
});

module.exports = router;
