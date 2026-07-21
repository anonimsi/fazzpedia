// Wrapper tipis untuk API Pakasir (https://pakasir.com/p/docs) - khusus metode QRIS.

const { PAKASIR_BASE_URL, PAKASIR_PROJECT, PAKASIR_API_KEY } = require('./config');

async function createQrisTransaction(orderId, amount) {
  const res = await fetch(`${PAKASIR_BASE_URL}/api/transactioncreate/qris`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project: PAKASIR_PROJECT, order_id: orderId, amount, api_key: PAKASIR_API_KEY }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.payment) throw new Error(data.message || `Gagal membuat transaksi Pakasir (HTTP ${res.status})`);
  return data.payment; // { payment_number, total_payment, expired_at, ... }
}

async function getTransactionDetail(orderId, amount) {
  const url = new URL(`${PAKASIR_BASE_URL}/api/transactiondetail`);
  url.searchParams.set('project', PAKASIR_PROJECT);
  url.searchParams.set('amount', String(amount));
  url.searchParams.set('order_id', orderId);
  url.searchParams.set('api_key', PAKASIR_API_KEY);
  const res = await fetch(url.toString());
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.transaction) throw new Error(data.message || `Gagal mengambil detail transaksi (HTTP ${res.status})`);
  return data.transaction; // { status: 'pending' | 'completed', ... }
}

async function cancelTransaction(orderId, amount) {
  const res = await fetch(`${PAKASIR_BASE_URL}/api/transactioncancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project: PAKASIR_PROJECT, order_id: orderId, amount, api_key: PAKASIR_API_KEY }),
  });
  return res.json().catch(() => ({}));
}

module.exports = { createQrisTransaction, getTransactionDetail, cancelTransaction };
