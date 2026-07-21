// Logika order & pembayaran. Front-end nge-poll endpoint status tiap beberapa
// detik, dan pengecekan ke Pakasir + pengiriman akun terjadi di dalam request
// itu sendiri (idempotent - stok cuma diambil sekali, lihat pop_stock di db.js).

const QRCode = require('qrcode');
const db = require('./db');
const pakasir = require('./pakasir');
const { ORDER_EXPIRY_MINUTES } = require('./config');

async function createInvoice({ buyerId, productId, qty }) {
  const product = await db.getProduct(productId);
  if (!product) throw new Error('Produk tidak ditemukan.');

  const available = await db.getStockCount(productId);
  if (available < qty) throw new Error(`Stok "${product.name}" tersisa ${available}, tidak cukup untuk ${qty} pcs.`);

  const amount = product.price * qty;
  const order = await db.createOrder({ buyerId, productId, qty, amount });

  let payment;
  try {
    payment = await pakasir.createQrisTransaction(order.orderId, amount);
  } catch (err) {
    await db.updateOrder(order.orderId, { status: 'cancelled' });
    throw err;
  }

  const expiredAt = payment.expired_at ? new Date(payment.expired_at) : new Date(Date.now() + ORDER_EXPIRY_MINUTES * 60000);
  await db.updateOrder(order.orderId, {
    paymentNumber: payment.payment_number,
    expiredAt: expiredAt.getTime(),
    totalPayment: payment.total_payment || amount,
  });

  return db.getOrder(order.orderId);
}

async function getQrDataUrl(paymentNumber) {
  return QRCode.toDataURL(paymentNumber, { width: 480, margin: 1 });
}

/**
 * Dipanggil setiap kali front-end poll status. Kalau order pending & belum expired,
 * cek ke Pakasir. Kalau completed, alokasikan stok (sekali saja) lalu return itemnya.
 */
async function checkAndSync(orderId) {
  const order = await db.getOrder(orderId);
  if (!order) return null;
  if (order.status !== 'pending') return order;

  if (Date.now() > order.expiredAt) {
    await db.updateOrder(orderId, { status: 'expired' });
    pakasir.cancelTransaction(orderId, order.amount).catch(() => {});
    return db.getOrder(orderId);
  }

  const detail = await pakasir.getTransactionDetail(orderId, order.amount);
  if (detail.status === 'completed') return deliverOrder(orderId);

  return order;
}

async function deliverOrder(orderId) {
  const order = await db.getOrder(orderId);
  if (!order || order.status !== 'pending') return order;

  try {
    const items = await db.popStock(order.productId, order.qty);
    return db.updateOrder(orderId, { status: 'completed', completedAt: Date.now(), items });
  } catch {
    return db.updateOrder(orderId, { status: 'paid_out_of_stock' });
  }
}

async function cancelOrder(orderId) {
  const order = await db.getOrder(orderId);
  if (!order || order.status !== 'pending') return order;
  const updated = await db.updateOrder(orderId, { status: 'cancelled' });
  pakasir.cancelTransaction(orderId, order.amount).catch(() => {});
  return updated;
}

async function sweepExpiredOrders() {
  const pending = await db.listOrders({ status: 'pending' });
  for (const order of pending) {
    if (Date.now() > order.expiredAt) {
      await db.updateOrder(order.orderId, { status: 'expired' });
      pakasir.cancelTransaction(order.orderId, order.amount).catch(() => {});
    }
  }
}

module.exports = { createInvoice, getQrDataUrl, checkAndSync, cancelOrder, sweepExpiredOrders };
