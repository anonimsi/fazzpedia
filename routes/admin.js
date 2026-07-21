const express = require('express');
const router = express.Router();

const db = require('../db');
const { requireAdmin } = require('../middleware');
const { loginRateLimiter, safeCompare, ensureCsrfToken, verifyCsrfToken, ipAllowlist } = require('../security');
const { ADMIN_PASSWORD, SHOP_NAME } = require('../config');
const { formatRupiah, formatDate } = require('../utils');

// Semua route /admin (termasuk halaman login) dibatasi IP allowlist kalau diaktifkan,
// dan selalu punya token CSRF siap pakai di res.locals.csrfToken.
router.use(ipAllowlist);
router.use(ensureCsrfToken);

// ---------- Login ----------

router.get('/login', (req, res) => {
  if (req.session.isAdmin) return res.redirect('/admin');
  res.render('admin/login', { title: `Login Admin — ${SHOP_NAME}`, error: null });
});

router.post('/login', loginRateLimiter, verifyCsrfToken, (req, res) => {
  const { password } = req.body;
  if (!password || !safeCompare(password, ADMIN_PASSWORD)) {
    console.warn(`[security] Percobaan login admin GAGAL dari IP ${req.ip}`);
    return res.status(401).render('admin/login', { title: `Login Admin — ${SHOP_NAME}`, error: 'Password salah.' });
  }
  // Regenerasi session id setelah login berhasil (mencegah session fixation attack).
  req.session.regenerate((err) => {
    if (err) {
      console.error('[security] Gagal regenerasi session:', err.message);
      return res.status(500).render('404', { title: 'Terjadi kesalahan', message: 'Gagal memproses login, coba lagi.' });
    }
    req.session.isAdmin = true;
    res.redirect('/admin');
  });
});

router.post('/logout', verifyCsrfToken, (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

// Semua route di bawah ini butuh login admin + token CSRF untuk method yang mengubah data
router.use(requireAdmin);
router.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  return verifyCsrfToken(req, res, next);
});

// ---------- Dashboard ----------

router.get('/', async (req, res, next) => {
  try {
    const products = await db.listProducts();
    const stockCounts = await Promise.all(products.map((p) => db.getStockCount(p.id)));
    const [pendingOrders, attentionOrders, completedOrders] = await Promise.all([
      db.listOrders({ status: 'pending' }),
      db.listOrders({ status: 'paid_out_of_stock' }),
      db.listOrders({ status: 'completed' }),
    ]);
    const stats = {
      totalProducts: products.length,
      totalStock: stockCounts.reduce((sum, n) => sum + n, 0),
      pending: pendingOrders.length,
      needsAttention: attentionOrders.length,
      completedToday: completedOrders.filter((o) => Date.now() - o.completedAt < 86400000).length,
    };
    res.render('admin/dashboard', { title: `Dashboard Admin — ${SHOP_NAME}`, stats });
  } catch (err) {
    next(err);
  }
});

// ---------- Produk ----------

router.get('/produk', async (req, res, next) => {
  try {
    const products = await db.listProducts();
    const withStock = await Promise.all(products.map(async (p) => ({ ...p, stock: await db.getStockCount(p.id) })));
    res.render('admin/products', { title: `Kelola Produk — ${SHOP_NAME}`, products: withStock, formatRupiah, error: null });
  } catch (err) {
    next(err);
  }
});

router.post('/produk', async (req, res, next) => {
  const { id, name, price, description, bannerUrl } = req.body;
  const trimmedBanner = (bannerUrl || '').trim();

  if (trimmedBanner && !/^https?:\/\//i.test(trimmedBanner)) {
    try {
      const products = await db.listProducts();
      const withStock = await Promise.all(products.map(async (p) => ({ ...p, stock: await db.getStockCount(p.id) })));
      return res.status(400).render('admin/products', {
        title: `Kelola Produk — ${SHOP_NAME}`,
        products: withStock,
        formatRupiah,
        error: 'URL banner harus diawali http:// atau https:// (link gambar langsung/raw).',
      });
    } catch (err) {
      return next(err);
    }
  }

  try {
    await db.addProduct({ id: id.trim(), name: name.trim(), price, description, bannerUrl: trimmedBanner || null });
    res.redirect('/admin/produk');
  } catch (err) {
    try {
      const products = await db.listProducts();
      const withStock = await Promise.all(products.map(async (p) => ({ ...p, stock: await db.getStockCount(p.id) })));
      res.status(400).render('admin/products', { title: `Kelola Produk — ${SHOP_NAME}`, products: withStock, formatRupiah, error: err.message });
    } catch (innerErr) {
      next(innerErr);
    }
  }
});

router.post('/produk/:id/hapus', async (req, res, next) => {
  try {
    await db.deleteProduct(req.params.id);
    res.redirect('/admin/produk');
  } catch (err) {
    next(err);
  }
});

router.post('/produk/:id/banner', async (req, res, next) => {
  const trimmedBanner = (req.body.bannerUrl || '').trim();
  if (trimmedBanner && !/^https?:\/\//i.test(trimmedBanner)) {
    try {
      const products = await db.listProducts();
      const withStock = await Promise.all(products.map(async (p) => ({ ...p, stock: await db.getStockCount(p.id) })));
      return res.status(400).render('admin/products', {
        title: `Kelola Produk — ${SHOP_NAME}`,
        products: withStock,
        formatRupiah,
        error: 'URL banner harus diawali http:// atau https:// (link gambar langsung/raw).',
      });
    } catch (err) {
      return next(err);
    }
  }
  try {
    await db.editProduct(req.params.id, { banner_url: trimmedBanner || null });
    res.redirect('/admin/produk');
  } catch (err) {
    next(err);
  }
});

// ---------- Stok ----------

router.get('/produk/:id/stok', async (req, res, next) => {
  try {
    const product = await db.getProduct(req.params.id);
    if (!product) return res.status(404).render('404', { title: 'Produk tidak ditemukan' });
    const stock = await db.getStock(product.id);
    res.render('admin/stock', { title: `Stok ${product.name} — ${SHOP_NAME}`, product, stock, message: null });
  } catch (err) {
    next(err);
  }
});

router.post('/produk/:id/stok', async (req, res, next) => {
  try {
    const lines = (req.body.lines || '').split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length > 0) await db.addStockLines(req.params.id, lines);
    res.redirect(`/admin/produk/${req.params.id}/stok`);
  } catch (err) {
    next(err);
  }
});

router.post('/produk/:id/stok/:index/edit', async (req, res, next) => {
  try {
    await db.editStockAt(req.params.id, parseInt(req.params.index, 10), req.body.value);
    res.redirect(`/admin/produk/${req.params.id}/stok`);
  } catch (err) {
    next(err);
  }
});

router.post('/produk/:id/stok/:index/hapus', async (req, res, next) => {
  try {
    await db.deleteStockAt(req.params.id, parseInt(req.params.index, 10));
    res.redirect(`/admin/produk/${req.params.id}/stok`);
  } catch (err) {
    next(err);
  }
});

// ---------- Pesanan perlu perhatian ----------

router.get('/pesanan', async (req, res, next) => {
  try {
    const [outOfStock, pending] = await Promise.all([db.listOrders({ status: 'paid_out_of_stock' }), db.listOrders({ status: 'pending' })]);
    const combined = [...outOfStock, ...pending].sort((a, b) => b.createdAt - a.createdAt);
    const list = await Promise.all(combined.map(async (o) => ({ ...o, product: await db.getProduct(o.productId) })));
    res.render('admin/orders', { title: `Pesanan — ${SHOP_NAME}`, orders: list, formatRupiah, formatDate });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
