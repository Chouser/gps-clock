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

const storage = new DynamoDBStorage();

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  await storage.initialize();

  // Basic CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': true,
    'Content-Type': 'application/json'
  };

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
