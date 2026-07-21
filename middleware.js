const crypto = require('crypto');

// Setiap pengunjung dapat cookie buyer_id anonim (bukan akun) supaya bisa lihat
// riwayat pesanannya sendiri tanpa perlu daftar/login.
function assignBuyerId(req, res, next) {
  let buyerId = req.cookies.buyer_id;
  if (!buyerId) {
    buyerId = crypto.randomUUID();
    res.cookie('buyer_id', buyerId, { maxAge: 1000 * 60 * 60 * 24 * 365, httpOnly: true, sameSite: 'lax' });
  }
  req.buyerId = buyerId;
  next();
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.redirect('/admin/login');
}

// Dipakai di semua view supaya tidak perlu passing manual tiap render.
function exposeLocals(req, res, next) {
  res.locals.isAdmin = !!(req.session && req.session.isAdmin);
  res.locals.currentPath = req.path;
  next();
}

module.exports = { assignBuyerId, requireAdmin, exposeLocals };
