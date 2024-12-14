import * as http from 'http';
import * as fs from 'fs/promises';
import * as path from 'path';
import { StorageInterface } from './storage/interfaces';
import { LocalFileStorage } from './storage/local-file-storage';
import { DynamoDBStorage } from './storage/dynamodb-storage';
import {
  extractBasicAuthCredentials,
  verifyPassword
} from './utils/auth';

export class OwnTracksServer {
  private storage: StorageInterface;
  private staticDir: string;

  constructor(
    private port: number = 3000,
    private isDynamoMode: boolean = false
  ) {
    this.storage = isDynamoMode
      ? new DynamoDBStorage()
      : new LocalFileStorage();

    this.staticDir = path.join(process.cwd(),
      isDynamoMode ? 'static' : 'static'
    );
  }

  async start() {
    await this.storage.initialize();

    const server = http.createServer(async (req, res) => {
      try {
        const authHeader = req.headers.authorization;
        const credentials = extractBasicAuthCredentials(authHeader);

        if (!credentials) {
          return this.sendUnauthorized(res);
        }

        const { username, password } = credentials;
        const userCredentials = await this.storage.getUserCredentials(username);

        if (!userCredentials || !verifyPassword(password, userCredentials.hashed_password)) {
          return this.sendUnauthorized(res);
        }

        switch (req.method) {
          case 'POST':
            if (req.url === '/pub') {
              await this.handlePublish(req, res, username, userCredentials.friend_group);
              break;
            }
            break;
          case 'GET':
            if (req.url === '/') {
              await this.serveStaticFiles(res);
              break;
            }
            break;
          default:
            res.writeHead(405);
            res.end('Method Not Allowed');
        }
      } catch (error) {
        console.error(error);
        res.writeHead(500);
        res.end('Internal Server Error');
      }
    });

    server.listen(this.port, () => {
      console.log(`Server running on port ${this.port} in ${this.isDynamoMode ? 'DynamoDB' : 'Local File'} mode`);
    });
  }

  private async handlePublish(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    username: string,
    userFriendGroup: string
  ) {
    let body = '';
    for await (const chunk of req) {
      body += chunk.toString();
    }

    const locationData = JSON.parse(body);
    console.log("body", locationData);

    if (locationData._type == 'location') {
      // Store the location
      await this.storage.saveUserLocation(username, locationData);
    }

    // Fetch and return all locations in the user's friend group
    const groupLocations = await this.storage.getUserLocationsInGroup(userFriendGroup);

    // Replace tid with username
    const response = groupLocations
      .filter(entry => entry.username != username)
      .map(entry => ({
        ...entry.location,
        tid: entry.username
      }));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response));
  }

  private async serveStaticFiles(res: http.ServerResponse) {
    try {
      const indexPath = path.join(this.staticDir, 'index.html');
      const content = await fs.readFile(indexPath);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(content);
    } catch (error) {
      res.writeHead(404);
      res.end('Not Found');
    }
  }

  private sendUnauthorized(res: http.ServerResponse) {
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="OwnTracks"' });
    res.end('Unauthorized');
  }
}
