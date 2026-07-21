// Lapisan akses data. Terhubung ke Postgres (Supabase) lewat koneksi langsung
// (bukan REST API) supaya operasi "ambil stok" bisa atomik lewat fungsi SQL
// pop_stock() - lihat schema.sql untuk detail & alasannya.

const { Pool } = require('pg');
const { DATABASE_URL } = require('./config');

// Supabase (dan kebanyakan Postgres hosted lain) mewajibkan SSL, kecuali kalau
// nyambung ke Postgres lokal (mis. saat development/testing di komputer sendiri).
const isLocal = /localhost|127\.0\.0\.1/.test(DATABASE_URL);
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  console.error('[db] Koneksi pool error tak terduga:', err.message);
});

function mapProductRow(row) {
  return { id: row.id, name: row.name, price: Number(row.price), description: row.description, bannerUrl: row.banner_url || null };
}

function mapOrderRow(row) {
  return {
    orderId: row.order_id,
    buyerId: row.buyer_id,
    productId: row.product_id,
    qty: row.qty,
    amount: Number(row.amount),
    totalPayment: row.total_payment !== null ? Number(row.total_payment) : null,
    status: row.status,
    paymentNumber: row.payment_number,
    expiredAt: row.expired_at ? new Date(row.expired_at).getTime() : null,
    items: row.items || null,
    createdAt: new Date(row.created_at).getTime(),
    completedAt: row.completed_at ? new Date(row.completed_at).getTime() : null,
  };
}

// ---------- Produk ----------

async function listProducts() {
  const { rows } = await pool.query('SELECT * FROM products ORDER BY created_at ASC');
  return rows.map(mapProductRow);
}

async function getProduct(id) {
  const { rows } = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
  return rows[0] ? mapProductRow(rows[0]) : undefined;
}

async function addProduct({ id, name, price, description, bannerUrl }) {
  try {
    await pool.query('INSERT INTO products (id, name, price, description, banner_url) VALUES ($1, $2, $3, $4, $5)', [
      id,
      name,
      Number(price),
      description || '-',
      bannerUrl || null,
    ]);
  } catch (err) {
    if (err.code === '23505') throw new Error('Kode produk sudah dipakai, gunakan kode lain.');
    throw err;
  }
}

const EDITABLE_PRODUCT_COLUMNS = new Set(['name', 'price', 'description', 'banner_url']);

async function editProduct(id, fields) {
  const sets = [];
  const values = [];
  let i = 1;
  for (const [key, value] of Object.entries(fields)) {
    if (!EDITABLE_PRODUCT_COLUMNS.has(key)) {
      throw new Error(`Kolom "${key}" tidak diizinkan untuk diubah.`);
    }
    sets.push(`${key} = $${i}`);
    values.push(value);
    i++;
  }
  if (sets.length === 0) return;
  values.push(id);
  await pool.query(`UPDATE products SET ${sets.join(', ')} WHERE id = $${i}`, values);
}

async function deleteProduct(id) {
  await pool.query('DELETE FROM products WHERE id = $1', [id]); // stock_items ikut terhapus (ON DELETE CASCADE)
}

// ---------- Stok ----------

async function getStock(productId) {
  const { rows } = await pool.query('SELECT content FROM stock_items WHERE product_id = $1 ORDER BY id ASC', [productId]);
  return rows.map((r) => r.content);
}

async function getStockCount(productId) {
  const { rows } = await pool.query('SELECT count(*)::int AS count FROM stock_items WHERE product_id = $1', [productId]);
  return rows[0].count;
}

async function addStockLines(productId, lines) {
  const values = [];
  const placeholders = lines.map((line, i) => {
    values.push(productId, line);
    return `($${i * 2 + 1}, $${i * 2 + 2})`;
  });
  await pool.query(`INSERT INTO stock_items (product_id, content) VALUES ${placeholders.join(', ')}`, values);
  return getStockCount(productId);
}

// `index` di sini 0-based mengikuti urutan tampil (id ASC), dipakai dari admin UI.
async function findStockIdAt(productId, index) {
  const { rows } = await pool.query('SELECT id, content FROM stock_items WHERE product_id = $1 ORDER BY id ASC OFFSET $2 LIMIT 1', [
    productId,
    index,
  ]);
  if (!rows[0]) throw new Error('Nomor stok tidak valid.');
  return rows[0];
}

async function deleteStockAt(productId, index) {
  const row = await findStockIdAt(productId, index);
  await pool.query('DELETE FROM stock_items WHERE id = $1', [row.id]);
  return row.content;
}

async function editStockAt(productId, index, newValue) {
  const row = await findStockIdAt(productId, index);
  await pool.query('UPDATE stock_items SET content = $1 WHERE id = $2', [newValue, row.id]);
  return row.content;
}

// Ambil `qty` stok TERLAMA secara atomik (lihat fungsi pop_stock di schema.sql).
// All-or-nothing: kalau stok kurang dari qty, tidak ada yang diambil sama sekali.
async function popStock(productId, qty) {
  const { rows } = await pool.query('SELECT content FROM pop_stock($1, $2)', [productId, qty]);
  if (rows.length < qty) throw new Error('Stok tidak mencukupi.');
  return rows.map((r) => r.content);
}

// ---------- Order ----------

function genOrderId() {
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `INV${Date.now()}${rand}`;
}

async function createOrder({ buyerId, productId, qty, amount }) {
  const orderId = genOrderId();
  const { rows } = await pool.query(
    `INSERT INTO orders (order_id, buyer_id, product_id, qty, amount, status)
     VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING *`,
    [orderId, buyerId, productId, qty, amount]
  );
  return mapOrderRow(rows[0]);
}

async function getOrder(orderId) {
  const { rows } = await pool.query('SELECT * FROM orders WHERE order_id = $1', [orderId]);
  return rows[0] ? mapOrderRow(rows[0]) : undefined;
}

const FIELD_TO_COLUMN = {
  status: 'status',
  paymentNumber: 'payment_number',
  expiredAt: 'expired_at',
  totalPayment: 'total_payment',
  items: 'items',
  completedAt: 'completed_at',
};

async function updateOrder(orderId, fields) {
  const sets = [];
  const values = [];
  let i = 1;
  for (const [key, value] of Object.entries(fields)) {
    const column = FIELD_TO_COLUMN[key];
    if (!column) continue;
    if (key === 'expiredAt' || key === 'completedAt') {
      sets.push(`${column} = to_timestamp($${i}::double precision / 1000)`);
      values.push(value);
    } else if (key === 'items') {
      sets.push(`${column} = $${i}::jsonb`);
      values.push(JSON.stringify(value));
    } else {
      sets.push(`${column} = $${i}`);
      values.push(value);
    }
    i++;
  }
  if (sets.length === 0) return getOrder(orderId);
  values.push(orderId);
  const { rows } = await pool.query(`UPDATE orders SET ${sets.join(', ')} WHERE order_id = $${i} RETURNING *`, values);
  return rows[0] ? mapOrderRow(rows[0]) : null;
}

async function listOrders({ status, buyerId } = {}) {
  const conditions = [];
  const values = [];
  let i = 1;
  if (status) {
    conditions.push(`status = $${i}`);
    values.push(status);
    i++;
  }
  if (buyerId) {
    conditions.push(`buyer_id = $${i}`);
    values.push(buyerId);
    i++;
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(`SELECT * FROM orders ${where} ORDER BY created_at DESC`, values);
  return rows.map(mapOrderRow);
}

module.exports = {
  pool,
  listProducts,
  getProduct,
  addProduct,
  editProduct,
  deleteProduct,
  getStock,
  getStockCount,
  addStockLines,
  deleteStockAt,
  editStockAt,
  popStock,
  createOrder,
  getOrder,
  updateOrder,
  listOrders,
};
