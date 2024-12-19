import { OwnTracksServer } from './server';

// Check if running in Lambda environment
const isLambdaRuntime = !!process.env.LAMBDA_RUNTIME_DIR;

export const handler = require('./lambda').handler;

console.log("Cold start, CodeKey", process.env.CODE_KEY)

if (!isLambdaRuntime) {
  // Local server startup
  const port = parseInt(process.env.PORT || '3000');
  const isDynamoMode = process.env.DYNAMO_MODE === 'true';

  const server = new OwnTracksServer(port, isDynamoMode);
  server.start();
}
