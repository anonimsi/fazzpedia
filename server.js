const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const path = require('path');

const config = require('./config');
const orders = require('./orders');
const { assignBuyerId, exposeLocals } = require('./middleware');

const publicRoutes = require('./routes/public');
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');

const app = express();

// Wajib kalau app dijalankan di belakang reverse proxy/load balancer (Nginx, Cloudflare,
// Railway, Render, dll) supaya req.ip & cookie "secure" bekerja benar lewat HTTPS.
app.set('trust proxy', 1);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Header keamanan standar (anti clickjacking, MIME-sniffing, dll).
// CSP dimatikan karena banyak halaman di proyek ini masih pakai inline
// style/onclick - kalau mau CSP ketat, refactor dulu ke event listener terpisah.
app.use(helmet({ contentSecurityPolicy: false }));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(
  session({
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 8, // 8 jam
      sameSite: 'lax',
      secure: config.NODE_ENV === 'production', // wajib HTTPS di production
      httpOnly: true,
    },
  })
);
app.use(express.static(path.join(__dirname, 'public')));

app.use(assignBuyerId);
app.use(exposeLocals);
app.use((req, res, next) => {
  res.locals.shopName = config.SHOP_NAME;
  next();
});

app.use('/', publicRoutes);
app.use('/api', apiRoutes);
app.use('/admin', adminRoutes);

app.use((req, res) => {
  res.status(404).render('404', { title: 'Halaman tidak ditemukan' });
});

// Error handler global - kalau ada query database/dsb yang gagal, tampilkan halaman
// yang wajar alih-alih stack trace mentah ke pengguna.
app.use((err, req, res, next) => {
  console.error('[server error]', err);
  res.status(500).render('404', { title: 'Terjadi kesalahan', message: 'Ada gangguan di server, coba lagi beberapa saat.' });
});

// Sapu berkala invoice yang kadaluarsa tapi tidak pernah di-cek lagi (mis. tab ditutup).
setInterval(() => {
  orders.sweepExpiredOrders().catch((err) => console.error('[sweep] Gagal:', err.message));
}, 60 * 1000);

app.listen(config.PORT, () => {
  console.log(`🎨 ${config.SHOP_NAME} jalan di http://localhost:${config.PORT}`);
});
