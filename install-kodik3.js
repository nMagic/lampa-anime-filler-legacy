/* Lampa. Anime Filler: cache-safe Online_Mod / Kodik test installer 0.5.0-kodik.3. */
(function () {
  'use strict';
  var target = '0.5.0-kodik.3';
  if (window.LampaAnimeFiller && window.LampaAnimeFiller.version === target) return;

  // An older build cannot be safely unloaded because it has already registered
  // Lampa listeners. A full app restart will leave only the currently installed URL.
  if (window.LampaAnimeFiller || window.lampa_anime_filler_loaded) {
    console.warn('[Anime Filler] Restart Lampa to replace the active older build with ' + target);
    return;
  }

  if (document.getElementById('laf-kodik3-install-loader')) return;
  var script = document.createElement('script');
  script.id = 'laf-kodik3-install-loader';
  script.src = 'https://cdn.jsdelivr.net/gh/nMagic/lampa-anime-filler@ab2835a7cee8ab1ac3e66b9269ee1389165b0fcf/lampa-anime-filler.js';
  script.async = true;
  script.onerror = function () { console.error('[Anime Filler] Unable to load cache-safe Kodik build'); };
  (document.head || document.documentElement).appendChild(script);
})();
