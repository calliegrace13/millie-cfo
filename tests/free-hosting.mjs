import assert from 'node:assert/strict';
import fs from 'node:fs';
const config = JSON.parse(fs.readFileSync('wrangler.jsonc', 'utf8'));
assert.equal(config.assets.directory, './dist');
assert.equal(config.assets.not_found_handling, 'single-page-application');
for (const binding of ['main', 'd1_databases', 'r2_buckets', 'kv_namespaces', 'queues', 'triggers', 'ai', 'containers']) {
  assert.equal(config[binding], undefined, `Hosting must not add ${binding} or duplicate background work`);
}
const codespaces = JSON.parse(fs.readFileSync('.devcontainer/devcontainer.json', 'utf8'));
assert.deepEqual(codespaces.forwardPorts, [8080], 'Only the app preview should be forwarded');
const html = fs.readFileSync('dist/index.html', 'utf8');
assert(!html.includes('/src/main.tsx'));
const files = fs.readdirSync('dist', { recursive: true, withFileTypes: true });
assert(files.length < 20000, 'Static asset count must fit the Cloudflare Free limit');
for (const file of files.filter(f => f.isFile())) {
  assert(fs.statSync(`${file.parentPath ?? file.path}/${file.name}`).size < 25 * 1024 * 1024, 'Asset must fit the Free per-file limit');
}
console.log('PASS static-only Cloudflare deployment, SPA refresh routing, no extra schedulers or paid service bindings, and free-plan asset limits.');
