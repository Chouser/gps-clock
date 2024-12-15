import {
  APIGatewayProxyEventV2,
  APIGatewayProxyResult,
  Context
} from 'aws-lambda';
import * as path from 'path';
import * as fs from 'fs';
import { StorageInterface } from './storage/interfaces';
import { LocalFileStorage } from './storage/local-file-storage';
import { DynamoDBStorage } from './storage/dynamodb-storage';
import {
  extractBasicAuthCredentials,
  verifyPassword
} from './utils/auth';

// Select storage based on environment variable
const isDynamoMode = process.env.DYNAMO_MODE === 'true';
const storage: StorageInterface = isDynamoMode 
  ? new DynamoDBStorage() 
  : new LocalFileStorage();

// Utility function to serve static files
const serveStaticFile = (filePath: string): APIGatewayProxyResult => {
  try {
    // Construct the full path to the file
    const staticDir = path.join(process.cwd(), 'static');
    const fullPath = path.join(staticDir, filePath);

    // Check if file exists
    if (!fs.existsSync(fullPath)) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': '*'
        },
        body: 'File Not Found'
      };
    }

    // Read file contents
    const fileContents = fs.readFileSync(fullPath, 'utf8');

    // Determine content type based on file extension
    const ext = path.extname(filePath).toLowerCase();
    let contentType = 'text/plain';
    switch (ext) {
      case '.html':
        contentType = 'text/html';
        break;
      case '.css':
        contentType = 'text/css';
        break;
      case '.js':
        contentType = 'application/javascript';
        break;
      // Add more content types as needed
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*'
      },
      body: fileContents
    };
  } catch (error) {
    console.error('Error serving static file:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*'
      },
      body: 'Internal Server Error'
    };
  }
};

export const handler = async (
  event: APIGatewayProxyEventV2,
  context: Context
): Promise<APIGatewayProxyResult> => {
  // Initialize storage
  await storage.initialize();

  // Standard CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': true,
    'Content-Type': 'application/json'
  };

  try {
    // Extract and verify credentials
    const authHeader = event.headers?.authorization;
    console.log("headers", event.headers);
    const credentials = extractBasicAuthCredentials(authHeader);

    if (!credentials) {
      return {
        statusCode: 401,
        headers: {...headers, 'WWW-Authenticate': 'Basic realm="OwnTracks"' },
        body: JSON.stringify({ message: 'Unauthorized' })
      };
    }

    const { username, password } = credentials;
    const userCredentials = await storage.getUserCredentials(username);

    if (!userCredentials || !verifyPassword(password, userCredentials.hashed_password)) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: 'Invalid credentials' })
      };
    }

    console.log("Event", event);
    const req = event.requestContext.http;
    const reqPath = req.path.slice(event.requestContext.stage.length + 1);

    console.log("reqPath", reqPath);
    // Handle different routes and methods
    if (req.method === 'GET') {
      // Serve static files
      if (reqPath === '/' || reqPath === '') {
        return serveStaticFile('index.html');
      }

      // Serve other static files if needed
      const requestPath = reqPath.startsWith('/')
        ? reqPath.slice(1)
        : reqPath;
      return serveStaticFile(requestPath);
    }

    if (req.method === 'POST' && reqPath === '/pub') {
      // Publish location
      if (!event.body) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ message: 'Invalid request' })
        };
      }

      const locationData = JSON.parse(event.body);

      if (locationData._type !== 'location') {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ message: 'Invalid location data' })
        };
      }

      // Store the location
      await storage.saveUserLocation(username, locationData);

      // Fetch locations for the user's friend group
      const groupLocations = await storage.getUserLocationsInGroup(userCredentials.friend_group);

      // Prepare response, filtering out the current user's location
      const response = groupLocations
        .filter(entry => entry.username !== username)
        .map(entry => ({
          ...entry.location,
          tid: entry.username
        }));

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(response)
      };
    }

    // Unsupported method or route
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ message: 'Method Not Allowed' })
    };

  } catch (error) {
    console.error('Lambda handler error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' })
    };
  }
};
