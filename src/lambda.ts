import {
  APIGatewayProxyEventV2,
  APIGatewayProxyResult,
  Context
} from 'aws-lambda';
import * as common from './common';
import { StorageInterface } from './storage/interfaces';
import { LocalFileStorage } from './storage/local-file-storage';
import { DynamoDBStorage } from './storage/dynamodb-storage';

// Select storage based on environment variable
const isDynamoMode = process.env.DYNAMO_MODE === 'true';
const storage: StorageInterface = isDynamoMode
  ? new DynamoDBStorage()
  : new LocalFileStorage();

export const handler = async (
  event: APIGatewayProxyEventV2,
  context: Context
): Promise<APIGatewayProxyResult> => {
  try {
    // Initialize storage
    await storage.initialize();

    const req = event.requestContext.http;
    const stagePrefix = `/${event.requestContext.stage}/`;
    const requestPath = req.path.startsWith(stagePrefix)
      ? req.path.slice(stagePrefix.length - 1)
      : req.path;

    const resp = await common.handleRequest(storage, {
      method: req.method,
      path: requestPath,
      authHeader: event.headers?.authorization,
      bodyString: event.body || ''
    });

    return {
      statusCode: resp.status,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': true,
        ...resp.headers
      },
      body: resp.bodyString || ''
    }

  } catch (error) {
    console.error('Lambda handler error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error' })
    };
  }
};
