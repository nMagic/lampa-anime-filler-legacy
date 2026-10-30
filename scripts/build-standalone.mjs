import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const generated = path.join(root, 'data', 'generated', 'v1');
const indexText = fs.readFileSync(path.join(generated, 'index.json'), 'utf8');
const index = JSON.parse(indexText);
const items = index.titles.map(item => {
  const shard = JSON.parse(fs.readFileSync(path.join(generated, item.shard), 'utf8'));
  return { id: item.id, slug: item.slug, title: item.title, aliases: item.aliases,
    ids: item.ids, numbering: shard.numbering, episodes: shard.episodes };
});

const plugin = fs.readFileSync(path.join(root, 'lampa-anime-filler.js'), 'utf8');
const bootstrap = 'window.LampaAnimeFillerEmbeddedGuides=' + JSON.stringify({ items }) + ';\n';
fs.writeFileSync(path.join(root, 'lampa-anime-filler-kodik5.js'), bootstrap + plugin);
console.log(`Built synchronous standalone Kodik plugin: ${items.length} guides`);
