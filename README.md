# Premium Shop — Website (Express + EJS + Pakasir QRIS)

Versi website dari bot Telegram auto-order akun premium, dengan tema **neobrutalism biru/terang/abu** bernuansa lukisan (blob cat abstrak, border tebal, shadow keras).

## 1. Fitur

- 🛍️ Katalog produk + detail + pilih jumlah.
- 💳 Auto order: buat invoice QRIS via **Pakasir** → bayar → akun terkirim otomatis di halaman yang sama (polling status tiap 4 detik).
- 📄 "Pesanan Saya" — riwayat dikenali lewat cookie anonim (tanpa akun/login).
- 🔐 Panel admin (login password) — CRUD produk & stok, lihat pesanan yang perlu perhatian.
- 🗄️ **Database Supabase (Postgres)** — data produk/stok/order tersimpan permanen, dengan pengambilan stok yang **atomik** (dua pembeli bayar bersamaan tidak akan pernah dapat akun yang sama).
- 📱 **Nav hamburger** — menu navigasi otomatis jadi tombol hamburger di layar sempit, dan **responsif penuh** di semua ukuran device (HP, tablet, desktop).
- 🖼️ **Banner custom per produk** — admin bisa isi link gambar langsung (raw link, mis. dari `raw.githubusercontent.com`) untuk tiap produk, tampil di kartu katalog & halaman detail.
- 🔤 **FontAwesome** — ikon konsisten di nav, sidebar admin, tombol, dan form.
- 🔐 **Keamanan panel admin**: rate limit percobaan login, token CSRF di semua form yang mengubah data, perbandingan password tahan timing-attack, session di-regenerasi tiap login, header keamanan (Helmet), opsi pembatasan IP.
- 🎨 Tema neobrutalism kustom: border 3px hitam, shadow offset keras, card dengan sudut membulat lembut, tipografi Archivo Black + Space Grotesk + Space Mono, blob cat SVG sebagai elemen dekoratif berulang.

## 2. Struktur Proyek

```
premium-shop-web/
├── server.js          # entry point Express
├── config.js          # baca & validasi .env
├── db.js              # akses database Supabase/Postgres (produk, stok, order)
├── schema.sql         # skema tabel + fungsi pop_stock() - jalankan sekali di Supabase
├── pakasir.js         # wrapper API Pakasir (QRIS)
├── orders.js          # logika invoice, cek status, kirim stok
├── security.js         # rate limit login, CSRF token, timing-safe compare, IP allowlist
├── middleware.js       # auth admin & cookie buyer anonim
├── utils.js            # helper format rupiah/tanggal/label status
├── routes/
│   ├── public.js       # halaman customer (beranda, katalog, invoice, dst)
│   ├── api.js           # endpoint JSON untuk polling status invoice
│   └── admin.js          # login & CRUD admin
├── views/               # semua template EJS (lihat bagian 6)
├── public/css/style.css # tema neobrutalism (+ responsif & hamburger nav)
├── public/js/invoice.js # polling status + countdown di client
├── public/js/nav.js     # toggle menu hamburger
└── (tidak ada data/db.json lagi - semua data di Supabase)
```

## 3. Persiapan

1. **Akun Supabase**: daftar di https://supabase.com → buat Project baru → catat **connection string** database (Project Settings → Database → Connection String → pilih mode **Session** atau **Transaction pooler**, format `postgresql://postgres:[PASSWORD]@...`).
2. Buka **SQL Editor** di dashboard Supabase → paste seluruh isi file `schema.sql` dari proyek ini → jalankan (Run) sekali saja. Ini membuat tabel `products`, `stock_items`, `orders`, dan fungsi `pop_stock()`.
3. **Akun Pakasir**: daftar di https://app.pakasir.com → buat Proyek → catat **Slug** & **API Key**.
4. Siapkan password admin sendiri (bebas, taruh di `.env`).

## 4. Instalasi & Menjalankan

```bash
npm install
cp .env.example .env
# edit .env: DATABASE_URL (dari Supabase), ADMIN_PASSWORD, SESSION_SECRET,
#            PAKASIR_PROJECT, PAKASIR_API_KEY, SHOP_NAME
npm start
```

Buka `http://localhost:3000`. Panel admin di `http://localhost:3000/admin/login`.

Untuk produksi, disarankan pakai `pm2`:
```bash
npm i -g pm2
pm2 start server.js --name premium-shop-web
pm2 save
```

## 5. Database: Kenapa Supabase & Kenapa Atomik?

Stok disimpan sebagai baris individual di tabel `stock_items` (bukan array/JSON), dan pengambilannya (`pop_stock()`) adalah **fungsi SQL** yang berjalan dalam satu transaksi terkunci (`FOR UPDATE SKIP LOCKED`). Ini penting untuk kasus nyata: kalau dua orang bayar produk yang sama **persis bersamaan** dan stok tinggal sedikit, mekanisme ini memastikan:

- Tidak ada dua pembeli yang kebagian akun yang sama (row terkunci saat sedang diproses).
- **All-or-nothing**: kalau stok yang tersedia kurang dari jumlah yang diminta, TIDAK ADA yang diambil sama sekali (bukan "setengah kirim").

Sudah diuji langsung dengan skenario concurrent request sungguhan (bukan cuma dibaca kodenya) — dua "pembeli" simulasi meminta stok bersamaan selalu mendapat item yang berbeda tanpa duplikat.

## 6. Responsif & Nav Hamburger

- Di layar lebar (>860px), menu navigasi tampil sebagai baris tombol horizontal seperti biasa.
- Di layar sempit (≤860px), menu otomatis berubah jadi **tombol hamburger** (☰ → ✕ saat dibuka) yang menampilkan menu sebagai panel dropdown. Menu otomatis tertutup saat: memilih salah satu link, klik di luar area navbar, atau layar diperlebar kembali melewati breakpoint.
- Seluruh halaman (grid produk, form order, tabel admin, sidebar admin, hero) sudah diuji breakpoint-nya supaya tetap enak dilihat dari HP kecil sampai desktop lebar — termasuk sidebar admin yang berubah jadi baris tombol horizontal scroll di HP (bukan menumpuk penuh ke bawah).
- Semua card (produk, stok, invoice, statistik, langkah tutorial) sekarang punya sudut membulat (`border-radius`) — tetap dengan border tebal & shadow keras khas neobrutalism, jadi terasa lebih lembut tanpa kehilangan karakter brutalist-nya.

## 7. Cara Kerja Pembayaran (beda dengan versi bot Telegram)

Bot Telegram harus "push" pesan begitu lunas (makanya perlu polling+retry di background). Di website, pola nya lebih sederhana:

- Halaman invoice (`/invoice/:id`) menjalankan JS (`public/js/invoice.js`) yang **polling** endpoint `GET /api/orders/:id/status` tiap 4 detik.
- Endpoint itu (`orders.js` → `checkAndSync`) mengecek ke Pakasir **hanya saat di-poll** — kalau statusnya `completed`, stok langsung diambil & disimpan di data order (`items`), lalu dikembalikan di response yang sama.
- Front-end mendeteksi perubahan status → `location.reload()` → server merender ulang halaman, sekarang menampilkan akun (karena `order.items` sudah terisi).
- Ada juga sapuan berkala (`setInterval` di `server.js`, tiap 1 menit) yang menandai `expired` invoice yang sudah lewat waktu tapi tidak pernah di-poll lagi (misal tab ditutup sebelum bayar).

Pola ini jauh lebih simpel daripada bot karena tidak perlu server "mendorong" pesan ke user — user (browser) yang aktif menanyakan status.

## 8. Halaman (Views)

| Route | View | Keterangan |
|---|---|---|
| `GET /` | `index.ejs` | Beranda + produk unggulan |
| `GET /produk` | `catalog.ejs` | Semua produk |
| `GET /produk/:id` | `product.ejs` | Detail + form order |
| `GET /invoice/:id` | `invoice.ejs` | QR + status + polling |
| `GET /pesanan-saya` | `my-orders.ejs` | Riwayat (cookie) |
| `GET /tutorial` | `tutorial.ejs` | Panduan 8 langkah |
| `GET /admin/login` | `admin/login.ejs` | Login admin |
| `GET /admin` | `admin/dashboard.ejs` | Statistik ringkas |
| `GET /admin/produk` | `admin/products.ejs` | CRUD produk |
| `GET /admin/produk/:id/stok` | `admin/stock.ejs` | CRUD stok per produk |
| `GET /admin/pesanan` | `admin/orders.ejs` | Pesanan perlu perhatian |

## 9. Tema Desain

- **Warna**: `--ink #0b0b0f` (teks/border), `--canvas #f2f1ec` (kanvas), `--blue #2454ff` (aksen utama), `--blue-deep #12206b` (navy), `--stone #c9cdd3` (abu).
- **Tipografi**: Archivo Black (judul/poster), Space Grotesk (body/UI), Space Mono (kode, harga, invoice).
- **Signature**: blob cat SVG abstrak (`views/partials/paint-blob.ejs`) dipakai berulang sebagai elemen dekoratif, border tebal 3px + shadow offset keras (khas neobrutalism) + sudut membulat (`--radius`/`--radius-sm`) yang "menempel" saat tombol ditekan/hover.
- Semua warna/border/shadow/radius dikontrol lewat CSS custom properties di `public/css/style.css` — gampang diganti kalau mau eksperimen palet atau tingkat kelengkungan lain.

## 10. Keamanan Panel Admin

Panel admin dilindungi berlapis (semua sudah diuji, bukan cuma teori):

- **Rate limit login** (`security.js`) — maks 8 percobaan gagal / 15 menit per IP, setelah itu diblokir sementara (429). Mencegah brute-force password.
- **Token CSRF** (synchronizer token pattern) — setiap form yang mengubah data (login, tambah/hapus produk, tambah/edit/hapus stok, logout) wajib menyertakan token tersembunyi yang cocok dengan session. Mencegah situs lain diam-diam mengirim request atas nama admin yang sedang login.
- **Perbandingan password tahan timing-attack** — pakai `crypto.timingSafeEqual`, bukan `===`/`!==` biasa.
- **Session regeneration** — ID session diganti baru setiap login berhasil (mencegah session fixation attack).
- **Cookie sesi aman** — `httpOnly` selalu aktif, `secure` otomatis aktif kalau `NODE_ENV=production` (wajib HTTPS), `sameSite: lax`.
- **Header keamanan (Helmet)** — anti clickjacking (`X-Frame-Options`), anti MIME-sniffing, dan header standar lain. (Content-Security-Policy sengaja dimatikan karena beberapa halaman masih pakai inline `style`/`onclick`; kalau butuh CSP ketat, refactor dulu ke event listener terpisah.)
- **Opsional: pembatasan IP** — isi `ADMIN_IP_ALLOWLIST` di `.env` (pisah koma) kalau admin selalu akses dari IP tetap, supaya `/admin` langsung 403 buat semua IP lain.
- **Validasi kekuatan password & secret** — server akan memperingatkan (warning di log) kalau `ADMIN_PASSWORD` atau `SESSION_SECRET` masih terlihat lemah/default.

**Checklist tambahan yang tetap perlu Anda lakukan sendiri:**
1. Pastikan deploy pakai **HTTPS** (Railway/Render/Vercel/dsb umumnya otomatis; kalau VPS sendiri, pasang lewat Nginx + Let's Encrypt) dan set `NODE_ENV=production`.
2. Jangan pernah commit file `.env` ke git (sudah ada di `.gitignore`).
3. Ganti `ADMIN_PASSWORD` dan `SESSION_SECRET` dengan nilai acak sendiri (bukan nilai contoh di `.env.example`) — gunakan password manager atau `openssl rand -hex 32` untuk generate.
4. Kalau butuh lebih dari satu admin dengan hak akses berbeda, perlu tambahan sistem user/role (di luar cakupan setup saat ini yang pakai satu password bersama).

## 11. Banner Produk (Raw Link)

Tiap produk bisa punya banner gambar sendiri:

- Saat **tambah produk baru**, isi field "URL Banner (opsional)" dengan link gambar langsung — misalnya raw link dari GitHub (`https://raw.githubusercontent.com/user/repo/main/gambar.jpg`), Imgur, atau hosting gambar lain yang mendukung hotlink.
- Untuk produk yang **sudah ada**, klik tombol "Banner" di tabel produk (halaman `/admin/produk`) untuk isi/ganti bannernya kapan saja.
- URL wajib diawali `http://` atau `https://` — kalau tidak, server menolak dan menampilkan pesan error (mencegah skema berbahaya seperti `javascript:`).
- Banner tampil sebagai thumbnail kecil di kartu katalog/beranda, dan sebagai gambar besar di bagian atas halaman detail produk. Kalau link gambar rusak/tidak bisa dimuat, elemennya otomatis disembunyikan (tidak menampilkan ikon gambar rusak yang jelek).
- Kosongkan field-nya kapan saja untuk menghapus banner (produk kembali tampil tanpa gambar seperti biasa).

## 12. Referensi API Pakasir

- Buat transaksi QRIS: `POST https://app.pakasir.com/api/transactioncreate/qris`
- Cek status: `GET https://app.pakasir.com/api/transactiondetail`
- Batalkan: `POST https://app.pakasir.com/api/transactioncancel`
- Dokumentasi resmi: https://pakasir.com/p/docs
