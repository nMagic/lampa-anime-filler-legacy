/* Lampa. Anime Filler: synchronous Online_Mod / Kodik test installer 0.5.0-kodik.5. */
(function () {
  'use strict';
  var target = '0.5.0-kodik.5';
  if (window.LampaAnimeFiller && window.LampaAnimeFiller.version === target) return;
  if (window.LampaAnimeFiller || window.lampa_anime_filler_loaded) {
    console.warn('[Anime Filler] Restart Lampa to replace the active older build with ' + target);
    return;
  }
  if (document.getElementById('laf-kodik5-install-loader')) return;
  var script = document.createElement('script');
  script.id = 'laf-kodik5-install-loader';
  script.src = 'https://cdn.jsdelivr.net/gh/nMagic/lampa-anime-filler@kodik-test/lampa-anime-filler-kodik5.js';
  script.async = true;
  script.onerror = function () { console.error('[Anime Filler] Unable to load synchronous Kodik build'); };
  (document.head || document.documentElement).appendChild(script);
})();
