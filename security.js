const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { ADMIN_IP_ALLOWLIST } = require('./config');

// ---------- Rate limit percobaan login ----------
// Maks 8 percobaan per 15 menit per IP. Setelah itu diblokir sementara (429),
// supaya password admin tidak bisa di-brute-force tanpa batas.
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak percobaan login. Coba lagi beberapa menit lagi.' },
  handler: (req, res) => {
    console.warn(`[security] Login admin diblokir sementara (rate limit) dari IP ${req.ip}`);
    res.status(429).render('admin/login', {
      title: 'Terlalu Banyak Percobaan',
      error: 'Terlalu banyak percobaan login gagal. Coba lagi dalam beberapa menit.',
    });
  },
});

// ---------- Perbandingan password tahan timing-attack ----------
// String.prototype !== membandingkan karakter demi karakter dan berhenti di
// ketidakcocokan pertama, sehingga waktu eksekusinya bisa membocorkan info
// (secara teori) tentang seberapa banyak karakter awal yang benar. timingSafeEqual
// selalu makan waktu yang sama terlepas dari isinya.
function safeCompare(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    // Tetap jalankan timingSafeEqual (dengan buffer dummy sepanjang bufA) supaya
    // durasi total tidak membocorkan info dari perbedaan panjang string.
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

// ---------- Token CSRF (synchronizer token pattern) ----------
// Token acak disimpan di session, wajib disertakan (field tersembunyi `_csrf`)
// di setiap form yang mengubah data. Mencegah situs lain diam-diam mengirim
// request atas nama admin yang sedang login (cross-site request forgery).
function ensureCsrfToken(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
}

function verifyCsrfToken(req, res, next) {
  const tokenFromForm = req.body && req.body._csrf;
  const tokenInSession = req.session && req.session.csrfToken;
  if (tokenFromForm && tokenInSession && safeCompare(tokenFromForm, tokenInSession)) {
    return next();
  }
  console.warn(`[security] Token CSRF tidak valid/hilang dari IP ${req.ip} pada ${req.method} ${req.originalUrl}`);
  return res.status(403).render('404', { title: 'Ditolak', message: 'Sesi form sudah tidak valid, silakan muat ulang halaman dan coba lagi.' });
}

// ---------- Pembatasan IP (opsional) ----------
// Kalau ADMIN_IP_ALLOWLIST diisi di .env, hanya IP di daftar itu yang boleh
// mengakses /admin sama sekali (selain itu langsung 403, bahkan sebelum halaman login).
function ipAllowlist(req, res, next) {
  if (ADMIN_IP_ALLOWLIST.length === 0) return next(); // fitur tidak diaktifkan
  const clientIp = req.ip.replace('::ffff:', ''); // normalisasi IPv4-mapped IPv6
  if (ADMIN_IP_ALLOWLIST.includes(clientIp)) return next();
  console.warn(`[security] Akses /admin ditolak - IP ${clientIp} tidak ada di ADMIN_IP_ALLOWLIST`);
  return res.status(403).render('404', { title: 'Akses Ditolak', message: 'Alamat IP Anda tidak diizinkan mengakses halaman ini.' });
}

module.exports = { loginRateLimiter, safeCompare, ensureCsrfToken, verifyCsrfToken, ipAllowlist };
