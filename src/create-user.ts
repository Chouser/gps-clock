import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { PutCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import * as dbs from './storage/dynamodb-storage'

// Create a DynamoDB client
const client = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(client);

async function createUser(username: string, friendGroup: string) {
  try {
    // Attempt to create a new user entry
    await ddbDocClient.send(new PutCommand({
      TableName: dbs.usersTableName,
      Item: {
        username,
        friend_group: friendGroup,
        hashed_password: "tbd"
      },
      ConditionExpression: "attribute_not_exists(username)", // Ensure user doesn't already exist
    }));

    console.log(`User '${username}' created successfully.`);
  } catch (error: any) {
    if (error.name === "ConditionalCheckFailedException") {
      console.error(`Error: User '${username}' already exists.`);
    } else {
      console.error("Error creating user:", error.message);
    }
  }
}

// Parse command-line arguments
const args = process.argv.slice(2);

if (args.length < 2) {
  console.error("Usage: npm run create-user <username> <friendGroup>");
  process.exit(1);
}

const [username, friendGroup] = args;

createUser(username, friendGroup);
