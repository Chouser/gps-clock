import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { StorageInterface } from './storage/interfaces';

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
    body: { error: 'Unauthorized'}
})

const notFoundResponse = jsonResponse({
    status: 404,
    body: { error: 'Not found'}
})

const extType : {[name: string]: string} = {
    '.txt': 'text/plain',
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript'
}

export async function handleRequest(storage: StorageInterface, req: Request) : Promise<Response> {
  if (!req.authHeader || !req.authHeader.startsWith('Basic ')) {
    return unauthorizedResponse;
  }

  const base64Credentials = req.authHeader.split(' ')[1];
  const [username, password] = Buffer.from(base64Credentials, 'base64').toString('ascii').split(':');

  const userCredentials = await storage.getUserCredentials(username);
  if (userCredentials?.hashed_password !== 'tbd'
    && (!userCredentials
        || hashPassword(password) !== userCredentials.hashed_password))
  {
    return unauthorizedResponse;
  }

  // location posted from phone
  if (req.method === 'POST' && req.path === '/pub') {
    const body = JSON.parse(req.bodyString);
    if (body._type == 'location') {
      if(userCredentials.hashed_password === 'tbd') {
        await storage.setUserCredentials(username, hashPassword(password));
      }
      await storage.saveUserLocation(username, userCredentials.friend_group, body);
    }

    const groupLocations = await storage.getUserLocationsInGroup(userCredentials.friend_group);

    return jsonResponse({
        status: 200,
        body: groupLocations
            .filter(entry => entry.username != username)
            .map(entry => ({
                ...entry.location,
                tid: entry.username
            }))
    })
  }

  // browser request
  if (req.method === 'GET') {
    const base = path.resolve('static');
    const filePath = path.resolve(base, '.' + (req.path == '/' ? '/index.html' : req.path));
    const ext = /[.][^.]*$/.exec(filePath)?.[0] || '.txt';
    console.log({msg: `get file`, base, filePath, ext, mime: extType[ext]});
    if(!filePath.startsWith(base)) {
        return notFoundResponse;
    }
    try {
      return {
        status: 200,
        headers: {'Content-Type': extType[ext]},
        // not sure how to support binary files in lambda responses yet:
        bodyString: await fs.readFile(filePath, {encoding: "utf-8"})
      }
    } catch (error) {
        return notFoundResponse;
    }
  }

  return notFoundResponse;
}