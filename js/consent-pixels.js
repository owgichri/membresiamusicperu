/*
 * Pixeles de publicidad. Solo se cargan si el visitante acepta las cookies de "Publicidad"
 * en el aviso de cookies. La decisión se guarda en localStorage (djmp_cookies_v1).
 */
(function () {
  var META_PIXEL_ID = '515479114089100';
  var TIKTOK_PIXEL_ID = ''; // Pega aquí tu ID de TikTok Pixel cuando lo tengas.

  var loaded = { meta: false, tiktok: false };

  function loadMeta() {
    if (loaded.meta || !META_PIXEL_ID) return;
    loaded.meta = true;
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('consent', 'grant');
    window.fbq('init', META_PIXEL_ID);
    window.fbq('track', 'PageView');
  }

  function loadTikTok() {
    if (loaded.tiktok || !TIKTOK_PIXEL_ID) return;
    loaded.tiktok = true;
    !function (w, d, t) {
      w.TiktokAnalyticsObject = t; var ttq = w[t] = w[t] || [];
      ttq.methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie', 'holdConsent', 'revokeConsent', 'grantConsent'];
      ttq.setAndDefer = function (o, m) { o[m] = function () { o.push([m].concat(Array.prototype.slice.call(arguments, 0))); }; };
      for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]);
      ttq.load = function (e) {
        var u = 'https://analytics.tiktok.com/i18n/pixel/events.js';
        ttq._i = ttq._i || {}; ttq._i[e] = []; ttq._i[e]._u = u; ttq._t = ttq._t || {}; ttq._t[e] = +new Date();
        var s = d.createElement('script'); s.type = 'text/javascript'; s.async = !0; s.src = u + '?sdkid=' + e + '&lib=' + t;
        var x = d.getElementsByTagName('script')[0]; x.parentNode.insertBefore(s, x);
      };
      ttq.load(TIKTOK_PIXEL_ID); ttq.page();
    }(window, document, 'ttq');
  }

  function apply(rec) {
    if (!rec) return;
    if (rec.publicidad) { loadMeta(); loadTikTok(); }
    else {
      if (window.fbq) window.fbq('consent', 'revoke');
      if (window.ttq && window.ttq.revokeConsent) window.ttq.revokeConsent();
    }
  }

  try { apply(JSON.parse(window.localStorage.getItem('djmp_cookies_v1') || 'null')); } catch (e) {}
  window.addEventListener('djmp-consent', function (e) { apply(e.detail); });

  // Evento útil para anuncios: clic en cualquier botón que abre WhatsApp = "Contact".
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href*="wa.me"]');
    if (!a) return;
    if (window.fbq && loaded.meta) window.fbq('track', 'Contact');
    if (window.ttq && loaded.tiktok) window.ttq.track('Contact');
  }, true);
})();
