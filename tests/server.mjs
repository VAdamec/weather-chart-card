import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const root = resolve('.');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const path = resolve(root, '.' + (pathname === '/' ? '/tests/fixture.html' : pathname));
  if (!path.startsWith(root + sep)) { response.writeHead(403).end(); return; }
  try {
    const content = await readFile(path);
    response.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream' }).end(content);
  } catch { response.writeHead(404).end(); }
}).listen(4173, '127.0.0.1');
