import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Static hosting must serve the application on a direct visit as well as a
// client-side navigation. Derive entries from the router so new tools are covered.
export async function writeAppRoutes(root, output) {
  const source = await readFile(path.join(root, 'src/App.tsx'), 'utf8');
  const html = await readFile(path.join(output, 'index.html'), 'utf8');
  const routes = [...new Set([...source.matchAll(/<Route\s+path="(\/[a-z0-9-]+)"/g)].map(match => match[1]))];
  if (!routes.includes('/auth') || !routes.includes('/settings')) throw new Error('Application routes could not be read');
  for (const route of routes) {
    const target = path.join(output, route.slice(1));
    await mkdir(target, { recursive: true });
    await writeFile(path.join(target, 'index.html'), html);
    await writeFile(target + '.html', html);
  }
  return routes;
}

export function staticAppRoutes() {
  let config;
  return {
    name: 'millie-static-app-routes',
    apply: 'build',
    configResolved(resolved) { config = resolved; },
    async closeBundle() { await writeAppRoutes(config.root, path.resolve(config.root, config.build.outDir)); },
  };
}
