import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve('dist/sistema-vestuario-banda/browser');
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};
createServer(async (req, res) => {
  try {
    let file = resolve(
      root,
      '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname),
    );
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    try {
      if (!(await stat(file)).isFile()) file = resolve(root, 'index.html');
    } catch {
      if (extname(file)) {
        res.writeHead(404).end();
        return;
      }
      file = resolve(root, 'index.html');
    }
    res.writeHead(200, {
      'Content-Type': mime[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(await readFile(file));
  } catch {
    res.writeHead(500).end();
  }
}).listen(4301, '127.0.0.1', () =>
  console.log('Vista previa PWA: http://127.0.0.1:4301'),
);
