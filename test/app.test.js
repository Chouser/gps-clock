const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

process.env.CLOCK_CONFIG = JSON.stringify({
  handFriend: ['alice', 'missing'],
  labelAngle: { home: 10, work: 20, moving: 30, unknown: 40, error: 50 }
});
process.env.GOOGLE_API_KEY = 'test-key';
delete process.env.DYNAMO_MODE;

const common = require('../dist/common');
const { LocalFileStorage } = require('../dist/storage/local-file-storage');
const { DynamoDBStorage } = require('../dist/storage/dynamodb-storage');
const { handler } = require('../dist/lambda');
const { OwnTracksServer } = require('../dist/server');

function credentials(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

function storage(overrides = {}) {
  return {
    getUserCredentials: async () => ({
      hashed_password: common.hashPassword('secret'),
      friend_group: 'friends'
    }),
    setUserCredentials: async () => {},
    saveRects: async () => {},
    getRects: async () => [],
    saveUserLocation: async () => {},
    getUserLocationsInGroup: async () => [],
    initialize: async () => {},
    ...overrides
  };
}

test('hashPassword returns a stable SHA-256 hash', () => {
  assert.equal(
    common.hashPassword('secret'),
    '2bb80d537b1da3e38bd30361aa855686bde0eacd7162fef6a25fe97bf527a25b'
  );
});

test('handleRequest rejects missing or invalid Basic authentication', async () => {
  const store = storage();
  assert.equal((await common.handleRequest(store, {
    method: 'GET', path: '/', authHeader: undefined, bodyString: ''
  })).status, 401);
  assert.equal((await common.handleRequest(store, {
    method: 'GET', path: '/', authHeader: 'Bearer token', bodyString: ''
  })).status, 401);
  assert.equal((await common.handleRequest(store, {
    method: 'GET', path: '/', authHeader: credentials('alice', 'wrong'), bodyString: ''
  })).status, 401);
});

test('first authenticated request assigns a pending password', async () => {
  let assigned;
  const store = storage({
    getUserCredentials: async () => ({ hashed_password: 'tbd', friend_group: 'friends' }),
    setUserCredentials: async (...args) => { assigned = args; }
  });

  const response = await common.handleRequest(store, {
    method: 'GET', path: '/get-rects', authHeader: credentials('alice', 'new'), bodyString: ''
  });

  assert.equal(response.status, 200);
  assert.deepEqual(assigned, ['alice', common.hashPassword('new')]);
});

test('handleRequest routes location and rectangle endpoints', async () => {
  const calls = [];
  const store = storage({
    saveUserLocation: async (...args) => calls.push(['location', ...args]),
    saveRects: async rects => calls.push(['rects', rects]),
    getRects: async () => [{ name: 'home' }]
  });
  const authHeader = credentials('alice', 'secret');

  const posted = await common.handleRequest(store, {
    method: 'POST', path: '/pub', authHeader,
    bodyString: JSON.stringify({ _type: 'location', lat: 1 })
  });
  const saved = await common.handleRequest(store, {
    method: 'POST', path: '/update-rects', authHeader,
    bodyString: JSON.stringify([{ name: 'home' }])
  });
  const loaded = await common.handleRequest(store, {
    method: 'GET', path: '/get-rects', authHeader, bodyString: ''
  });

  assert.equal(posted.status, 200);
  assert.deepEqual(JSON.parse(posted.bodyString), []);
  assert.equal(saved.status, 200);
  assert.deepEqual(JSON.parse(loaded.bodyString), [{ name: 'home' }]);
  assert.deepEqual(calls, [
    ['location', 'alice', 'friends', { _type: 'location', lat: 1 }],
    ['rects', [{ name: 'home' }]]
  ]);
});

test('friend labels and hand angles apply movement, rectangles, and fallbacks', async () => {
  const rects = [
    { name: 'large', north: 10, south: 0, east: 10, west: 0 },
    { name: 'home', north: 2, south: 0, east: 2, west: 0 }
  ];
  const locations = [
    { username: 'alice', location: { lat: 1, lon: 1, vel: 1 } },
    { username: 'bob', location: { lat: 20, lon: 20, vel: 7 } },
    { username: 'carol', location: { lat: 20, lon: 20, vel: 1 } }
  ];
  const store = storage({
    getRects: async () => rects,
    getUserLocationsInGroup: async () => locations
  });
  const authHeader = credentials('alice', 'secret');

  const labels = await common.handleRequest(store, {
    method: 'GET', path: '/friend-labels', authHeader, bodyString: ''
  });
  const angles = await common.handleRequest(store, {
    method: 'GET', path: '/hand-angles', authHeader, bodyString: ''
  });

  assert.deepEqual(JSON.parse(labels.bodyString), [
    { username: 'alice', label: 'large' },
    { username: 'bob', label: 'moving' },
    { username: 'carol', label: 'unknown' }
  ]);
  assert.deepEqual(JSON.parse(angles.bodyString), [10, 50]);
});

test('handleRequest serves static files and blocks traversal', async () => {
  const store = storage();
  const authHeader = credentials('alice', 'secret');
  const index = await common.handleRequest(store, {
    method: 'GET', path: '/', authHeader, bodyString: ''
  });
  const missing = await common.handleRequest(store, {
    method: 'GET', path: '/does-not-exist', authHeader, bodyString: ''
  });
  const traversal = await common.handleRequest(store, {
    method: 'GET', path: '/../package.json', authHeader, bodyString: ''
  });

  assert.equal(index.status, 200);
  assert.equal(index.headers['Content-Type'], 'text/html');
  assert.match(index.headers['Set-Cookie'], /googleApiKey=test-key/);
  assert.equal(missing.status, 404);
  assert.equal(traversal.status, 404);
});

test('LocalFileStorage loads and persists users, locations, and rectangles', async () => {
  const originalCwd = process.cwd();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gps-clock-'));
  try {
    process.chdir(tempDir);
    await fs.mkdir('data');
    await fs.writeFile('data/users.json', JSON.stringify({
      alice: { friend_group: 'friends', hashed_password: 'tbd' },
      other: { friend_group: 'other', hashed_password: 'hash' }
    }));
    await fs.writeFile('data/locations.json', JSON.stringify({
      alice: { lat: 1 }, other: { lat: 2 }
    }));
    const store = new LocalFileStorage();
    await store.initialize();

    assert.deepEqual(await store.getRects(), []);
    await fs.writeFile('data/rects.json', '{broken JSON');
    await assert.rejects(store.getRects(), SyntaxError);
    await fs.rm('data/rects.json');
    await fs.mkdir('data/rects.json');
    await assert.rejects(store.getRects(), { code: 'EISDIR' });
    await fs.rmdir('data/rects.json');

    assert.deepEqual(await store.getUserLocationsInGroup('friends'), [
      { username: 'alice', location: { lat: 1 } }
    ]);
    await store.setUserCredentials('alice', 'new-hash');
    await store.saveUserLocation('alice', 'friends', { lat: 3 });
    await store.saveRects([{ name: 'home' }]);

    assert.deepEqual(await store.getUserCredentials('alice'), {
      friend_group: 'friends', hashed_password: 'new-hash'
    });
    assert.deepEqual(await store.getRects(), [{ name: 'home' }]);
    assert.equal((await fs.readFile('data/locations.json', 'utf8')).includes('"lat": 3'), true);
  } finally {
    process.chdir(originalCwd);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('DynamoDBStorage sends the expected commands and maps results', async () => {
  const store = new DynamoDBStorage();
  const calls = [];
  store.client = {
    send: async command => {
      calls.push(command);
      if (command.constructor.name === 'GetCommand') {
        return { Item: { username: 'alice', friend_group: 'friends', hashed_password: 'hash' } };
      }
      if (command.constructor.name === 'QueryCommand' && command.input.IndexName) {
        return { Items: [{ username: 'alice', location: { lat: 1 } }] };
      }
      if (command.constructor.name === 'QueryCommand') {
        return { Items: [{ location: [{ name: 'home' }] }] };
      }
      return {};
    }
  };

  assert.deepEqual(await store.getUserCredentials('alice'), {
    username: 'alice', friend_group: 'friends', hashed_password: 'hash'
  });
  await store.setUserCredentials('alice', 'new');
  await store.saveUserLocation('alice', 'friends', { lat: 1 });
  await store.saveRects([{ name: 'home' }]);
  assert.deepEqual(await store.getRects(), [{ name: 'home' }]);
  assert.deepEqual(await store.getUserLocationsInGroup('friends'), [
    { username: 'alice', location: { lat: 1, tid: 'alice' } }
  ]);

  assert.equal(calls.length, 6);
  assert.equal(calls[1].input.ConditionExpression, 'hashed_password = :tbd');
  assert.equal(calls[2].input.Item.username, 'alice');
  assert.equal(calls[3].input.Item.username, 'rects');
});

test('DynamoDBStorage returns an empty rectangle list for missing records and propagates failures', async () => {
  const store = new DynamoDBStorage();
  for (const response of [{}, { Items: [] }]) {
    store.client = { send: async () => response };
    assert.deepEqual(await store.getRects(), []);
  }
  store.client = { send: async () => { throw new Error('DynamoDB unavailable'); } };
  await assert.rejects(store.getRects(), /DynamoDB unavailable/);
});

test('Lambda handler maps API Gateway paths and responses', async () => {
  const originalCwd = process.cwd();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gps-clock-lambda-'));
  try {
    process.chdir(tempDir);
    await fs.mkdir('data');
    await fs.writeFile('data/users.json', JSON.stringify({
      alice: { friend_group: 'friends', hashed_password: common.hashPassword('secret') }
    }));
    await fs.writeFile('data/locations.json', '{}');
    await fs.writeFile('data/rects.json', '[]');

    for (const [stage, requestPath] of [
      ['prod', '/prod/get-rects'],
      ['prod', '/get-rects'],
      ['$default', '/get-rects']
    ]) {
      const result = await handler({
        requestContext: { stage, http: { method: 'GET', path: requestPath } },
        headers: { authorization: credentials('alice', 'secret') }, body: ''
      }, {});
      assert.equal(result.statusCode, 200, requestPath);
      assert.deepEqual(JSON.parse(result.body), []);
      assert.equal(result.headers['Access-Control-Allow-Origin'], '*');
    }
    const unauthorized = await handler({
      requestContext: { stage: 'prod', http: { method: 'GET', path: '/prod/get-rects' } },
      headers: {}, body: ''
    }, {});

    assert.equal(unauthorized.statusCode, 401);
  } finally {
    process.chdir(originalCwd);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('OwnTracksServer handles HTTP requests and errors', async () => {
  const originalCwd = process.cwd();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gps-clock-server-'));
  let server;
  try {
    process.chdir(tempDir);
    await fs.mkdir('data');
    await fs.writeFile('data/users.json', '{}');
    await fs.writeFile('data/locations.json', '{}');
    server = await new OwnTracksServer(0).start();
    const port = server.address().port;

    const response = await new Promise((resolve, reject) => {
      const request = http.request({ port, path: '/', method: 'GET' }, res => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, body }));
      });
      request.on('error', reject);
      request.end();
    });
    assert.equal(response.status, 401);
  } finally {
    server?.close();
    process.chdir(originalCwd);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
