import { OwnTracksServer } from './server';

const port = parseInt(process.env.PORT || '3000');
const isDynamoMode = process.env.DYNAMO_MODE === 'true';

const server = new OwnTracksServer(port, isDynamoMode);
server.start();
