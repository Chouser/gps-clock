import * as http from 'http';
import * as path from 'path';
import * as common from './common';
import { StorageInterface } from './storage/interfaces';
import { LocalFileStorage } from './storage/local-file-storage';
import { DynamoDBStorage } from './storage/dynamodb-storage';

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
        let bodyString = '';
        for await (const chunk of req) {
          bodyString += chunk.toString();
        }

        const resp = await common.handleRequest(this.storage, {
          method: req.method || "GET",
          path: req.url || "/",
          authHeader: req.headers.authorization,
          bodyString: bodyString
        })

        res.writeHead(resp.status, resp.headers);
        res.end(resp.bodyString);
      } catch (error) {
        console.error(error);
        res.writeHead(500);
        res.end(JSON.stringify({ message: 'Internal Server Error' }));
      }
    });

    server.listen(this.port, () => {
      console.log(`Server running on port ${this.port} in ${this.isDynamoMode ? 'DynamoDB' : 'Local File'} mode`);
    });
  }
}
