import { DynamoDBStorage } from './storage/dynamodb-storage';
import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context
} from 'aws-lambda';
import {
  extractBasicAuthCredentials,
  verifyPassword
} from './utils/auth';
import * as path from 'path';
import * as fs from 'fs';

const storage = new DynamoDBStorage();

// Utility function to serve static files
const serveStaticFile = (filePath: string): APIGatewayProxyResult => {
  try {
    // Construct the full path to the file in the static directory
    const fullPath = path.join('/tmp/static', filePath);
    
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
      case '.json':
        contentType = 'application/json';
        break;
      case '.png':
        contentType = 'image/png';
        break;
      case '.jpg':
      case '.jpeg':
        contentType = 'image/jpeg';
        break;
      case '.svg':
        contentType = 'image/svg+xml';
        break;
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*'
      },
      body: fileContents,
      isBase64Encoded: false
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

// Unzip static files to /tmp during initialization
const unzipStaticFiles = () => {
  const { execSync } = require('child_process');
  
  try {
    // Create static directory in /tmp
    fs.mkdirSync('/tmp/static', { recursive: true });
    
    // Unzip the static files from the lambda package
    execSync('unzip /opt/nodejs/lambda.zip "static/*" -d /tmp');
  } catch (error) {
    console.error('Error unzipping static files:', error);
  }
};

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  // Unzip static files on first invocation
  if (!fs.existsSync('/tmp/static')) {
    unzipStaticFiles();
  }

  await storage.initialize();

  // Basic CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': true,
    'Content-Type': 'application/json'
  };

  // Handle static file serving for GET requests
  if (event.httpMethod === 'GET') {
    // Serve index.html for root route
    if (event.path === '/') {
      return serveStaticFile('index.html');
    }

    // Remove leading slash for file path
    const filePath = event.path.startsWith('/') ? event.path.slice(1) : event.path;
    return serveStaticFile(filePath);
  }

  // Existing POST /pub handler
  try {
    const authHeader = event.headers?.Authorization;
    const credentials = extractBasicAuthCredentials(authHeader);

    if (!credentials) {
      return {
        statusCode: 401,
        headers,
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

    // Only handle POST to /pub
    if (event.httpMethod !== 'POST' || !event.body) {
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

    // Fetch and return all locations in the user's friend group
    const groupLocations = await storage.getUserLocationsInGroup(userCredentials.friend_group);
   
    // Replace tid with username
    const response = groupLocations.map(entry => ({
      ...entry.location,
      tid: entry.username
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response)
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
