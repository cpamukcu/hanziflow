// Stamps sw.js with a hash of the app files so a changed file always reaches returning visitors.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['index.html', 'assets/theme.css', 'vendor/chart.umd.min.js', 'vendor/pinyin-pro.min.js',
  'data/dictionary.js', 'data/dictionary-extra.js', 'js/lookup.js', 'js/srs.js', 'js/app.js'];
const h = crypto.createHash('sha256');
for (const f of FILES) h.update(fs.readFileSync(path.join(ROOT, f)));
const id = 'hanziflow-v2-' + h.digest('hex').slice(0, 10);
const sw = path.join(ROOT, 'sw.js');
const src = fs.readFileSync(sw, 'utf8');
const next = src.replace(/const CACHE_ID = "[^"]*";/, `const CACHE_ID = "${id}";`);
if (process.argv.includes('--check')) {
  if (next !== src) { console.error(`sw.js is stale; run: npm run stamp (expected ${id})`); process.exit(1); }
  console.log('sw.js stamp is current: ' + id);
} else { fs.writeFileSync(sw, next); console.log(id); }
