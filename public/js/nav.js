(function () {
  const btn = document.getElementById('navToggle');
  const links = document.getElementById('navLinks');
  if (!btn || !links) return;

  function closeMenu() {
    links.classList.remove('is-open');
    btn.setAttribute('aria-expanded', 'false');
  }

  function toggleMenu() {
    const isOpen = links.classList.toggle('is-open');
    btn.setAttribute('aria-expanded', String(isOpen));
  }

  btn.addEventListener('click', toggleMenu);

  // Tutup menu otomatis kalau layar diperlebar melewati breakpoint mobile
  // (mis. rotasi HP ke landscape / resize window), biar tidak nyangkut terbuka.
  const mq = window.matchMedia('(min-width: 861px)');
  mq.addEventListener('change', (e) => {
    if (e.matches) closeMenu();
  });

  // Tutup menu setelah user memilih salah satu link (biar tidak menutupi konten).
  links.querySelectorAll('a').forEach((a) => a.addEventListener('click', closeMenu));

  // Tutup kalau klik di luar area navbar.
  document.addEventListener('click', (e) => {
    if (!links.classList.contains('is-open')) return;
    if (!e.target.closest('.navbar-inner')) closeMenu();
  });
})();
