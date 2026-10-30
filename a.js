/* Lampa. Anime Filler: Online_Mod / Kodik test installer v0.5.0-kodik.2. */
/* Lampa. Extension checker expects this API marker in downloaded JS. */
(function () {
  'use strict';
  if (window.lampa_anime_filler_loaded || document.getElementById('laf-install-loader')) return;
  var script = document.createElement('script');
  script.id = 'laf-install-loader';
  script.src = 'https://cdn.jsdelivr.net/gh/nMagic/lampa-anime-filler@kodik-test/lampa-anime-filler.js?v=0.5.0-kodik.2';
  script.async = true;
  script.onerror = function () { console.error('[Anime Filler] Unable to load plugin script'); };
  (document.head || document.documentElement).appendChild(script);
})();
