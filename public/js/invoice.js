(function () {
  const card = document.getElementById('invoiceCard');
  if (!card) return;

  const orderId = card.dataset.orderId;
  let status = card.dataset.status;
  const expiredAt = Number(card.dataset.expiredAt);

  const countdownEl = document.getElementById('countdown');
  const cancelForm = document.getElementById('cancelForm');

  // ---------- Hitung mundur kadaluarsa ----------
  function tickCountdown() {
    if (!countdownEl) return;
    const remaining = expiredAt - Date.now();
    if (remaining <= 0) {
      countdownEl.textContent = '00:00';
      location.reload(); // biarkan server render ulang status "kadaluarsa"
      return;
    }
    const totalSec = Math.floor(remaining / 1000);
    const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const ss = String(totalSec % 60).padStart(2, '0');
    countdownEl.textContent = `${mm}:${ss}`;
  }

  // ---------- Poll status pembayaran ----------
  async function pollStatus() {
    if (status !== 'pending') return;
    try {
      const res = await fetch(`/api/orders/${orderId}/status`);
      if (!res.ok) return; // jaringan/Pakasir lagi bermasalah, coba lagi di interval berikutnya
      const data = await res.json();
      if (data.status && data.status !== status) {
        // Status berubah (lunas/kadaluarsa/dibatalkan) - reload supaya server render tampilan final
        // (termasuk daftar akun kalau sudah lunas), tanpa perlu duplikasi logika render di JS.
        location.reload();
      }
    } catch {
      // diamkan, coba lagi di interval berikutnya
    }
  }

  if (status === 'pending') {
    setInterval(tickCountdown, 1000);
    tickCountdown();
    setInterval(pollStatus, 4000);
  }

  // ---------- Batalkan pesanan ----------
  if (cancelForm) {
    cancelForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('cancelBtn');
      btn.disabled = true;
      btn.textContent = 'Membatalkan...';
      try {
        await fetch(cancelForm.action, { method: 'POST' });
      } catch {
        // tetap reload walau request gagal, biar user lihat status terbaru dari server
      }
      location.reload();
    });
  }
})();
