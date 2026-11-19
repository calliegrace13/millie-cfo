import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist');
const app = await readFile(path.join(root, 'src/App.tsx'), 'utf8');
const home = await readFile(path.join(output, 'index.html'), 'utf8');
const routes = [...app.matchAll(/<Route\s+path="(\/[a-z0-9-]+)"/g)].map(match => match[1]);
assert(routes.length > 30, 'Test must cover the complete application router');
for (const route of routes) {
  assert.equal(await readFile(path.join(output, route + '.html'), 'utf8'), home, route + ' direct link');
  assert.equal(await readFile(path.join(output, route, 'index.html'), 'utf8'), home, route + ' refresh');
}
for (const asset of home.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)) {
  await access(path.join(output, asset[1]));
}
const callback = await readFile(path.join(output, 'gmail-callback.html'), 'utf8');
assert.notEqual(callback, home, 'Gmail callback must retain its dedicated URL cleanup');
assert(callback.includes('millie-gmail-callback'));
console.log(`PASS: ${routes.length} direct routes and refresh entries, production assets, and dedicated Gmail callback.`);
