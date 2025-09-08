import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { StorageInterface } from './storage/interfaces';

const googleApiKey = process.env.GOOGLE_API_KEY;

// TODO support multiple clocks, and more dynamically
interface ClockConfig {
  handFriend: string[];
  labelAngle: Record<string, number>;
}

const clockConfig = JSON.parse(process.env.CLOCK_CONFIG || "") as ClockConfig;

export interface Request {
  method: string;
  path: string;
  authHeader: string | undefined;
  bodyString: any;
};

export interface Response {
  status: number;
  bodyString?: string;
  headers?: any;
  body?: any;
}

export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

const jsonResponse = (resp: Response) => {
  return {
    bodyString: JSON.stringify(resp.body),
    ...resp,
    headers: {
      'Content-Type': 'application/json',
      ...resp.headers
    }
  }
}

const unauthorizedResponse = jsonResponse({
  status: 401,
  headers: { 'WWW-Authenticate': 'Basic realm="OwnTracks"' },
  body: { error: 'Unauthorized' }
})

const notFoundResponse = jsonResponse({
  status: 404,
  body: { error: 'Not found' }
})

const extType: { [name: string]: string } = {
  '.txt': 'text/plain',
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript'
}

async function handAngles(storage: StorageInterface, friendGroup: string):Promise<number[]> {
  const labelAngle = clockConfig.labelAngle;
  const userLocs = await storage.getUserLocationsInGroup(friendGroup);
  console.log("userLocs", userLocs);
  const rects = await storage.getRects();
  return clockConfig.handFriend.map(username => {
    console.log("username", username);
    const locEntry =
      userLocs.find(locEntry => locEntry.username == username); // O(n*m) boo
    console.log("locEntry", locEntry);
    if (!locEntry) { return labelAngle.error; }
    const loc = locEntry.location;
    const label =
      (locEntry.location.vel > 6)  // km/h, slow jog
        ? 'moving'
        : rects.filter(rect => // Changed from find to filter
          loc.lat < rect.north &&
          loc.lat > rect.south &&
          loc.lon < rect.east &&
          loc.lon > rect.west)
          .reduce((smallest, rect) => { // Find the smallest by area
            if (!smallest) return rect;
            const rectArea = (rect.north - rect.south) * (rect.east - rect.west);
            const smallestArea = (smallest.north - smallest.south) * (smallest.east - smallest.west);
            return rectArea < smallestArea ? rect : smallest;
          }, null as any)
          ?.name || 'unknown';
    console.log("label", label);
    return labelAngle[label || 'error'];
  })
}

export async function handleRequest(storage: StorageInterface, req: Request): Promise<Response> {
  if (!req.authHeader || !req.authHeader.startsWith('Basic ')) {
    return unauthorizedResponse;
  }

  const base64Credentials = req.authHeader.split(' ')[1];
  const [username, password] = Buffer.from(base64Credentials, 'base64').toString('ascii').split(':');

  const userCredentials = await storage.getUserCredentials(username);
  if (userCredentials?.hashed_password !== 'tbd'
    && (!userCredentials
      || hashPassword(password) !== userCredentials.hashed_password)) {
    return unauthorizedResponse;
  }
  if (userCredentials.hashed_password === 'tbd') {
    await storage.setUserCredentials(username, hashPassword(password));
  }

  // location posted from phone
  if (req.method === 'POST' && req.path === '/pub') {
    const body = JSON.parse(req.bodyString);
    if (body._type == 'location') {
      await storage.saveUserLocation(username, userCredentials.friend_group, body);
    }

    const userLocs = await storage.getUserLocationsInGroup(userCredentials.friend_group);

    return jsonResponse({
      status: 200,
      body: userLocs
        .filter(entry => entry.username != username)
        .map(entry => ({
          ...entry.location,
          tid: entry.username
        }))
    })
  }

  // load/save rectangles
  if (req.method === 'POST' && req.path === '/update-rects') {
    await storage.saveRects(JSON.parse(req.bodyString));
    return jsonResponse({ status: 200, body: { msg: "saved successfully" } });
  }
  if (req.method === 'GET' && req.path === '/get-rects') {
    return jsonResponse({ status: 200, body: await storage.getRects() });
  }

  // clock request v1
  if (req.method === 'GET' && req.path === '/friend-labels') {
    const userLocs = await storage.getUserLocationsInGroup(userCredentials.friend_group);
    const rects = await storage.getRects();
    return jsonResponse({
      status: 200,
      body: userLocs.map(locEntry => { // O(n*m) boo
        const loc = locEntry.location;
        const label =
          (locEntry.location.vel > 6)  // km/h, slow jog
            ? 'moving'
            : rects.find(rect =>
              loc.lat < rect.north &&
              loc.lat > rect.south &&
              loc.lon < rect.east &&
              loc.lon > rect.west)
              ?.name || 'unknown';
        return {username: locEntry.username, label};
      })
    })
  }

  // clock request v2
  if (req.method === 'GET' && req.path === '/hand-angles') {
    return jsonResponse({
      status: 200,
      body: await handAngles(storage, userCredentials.friend_group)
    })
  }

  // browser request
  if (req.method === 'GET') {
    const base = path.resolve('static');
    const filePath = path.resolve(base, '.' + (req.path == '/' ? '/index.html' : req.path));
    const ext = /[.][^.]*$/.exec(filePath)?.[0] || '.txt';
    if (!filePath.startsWith(base)) {
      return notFoundResponse;
    }
    try {
      return {
        status: 200,
        headers: {
          'Content-Type': extType[ext],
          'Set-Cookie': `googleApiKey=${googleApiKey}; SameSite=Strict`
        },
        // not sure how to support binary files in lambda responses yet:
        bodyString: await fs.readFile(filePath, { encoding: "utf-8" })
      }
    } catch (error) {
      return notFoundResponse;
    }
  }

  return notFoundResponse;
}