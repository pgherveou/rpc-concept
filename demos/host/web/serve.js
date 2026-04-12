import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.map': 'application/json',
};

const dist = new URL('./dist/', import.meta.url).pathname;

createServer(async (req, res) => {
  let path = req.url.split('?')[0];
  if (path === '/') path = '/host.html';
  if (!extname(path)) path += '.html';

  try {
    const data = await readFile(join(dist, path));
    res.writeHead(200, {
      'Content-Type': MIME[extname(path)] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(3000, () => console.log('Serving on http://localhost:3000'));
