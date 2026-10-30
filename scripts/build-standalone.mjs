import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const generated = path.join(root, 'data', 'generated', 'v1');
const base = 'https://cdn.jsdelivr.net/gh/nMagic/lampa-anime-filler@kodik-test/data/generated/v1';
const indexText = fs.readFileSync(path.join(generated, 'index.json'), 'utf8');
const index = JSON.parse(indexText);
const embedded = Object.create(null);

embedded[base + '/manifest.json'] = fs.readFileSync(path.join(generated, 'manifest.json'), 'utf8');
embedded[base + '/index.json'] = indexText;
for (const item of index.titles) {
  embedded[base + '/' + item.shard] = fs.readFileSync(path.join(generated, item.shard), 'utf8');
}

const plugin = fs.readFileSync(path.join(root, 'lampa-anime-filler.js'), 'utf8');
const bootstrap = 'window.LampaAnimeFillerEmbedded=' + JSON.stringify(embedded) + ';\n';
fs.writeFileSync(path.join(root, 'lampa-anime-filler-kodik4.js'), bootstrap + plugin);
console.log(`Built standalone Kodik plugin: ${Object.keys(embedded).length} embedded files`);
