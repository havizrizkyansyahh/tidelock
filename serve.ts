// A static server for game/, for playing and screenshotting the entry locally (Node 22+, no
// dependencies). It serves nothing but files under game/, sends the MIME types a browser game
// needs, and refuses every path that escapes the directory.
//
//   node serve.ts            → http://localhost:8080
//   node serve.ts --port 8123
//
// This is a development tool: the entry itself is plain files under game/.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('./game', import.meta.url)));

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};

function portFromArgs(argv: string[]): number {
  const at = argv.indexOf('--port');
  const asked = at === -1 ? 8080 : Number(argv[at + 1]);
  return Number.isInteger(asked) && asked > 0 && asked < 65536 ? asked : 8080;
}

const server = createServer(async (request, response) => {
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  } catch {
    response.writeHead(400).end('bad request');
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';

  const file = resolve(join(ROOT, normalize(pathname)));
  if (file !== ROOT && !file.startsWith(ROOT + sep)) {
    response.writeHead(403).end('outside game/');
    return;
  }

  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error('not a file');
    response.writeHead(200, {
      'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'content-length': info.size,
      'cache-control': 'no-store',
    });
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404).end('not found');
  }
});

const port = portFromArgs(process.argv.slice(2));
server.listen(port, '127.0.0.1', () => {
  console.log(`TIDELOCK is being served from ${ROOT}`);
  console.log(`open http://localhost:${port}`);
});