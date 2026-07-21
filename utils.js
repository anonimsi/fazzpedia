function formatRupiah(n) {
  return `Rp${Number(n).toLocaleString('id-ID')}`;
}

function formatDate(ts) {
  if (!ts) return '-';
  return new Date(ts).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

const STATUS_LABEL = {
  pending: { text: 'Menunggu Pembayaran', tone: 'warn' },
  completed: { text: 'Selesai', tone: 'ok' },
  expired: { text: 'Kadaluarsa', tone: 'muted' },
  cancelled: { text: 'Dibatalkan', tone: 'danger' },
  paid_out_of_stock: { text: 'Dibayar, Stok Habis', tone: 'danger' },
};

module.exports = { formatRupiah, formatDate, STATUS_LABEL };
