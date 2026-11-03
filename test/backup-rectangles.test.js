const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');
const execFile = promisify(require('node:child_process').execFile);
const { test } = require('node:test');

test('rectangle backup follows authenticated redirects and rejects unsafe or looping redirects', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'rectangle-backup-'));
  const rectangles = [{ name: 'home', north: 2, south: 1, east: 4, west: 3 }];
  const server = http.createServer((req, res) => {
    if (req.headers.authorization !== `Basic ${Buffer.from('alice:secret').toString('base64')}`) {
      res.writeHead(401).end();
    } else if (req.url === '/start') {
      res.writeHead(302, { Location: '/rectangles' }).end();
    } else if (req.url === '/loop') {
      res.writeHead(302, { Location: '/loop' }).end();
    } else if (req.url === '/unsafe') {
      res.writeHead(302, { Location: 'https://example.com/get-rects' }).end();
    } else {
      res.end(JSON.stringify(rectangles));
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const script = path.resolve(__dirname, '../tools/backup-rectangles.js');
  const output = path.join(directory, 'backup.json');
  const run = (route, overrides = {}) => execFile(process.execPath, [script, output], {
    cwd: directory,
    env: {
      ...process.env,
      RECTANGLES_URL: `http://127.0.0.1:${server.address().port}${route}`,
      RECTANGLES_USERNAME: 'alice',
      RECTANGLES_PASSWORD: 'secret',
      ...overrides
    }
  });
  try {
    await assert.rejects(run('/start', { RECTANGLES_URL: '' }), /Set RECTANGLES_URL/);
    await run('/start');
    assert.deepEqual(JSON.parse(await fs.readFile(output, 'utf8')), rectangles);
    await assert.rejects(run('/start'), /EEXIST/);
    await assert.rejects(run('/loop'), /Too many redirects/);
    await assert.rejects(run('/unsafe'), /Refusing to forward credentials/);
    assert.deepEqual(JSON.parse(await fs.readFile(output, 'utf8')), rectangles);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  }
});
