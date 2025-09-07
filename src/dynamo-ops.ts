import { StorageInterface } from './storage/interfaces';
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { PutCommand, UpdateCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
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
      process.exit(1);
    } else {
      console.error("Error creating user:", error.message);
      process.exit(1);
    }
  }
}

async function resetPassword(username: string) {
  try {
    await ddbDocClient.send(new UpdateCommand({
      TableName: dbs.usersTableName,
      Key: { username },
      UpdateExpression: "SET hashed_password = :password",
      ExpressionAttributeValues: {
        ":password": "tbd"
      },
      ConditionExpression: "attribute_exists(username)" // Ensure user exists
    }));

    console.log(`Password reset successfully for user '${username}'.`);
  } catch (error: any) {
    if (error.name === "ConditionalCheckFailedException") {
      console.error(`Error: User '${username}' does not exist.`);
      process.exit(1);
    } else {
      console.error("Error resetting password:", error.message);
      process.exit(1);
    }
  }
}

function formatLastUpdate(timestamp: number): string {
  const now = Date.now();
  const lastUpdate = new Date(timestamp * 1000); // Convert from seconds to milliseconds
  const diffMs = now - lastUpdate.getTime();
  
  const minutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  let ageDescription: string;
  if (minutes < 1) {
    ageDescription = "just now";
  } else if (minutes < 60) {
    ageDescription = `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  } else if (hours < 24) {
    ageDescription = `${hours} hour${hours === 1 ? '' : 's'} ago`;
  } else {
    ageDescription = `${days} day${days === 1 ? '' : 's'} ago`;
  }

  const localTime = lastUpdate.toLocaleString();
  return `${localTime} (${ageDescription})`;
}

async function listUpdates(friendGroup: string) {
  try {
    const storage: StorageInterface = new dbs.DynamoDBStorage()
    const userLocations = await storage.getUserLocationsInGroup(friendGroup);

    if (userLocations.length === 0) {
      console.log(`No users found in friend group '${friendGroup}'.`);
      return;
    }

    console.log(`Last updates for friend group '${friendGroup}':`);
    console.log("─".repeat(60));

    // Sort by username for consistent output
    userLocations.sort((a, b) => a.username.localeCompare(b.username));

    for (const { username, location } of userLocations) {
      if (location.tst) {
        const lastUpdateInfo = formatLastUpdate(location.tst);
        console.log(`${username.padEnd(20)} ${lastUpdateInfo}`);
      } else {
        console.log(`${username.padEnd(20)} No timestamp available`);
      }
    }
  } catch (error: any) {
    console.error("Error listing updates:", error.message);
    process.exit(1);
  }
}

function showUsage() {
  console.log("Usage:");
  console.log("  npm run dynamo-ops create-user <username> <friendGroup>");
  console.log("  npm run dynamo-ops reset-password <username>");
  console.log("  npm run dynamo-ops list-updates <friendGroup>");
}

// Parse command-line arguments
const args = process.argv.slice(2);

if (args.length < 1) {
  showUsage();
  process.exit(1);
}

const [command, ...commandArgs] = args;

async function main() {
  switch (command) {
    case "create-user":
      if (commandArgs.length < 2) {
        console.error("Error: create-user requires username and friendGroup arguments");
        showUsage();
        process.exit(1);
      }
      const [username, friendGroup] = commandArgs;
      await createUser(username, friendGroup);
      break;

    case "reset-password":
      if (commandArgs.length < 1) {
        console.error("Error: reset-password requires username argument");
        showUsage();
        process.exit(1);
      }
      const [usernameToReset] = commandArgs;
      await resetPassword(usernameToReset);
      break;

    case "list-updates":
      if (commandArgs.length < 1) {
        console.error("Error: list-updates requires friendGroup argument");
        showUsage();
        process.exit(1);
      }
      const [friendGroupToList] = commandArgs;
      await listUpdates(friendGroupToList);
      break;

    default:
      console.error(`Error: Unknown command '${command}'`);
      showUsage();
      process.exit(1);
  }
}

main().catch(error => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
