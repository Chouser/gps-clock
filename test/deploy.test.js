const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

test('deployment rejects missing configuration before building or uploading', () => {
  const required = ['S3BUCKET', 'GOOGLE_API_KEY', 'DOMAIN_WILDCARD', 'DOMAIN_NAME', 'CLOCK_CONFIG'];
  for (const missing of required) {
    const env = { ...process.env, ...Object.fromEntries(required.map(name => [name, 'test'])) };
    delete env[missing];
    const result = spawnSync('bash', ['deploy.sh'], { env, encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, new RegExp(`Error: ${missing} is not set`));
    assert.equal(result.stdout, '');
  }
});
