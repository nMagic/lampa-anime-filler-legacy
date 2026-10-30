const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'lampa-anime-filler.js'), 'utf8');

function flushPromises() {
  return new Promise(resolve => setImmediate(resolve));
}

async function flushMany(count = 8) {
  for (let index = 0; index < count; index++) await flushPromises();
}

function bundleFixture(options = {}) {
  const base = 'https://cdn.jsdelivr.net/gh/nMagic/lampa-anime-filler@kodik-test/data/generated/v1';
  const episodes = {};
  for (let number = 1; number <= 55; number++) episodes[number] = number === 55 ? 'filler' : 'canon';
  const shard = {
    schemaVersion: 1,
    id: 'skipthefiller:one-piece',
    identity: { mediaType: 'series', title: 'One Piece', aliases: ['Ван-Пис'], ids: { tmdbTv: 37854 } },
    numbering: { scope: 'regular', basis: 'absolute', startsAt: 1, seasonOffsets: { 1: 0 } },
    classification: { sourceId: 'skipthefiller', sourceRevision: 'fixture', sourceUrl: 'https://example.test/one-piece' },
    counts: { canon: 54, manga_canon: 0, anime_canon: 0, filler: 1, mixed: 0 },
    episodes
  };
  const shardText = JSON.stringify(shard);
  const shardHash = crypto.createHash('sha256').update(shardText).digest('hex');
  const index = { schemaVersion: 1, titles: [{
    id: shard.id, slug: 'one-piece', title: 'One Piece', aliases: ['Ван-Пис'], ids: { tmdbTv: 37854 },
    episodeCount: 55, counts: shard.counts, shard: 'titles/one-piece.json', sha256: shardHash
  }] };
  const indexText = JSON.stringify(index);
  const indexHash = crypto.createHash('sha256').update(indexText).digest('hex');
  const manifest = {
    schemaVersion: 1, buildId: 'skipthefiller-fixture', generatedAt: '2026-10-22T00:00:00.000Z',
    sources: [{ id: 'skipthefiller', name: 'SkipTheFiller', url: 'https://example.test', revision: 'fixture',
      license: 'CC BY 4.0', attribution: 'Fixture' }],
    catalog: { index: 'index.json', sha256: indexHash, titleCount: 1, episodeCount: 55,
      shardPattern: 'titles/{slug}.json' }, validation: {}
  };
  const responses = new Map([
    [base + '/manifest.json', JSON.stringify(manifest)],
    [base + '/index.json', options.corruptIndex ? indexText + ' ' : indexText],
    [base + '/titles/one-piece.json', options.corruptShard ? shardText + ' ' : shardText]
  ]);
  return { base, manifest, index, shard, responses };
}

function fakeNode() {
  const attributes = new Map();
  const children = [];
  return {
    nodeType: 1,
    textContent: '',
    style: {},
    className: '',
    children,
    classList: {
      values: new Set(),
      add(value) { this.values.add(value); },
      remove(value) { this.values.delete(value); },
      toggle(value, force) {
        if (force) this.values.add(value);
        else this.values.delete(value);
      }
    },
    appendChild(child) { child.parentNode = this; children.push(child); },
    setAttribute(key, value) { attributes.set(key, String(value)); },
    getAttribute(key) { return attributes.has(key) ? attributes.get(key) : null; },
    querySelector(selector) {
      if (selector === '.laf-badge') return children.find(child => child.className === 'laf-badge') || null;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '.laf-badge') return children.filter(child => child.className === 'laf-badge');
      return [];
    },
    closest() { return null; },
    cloneNode() { const clone = fakeNode(); clone.textContent = this.textContent; return clone; },
    remove() {
      if (!this.parentNode) return;
      const index = this.parentNode.children.indexOf(this);
      if (index >= 0) this.parentNode.children.splice(index, 1);
    }
  };
}

function createHarness(options = {}) {
  const listeners = Object.create(null);
  const storage = new Map(Object.entries(options.storage || {}));
  const templates = [];
  const quietConsole = { debug() {}, error() {}, log() {} };
  const document = {
    head: { appendChild() {} },
    body: null,
    createElement() { return fakeNode(); },
    querySelector() { return null; },
    querySelectorAll(selector) {
      if (selector === '.laf-badge' || selector === '.laf-filler') return [];
      if (String(selector).includes('.online')) return templates.map(entry => entry.node);
      return [];
    }
  };
  const context = {
    window: {
      appready: true,
      console: quietConsole,
      $: node => ({ jquery: '1.0', 0: node, find() { return []; } })
    },
    document,
    MutationObserver: function MutationObserver() { this.observe = function observe() {}; },
    Lampa: {
      Reguest: options.Reguest,
      SettingsApi: { addComponent() {}, addParam() {} },
      Listener: { follow(name, callback) { (listeners[name] ||= []).push(callback); } },
      Template: { get(name) {
        const node = fakeNode();
        templates.push({ name, node });
        return { jquery: '1.0', 0: node };
      } },
      Modal: { open() {}, close() {} },
      Controller: { toggle() {} },
      Storage: {
        get(name, fallback) { return storage.has(name) ? storage.get(name) : fallback; },
        set(name, value) { storage.set(name, value); }
      }
    },
    console: quietConsole,
    setTimeout,
    clearTimeout,
    Date,
    Promise,
    fetch: options.fetch || (() => Promise.reject(new Error('unexpected fetch')))
  };
  vm.runInNewContext(options.source || source, context);
  return {
    api: context.window.LampaAnimeFiller,
    context,
    listeners,
    storage,
    templates
  };
}

test('normalizes supported classifications and ignores malformed entries', () => {
  const { api } = createHarness();
  const guide = api.normalizeGuide({
    slug: 'fixture',
    episodes: [
      { number: 1, type: 'Manga Canon' },
      { number: 2, type: 'Mixed Canon/Filler' },
      { number: 3, type: 'Filler' },
      { number: 0, type: 'Filler' },
      { number: 4, type: 'Unknown' }
    ]
  }, 'fixture source');
  assert.equal(guide.episodes[1], 'manga_canon');
  assert.equal(guide.episodes[2], 'mixed');
  assert.equal(guide.episodes[3], 'filler');
  assert.equal(guide.episodes[0], undefined);
  assert.equal(guide.episodes[4], undefined);
  assert.equal(guide.source, 'fixture source');
});

test('computes SHA-256 without Web Crypto, including UTF-8 text', () => {
  const { api } = createHarness();
  for (const value of ['', 'abc', 'Ван-Пис ワンピース']) {
    assert.equal(api.sha256Text(value), crypto.createHash('sha256').update(value).digest('hex'));
  }
});

test('loads and verifies manifest, index and one title shard', async () => {
  const fixture = bundleFixture();
  const fetch = async url => {
    assert.ok(fixture.responses.has(url), 'unexpected URL ' + url);
    return { ok: true, text: async () => fixture.responses.get(url) };
  };
  const { api, storage } = createHarness({ fetch });
  const guide = await api.loadBundleGuide({ id: 37854, name: 'Ван-Пис' });
  assert.equal(guide.episodes[55], 'filler');
  assert.equal(guide.seasonOffsets[1], 0);
  assert.equal(guide.bundle.buildId, 'skipthefiller-fixture');
  assert.match(guide.source, /CC BY 4\.0/);
  assert.ok(storage.has('laf_bundle_active_v1'));
  assert.ok([...storage.keys()].some(key => key.startsWith('laf_bundle_shard_v1_')));
  assert.equal(guide.bundle.resolution, 'TMDB ID');
});

test('uses the Lampa transport on webOS and requests response bodies as text', async () => {
  const fixture = bundleFixture();
  const calls = [];
  function Reguest() {
    this.timeout = value => assert.equal(value, 8000);
    this.silent = (url, success, error, post, options) => {
      calls.push(url);
      assert.equal(post, false);
      assert.equal(options.dataType, 'text');
      setImmediate(() => fixture.responses.has(url)
        ? success(fixture.responses.get(url))
        : error({ status: 404, statusText: 'not found' }));
    };
  }
  const { api } = createHarness({
    Reguest,
    fetch: () => Promise.reject(new Error('native fetch must not be used'))
  });
  const guide = await api.loadBundleGuide({ id: 37854, name: 'Ван-Пис' });
  assert.equal(guide.episodes[55], 'filler');
  assert.equal(calls.length, 3);
});

test('standalone build activates Naruto synchronously from the actual Lampa card event', () => {
  const standalone = fs.readFileSync(path.join(__dirname, '..', 'lampa-anime-filler-kodik7.js'), 'utf8');
  let networkCalls = 0;
  const { api, listeners } = createHarness({
    source: standalone,
    fetch: () => { networkCalls++; return Promise.reject(new Error('catalog network must not be used')); }
  });
  listeners.full[0]({ type: 'complite', data: { movie: {
    id: 46260, name: 'Наруто', media_type: 'tv'
  } }, object: {} });
  assert.equal(api.version, '0.5.0-kodik.7');
  assert.equal(api.state.diagnostics.phase, 'встроенный каталог активирован');
  assert.equal(api.state.diagnostics.provider, 'встроенный каталог 45 / 9552');
  assert.equal(api.state.diagnostics.embeddedItems, 45);
  assert.equal(api.state.diagnostics.embeddedLookup, 'TMDB 46260: совпадений 1');
  assert.equal(api.state.guide.slug, 'naruto');
  assert.equal(api.state.guide.episodes[136], 'filler');
  assert.equal(api.state.guide.kodik.coveredEpisodes, 220);
  assert.equal(networkCalls, 0);
});

test('coalesces repeated full-screen events while the same card is loading', async () => {
  const fixture = bundleFixture();
  let calls = 0;
  const fetch = async url => {
    calls++;
    return { ok: true, text: async () => fixture.responses.get(url) };
  };
  const { api, listeners } = createHarness({ fetch });
  const event = { type: 'complite', data: { movie: { id: 37854, name: 'Ван-Пис' } }, object: {} };
  listeners.full[0](event);
  listeners.full[0](event);
  listeners.full[0](event);
  await flushMany(12);
  assert.equal(api.state.guide.slug, 'one-piece');
  assert.equal(calls, 3, 'manifest, index and shard must each be requested only once');
});

test('loads the committed One Piece bundle end to end', async () => {
  const base = 'https://cdn.jsdelivr.net/gh/nMagic/lampa-anime-filler@kodik-test/data/generated/v1/';
  const fetch = async url => {
    assert.ok(url.startsWith(base), 'unexpected URL ' + url);
    const relative = url.slice(base.length);
    const target = path.join(__dirname, '..', 'data', 'generated', 'v1', ...relative.split('/'));
    return { ok: true, text: async () => fs.readFileSync(target, 'utf8') };
  };
  const { api } = createHarness({ fetch });
  const guide = await api.loadBundleGuide({ id: 37854, name: 'Ван-Пис', original_name: 'ワンピース' });
  assert.equal(guide.episodes[54], 'filler');
  assert.equal(guide.episodes[58], 'filler');
  assert.equal(api.classify({ season: 1, episode: 55 }, guide).type, 'filler');
});

test('loads real Kodik numbering for Bleach and multi-season My Hero Academia', async () => {
  const base = 'https://cdn.jsdelivr.net/gh/nMagic/lampa-anime-filler@kodik-test/data/generated/v1/';
  const fetch = async url => {
    assert.ok(url.startsWith(base), 'unexpected URL ' + url);
    const relative = url.slice(base.length);
    const target = path.join(__dirname, '..', 'data', 'generated', 'v1', ...relative.split('/'));
    return { ok: true, text: async () => fs.readFileSync(target, 'utf8') };
  };
  const bleachHarness = createHarness({ fetch });
  const bleach = await bleachHarness.api.loadBundleGuide({ id: 30984, name: 'Блич' });
  assert.equal(bleach.kodik.status, 'partial');
  assert.equal(bleachHarness.api.indexForDetailed({ season: 1, episode: 366,
    orig_title: 'Bleach' }, bleach).number, 366);
  assert.equal(bleachHarness.api.indexForDetailed({ season: 1, episode: 367,
    orig_title: 'Bleach' }, bleach).number, null);

  const heroHarness = createHarness({ fetch });
  const hero = await heroHarness.api.loadBundleGuide({ id: 65930, name: 'Моя геройская академия' });
  assert.equal(hero.kodik.status, 'verified');
  assert.equal(heroHarness.api.indexForDetailed({ season: 6, episode: 25,
    orig_title: 'Boku no Hero Academia 6' }, hero).number, 138);
});

test('uses a previously verified bundle cache when the network is unavailable', async () => {
  const fixture = bundleFixture();
  const online = createHarness({
    fetch: async url => ({ ok: true, text: async () => fixture.responses.get(url) })
  });
  await online.api.loadBundleGuide({ id: 37854, title: 'One Piece' });

  const offline = createHarness({
    storage: Object.fromEntries(online.storage),
    fetch: async () => { throw new Error('offline'); }
  });
  const guide = await offline.api.loadBundleGuide({ id: 37854, title: 'One Piece' });
  assert.equal(guide.episodes[55], 'filler');
  assert.equal(guide.bundle.resolution, 'TMDB ID');
});

test('rejects an unsupported bundle schema version', async () => {
  const fixture = bundleFixture();
  const manifestUrl = fixture.base + '/manifest.json';
  const manifest = JSON.parse(fixture.responses.get(manifestUrl));
  manifest.schemaVersion = 2;
  fixture.responses.set(manifestUrl, JSON.stringify(manifest));
  const { api } = createHarness({
    fetch: async url => ({ ok: true, text: async () => fixture.responses.get(url) })
  });
  await assert.rejects(api.loadBundleGuide({ id: 37854, title: 'One Piece' }), /Unsupported bundle schema/);
});

test('falls back to the legacy catalog when bundle integrity validation fails', async () => {
  const fixture = bundleFixture({ corruptIndex: true });
  const fetch = async url => {
    if (fixture.responses.has(url)) return { ok: true, text: async () => fixture.responses.get(url) };
    if (url.includes('anime-filler-list-data')) return { ok: true, json: async () => [{
      slug: 'one-piece', title: 'One Piece', episodes: [{ number: 55, type: 'Filler' }]
    }] };
    throw new Error('unexpected URL ' + url);
  };
  const { api, listeners } = createHarness({ fetch });
  listeners.full[0]({ type: 'complite', data: { movie: { id: 37854, name: 'Ван-Пис' } }, object: {} });
  await flushMany();
  assert.equal(api.state.guide.episodes[55], 'filler');
  assert.equal(api.state.diagnostics.provider, 'legacy fallback');
  assert.match(api.state.diagnostics.error, /checksum mismatch/);
});

test('keeps long-running titles separate and matches only exact normalized titles', () => {
  const { api } = createHarness();
  const catalog = [
    { slug: 'naruto', title: 'Naruto', episodes: [{ number: 136, type: 'Filler' }] },
    { slug: 'naruto-shippuden', title: 'Naruto Shippuden', episodes: [{ number: 57, type: 'Filler' }] }
  ];
  assert.equal(api.findGuide(catalog, { title: 'Naruto' }).slug, 'naruto');
  assert.equal(api.findGuide(catalog, { title: 'Naruto Shippuden' }).slug, 'naruto-shippuden');
  assert.equal(api.findGuide(catalog, { title: 'Naruto Shippuden the Movie' }), null);
});

test('resolves localized One Piece by verified TMDB id and supports high absolute numbers', () => {
  const { api } = createHarness();
  const catalog = [{
    slug: 'one-piece',
    title: 'One Piece',
    episodes: [{ number: 55, type: 'Filler' }, { number: 1077, type: 'Canon' }]
  }];
  const guide = api.findGuide(catalog, { id: 37854, name: 'Ван-Пис', original_name: 'ワンピース' });
  assert.equal(guide.slug, 'one-piece');
  assert.equal(api.classify({ absolute_episode: 1077 }, guide).type, 'canon');
});

test('parses unambiguous episode formats and rejects ranges, specials and video quality', () => {
  const { api } = createHarness();
  assert.equal(api.parseEpisode('55 серия'), 55);
  assert.equal(api.parseEpisode('Episode 196'), 196);
  assert.equal(api.parseEpisode('Anime - 026 [1080p].mkv'), 26);
  assert.equal(api.parseEpisode('S02E06'), null);
  assert.equal(api.parseEpisode('S02E06', { 2: 24 }), 30);
  assert.equal(api.parseEpisode('Episodes 1-12'), null);
  assert.equal(api.parseEpisode('E10-E12'), null);
  assert.equal(api.parseEpisode('OVA 1'), null);
  assert.equal(api.parseEpisode('Special 2'), null);
  // A bare 1080 can be a real absolute episode number for long-running anime.
  assert.equal(api.parseEpisode('Video 1080p'), null);
});

test('requires verified offsets for structured seasons and honors explicit absolute numbers', () => {
  const { api } = createHarness();
  const guide = api.normalizeGuide({
    slug: 'multi-season',
    seasonOffsets: { 1: 0, 2: 12 },
    episodes: { 1: 'Canon', 13: 'Filler' }
  });
  assert.equal(api.classify({ season: 2, episode: 1 }, guide).number, 13);
  assert.equal(api.classify({ season: 3, episode: 1 }, guide), null);
  assert.equal(api.classify({ absolute_episode: 13 }, guide).type, 'filler');
  assert.equal(api.classify({ filename: 'Season 3 Episode 1.mkv' }, guide), null);
  assert.equal(api.classify('Episode 999', guide), null);
});

test('maps split Kodik seasons by the exact original title and never guesses an unknown part', () => {
  const { api } = createHarness();
  const guide = api.normalizeGuide({
    episodes: { 38: 'Canon', 50: 'Filler' },
    kodik: { status: 'partial', coveredEpisodes: 59, totalEpisodes: 94, rules: [
      { season: 3, offset: 37, episodes: 12, titles: ['Shingeki no Kyojin Season 3'] },
      { season: 3, offset: 49, episodes: 10, titles: ['Shingeki no Kyojin Season 3 (2019)'] }
    ] }
  });
  assert.equal(api.indexForDetailed({ season: 3, episode: 1,
    orig_title: 'Shingeki no Kyojin Season 3 (2019)' }, guide).number, 50);
  assert.equal(api.indexForDetailed({ season: 3, episode: 1 }, guide).number, null);
  assert.match(api.indexForDetailed({ season: 3, episode: 99,
    orig_title: 'Shingeki no Kyojin Season 3' }, guide).reason, /диапазона/);
});

test('marks the actual Online_Mod row from Kodik metadata and does not duplicate its badge', () => {
  const { api, context } = createHarness();
  api.state.guide = api.normalizeGuide({
    episodes: { 50: 'Filler' },
    kodik: { status: 'partial', coveredEpisodes: 59, totalEpisodes: 94, rules: [
      { season: 3, offset: 49, episodes: 10, titles: ['Shingeki no Kyojin Season 3 (2019)'] }
    ] }
  }, 'fixture');
  const row = context.Lampa.Template.get('online_mod', {
    season: 3, episode: 1, orig_title: 'Shingeki no Kyojin Season 3 (2019)'
  })[0];
  api.scan();
  api.scan();
  assert.equal(row.children.length, 1);
  assert.equal(row.children[0].getAttribute('data-episode'), '50');
  assert.equal(row.children[0].getAttribute('data-type'), 'filler');
  assert.equal(api.state.diagnostics.matched, 1);
  assert.equal(api.state.diagnostics.unknownMapping, 0);
});

test('scans every Kodik row in a list longer than one thousand episodes', () => {
  const { api, context } = createHarness();
  const episodes = {};
  for (let number = 1; number <= 1005; number++) episodes[number] = 'Canon';
  api.state.guide = api.normalizeGuide({ episodes,
    kodik: { status: 'verified', coveredEpisodes: 1005, totalEpisodes: 1005, rules: [
      { season: 1, offset: 0, episodes: 1005, titles: ['Long Anime'] }
    ] }
  }, 'fixture');
  let last;
  for (let number = 1; number <= 1005; number++) {
    last = context.Lampa.Template.get('online_mod', {
      season: 1, episode: number, orig_title: 'Long Anime'
    })[0];
  }
  api.scan();
  assert.equal(api.state.diagnostics.rows, 1005);
  assert.equal(api.state.diagnostics.matched, 1005);
  assert.equal(last.children[0].getAttribute('data-episode'), '1005');
});

test('template hook carries source metadata for Online_Mod and BWA but ignores unknown templates', () => {
  const { context } = createHarness();
  const online = context.Lampa.Template.get('online_mod', { season: 1, episode: 55 });
  const bwa = context.Lampa.Template.get('lampac_prestige_full', { absolute_episode: 196 });
  const unknown = context.Lampa.Template.get('unrelated_template', { season: 1, episode: 55 });
  assert.equal(online[0].getAttribute('data-laf-episode'), '55');
  assert.equal(online[0].getAttribute('data-laf-season'), '1');
  assert.equal(bwa[0].getAttribute('data-laf-absolute'), '196');
  assert.equal(unknown[0].getAttribute('data-laf-episode'), null);
});

test('torrent render marks only a classified single episode', () => {
  const { api, listeners } = createHarness();
  api.state.guide = api.normalizeGuide({ episodes: { 26: 'Filler' } }, 'fixture');
  const row = fakeNode();
  listeners.torrent_file[0]({ type: 'render', element: { filename: 'Anime - 026 [1080p].mkv' }, item: row });
  assert.equal(row.children.length, 1);
  assert.equal(row.children[0].getAttribute('data-episode'), '26');
  assert.equal(row.classList.values.has('laf-filler'), true);

  const batch = fakeNode();
  listeners.torrent_file[0]({ type: 'render', element: { filename: 'Episodes 26-30.mkv' }, item: batch });
  assert.equal(batch.children.length, 0);
});

test('a late response from the previous card cannot overwrite the current anime', async () => {
  const requests = new Map();
  const fetch = url => new Promise((resolve, reject) => requests.set(url, { resolve, reject }));
  const { api, listeners } = createHarness({
    storage: { laf_source_url: 'https://example.test/filler' },
    fetch
  });
  const full = listeners.full[0];
  full({ type: 'complite', data: { movie: { id: 1, title: 'Naruto' } }, object: {} });
  full({ type: 'complite', data: { movie: { id: 2, title: 'Bleach' } }, object: {} });

  requests.get('https://example.test/filler/bleach.json').resolve({
    ok: true,
    json: async () => ({ slug: 'bleach', episodes: { 33: 'Filler' } })
  });
  await flushPromises();
  await flushPromises();
  assert.equal(api.state.guide.slug, 'bleach');

  requests.get('https://example.test/filler/naruto.json').resolve({
    ok: true,
    json: async () => ({ slug: 'naruto', episodes: { 136: 'Filler' } })
  });
  await flushPromises();
  await flushPromises();
  assert.equal(api.state.movie.id, 2);
  assert.equal(api.state.guide.slug, 'bleach');
});

test('external database failures are reported and do not create classifications', async () => {
  const { api, listeners } = createHarness({
    storage: { laf_source_url: 'https://example.test/filler' },
    fetch: async () => { throw new Error('network unavailable'); }
  });
  listeners.full[0]({ type: 'complite', data: { movie: { id: 3, title: 'Unknown Anime' } }, object: {} });
  await flushPromises();
  await flushPromises();
  assert.equal(api.state.guide, null);
  assert.equal(api.state.diagnostics.phase, 'ошибка загрузки каталога');
  assert.match(api.state.diagnostics.error, /network unavailable/);
});
