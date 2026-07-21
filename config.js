require('dotenv').config();

const config = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT || 3000),
  DATABASE_URL: process.env.DATABASE_URL,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  SESSION_SECRET: process.env.SESSION_SECRET || 'ganti-secret-ini',
  // Opsional: batasi akses /admin hanya dari IP tertentu, pisahkan dengan koma.
  // Kosongkan kalau tidak ingin membatasi (mis. karena admin akses dari IP dinamis).
  ADMIN_IP_ALLOWLIST: (process.env.ADMIN_IP_ALLOWLIST || '')
    .split(',')
    .map((ip) => ip.trim())
    .filter(Boolean),
  PAKASIR_PROJECT: process.env.PAKASIR_PROJECT,
  PAKASIR_API_KEY: process.env.PAKASIR_API_KEY,
  PAKASIR_BASE_URL: 'https://app.pakasir.com',
  ORDER_EXPIRY_MINUTES: Number(process.env.ORDER_EXPIRY_MINUTES || 15),
  SHOP_NAME: process.env.SHOP_NAME || 'Premium Shop',
};

if (!config.DATABASE_URL) {
  console.error('❌ DATABASE_URL belum diatur di file .env (koneksi database Supabase/Postgres)');
  process.exit(1);
}

if (!config.ADMIN_PASSWORD) {
  console.error('❌ ADMIN_PASSWORD belum diatur di file .env');
  process.exit(1);
}

const WEAK_PASSWORDS = ['admin', 'password', '123456', 'gantidenganpasswordkuat', 'admin123'];
if (config.ADMIN_PASSWORD.length < 12 || WEAK_PASSWORDS.includes(config.ADMIN_PASSWORD.toLowerCase())) {
  console.warn(
    '⚠️  ADMIN_PASSWORD terlihat lemah atau masih nilai contoh. Ganti dengan password acak minimal 12 karakter ' +
      '(kombinasi huruf besar/kecil, angka, simbol) sebelum dipakai di production.'
  );
}

if (config.SESSION_SECRET === 'ganti-secret-ini') {
  console.warn('⚠️  SESSION_SECRET masih nilai default. Ganti dengan string acak panjang di .env sebelum production.');
}

if (!config.PAKASIR_PROJECT || !config.PAKASIR_API_KEY) {
  console.error('❌ PAKASIR_PROJECT / PAKASIR_API_KEY belum diatur di file .env');
  process.exit(1);
}

module.exports = config;
