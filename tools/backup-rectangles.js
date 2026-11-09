#!/usr/bin/env node

/**
 * Downloads the current rectangle list from the configured rectangle API and
 * saves it in the JSON format accepted by POST /update-rects. It needs the
 * application's HTTP Basic Auth username and password, not AWS credentials;
 * set RECTANGLES_USERNAME and RECTANGLES_PASSWORD to those credentials.
 * RECTANGLES_URL specifies the full get-rects URL.
 * Follows up to five redirects, retaining Basic
 * Auth only on the original host or its www counterpart, without downgrading
 * HTTPS. Writes a dated JSON file (or the first CLI argument), never overwriting.
 */

const fs = require('node:fs/promises');

const output = process.argv[2] || `rectangles-${new Date().toISOString().slice(0, 10)}.json`;

function isRectangle(value) {
  return value && typeof value.name === 'string'
    && ['north', 'south', 'east', 'west'].every(key => Number.isFinite(value[key]));
}

async function main() {
  const username = process.env.RECTANGLES_USERNAME;
  const password = process.env.RECTANGLES_PASSWORD;

  if (!username || !password) {
    throw new Error('Set RECTANGLES_USERNAME and RECTANGLES_PASSWORD to the site Basic Auth credentials.');
  }

  if (!process.env.RECTANGLES_URL) {
    throw new Error('Set RECTANGLES_URL to the full get-rects URL.');
  }
  let url = new URL(process.env.RECTANGLES_URL);
  const original = url;
  let response;
  for (let redirects = 0; ; redirects++) {
    response = await fetch(url, {
      redirect: 'manual',
      headers: {
        Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
      }
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get('location');
    await response.body?.cancel();
    if (!location) throw new Error('Redirect is missing Location');
    if (redirects === 5) throw new Error('Too many redirects');
    const next = new URL(location, url);
    if (next.protocol !== original.protocol || next.port !== original.port
      || next.hostname.replace(/^www\./, '') !== original.hostname.replace(/^www\./, '')) {
      throw new Error('Refusing to forward credentials to an unrelated host or protocol');
    }
    url = next;
  }

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`GET ${url} failed with HTTP ${response.status}`);
  }

  let rectangles;
  try {
    rectangles = JSON.parse(body);
  } catch {
    throw new Error('The server returned invalid JSON');
  }

  if (!Array.isArray(rectangles) || !rectangles.every(isRectangle)) {
    throw new Error('The server returned an invalid rectangle list');
  }

  await fs.writeFile(output, `${JSON.stringify(rectangles, null, 2)}\n`, { flag: 'wx' });
  console.log(`Saved ${rectangles.length} rectangles to ${output}`);
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
