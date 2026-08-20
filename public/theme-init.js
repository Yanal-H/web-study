// External pre-paint theme decision so the production CSP does not need
// script-src 'unsafe-inline'.
(function () {
  try {
    var theme = localStorage.getItem('foundation_theme');
    if (!theme) {
      theme = window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches
        ? 'paper'
        : 'midnight';
    }
    document.documentElement.setAttribute('data-theme', theme);
  } catch (_) {
    // The normal app theme logic takes over when storage is unavailable.
  }
})();
