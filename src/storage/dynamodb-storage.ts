import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand
} from "@aws-sdk/lib-dynamodb";
import { StorageInterface, UserCredentials, LocationData } from './interfaces';

export class DynamoDBStorage implements StorageInterface {
  private client: DynamoDBDocumentClient;

  constructor(
    private usersTableName: string = 'OwnTracksUsers',
    private locationsTableName: string = 'OwnTracksLocations'
  ) {
    const dynamoClient = new DynamoDBClient({});
    this.client = DynamoDBDocumentClient.from(dynamoClient);
  }

  async initialize(): Promise<void> {
    // No specific initialization needed for DynamoDB
    return;
  }

  async getUserCredentials(username: string): Promise<UserCredentials | null> {
    const { Item } = await this.client.send(new GetCommand({
      TableName: this.usersTableName,
      Key: { username }
    }));
    return Item as UserCredentials || null;
  }

  async saveUserLocation(username: string, locationData: LocationData): Promise<void> {
    console.log("saveUser", {
        username,
        location: locationData,
        friend_group: locationData.friend_group || ''
      });
    await this.client.send(new PutCommand({
      TableName: this.locationsTableName,
      Item: {
        username,
        location: locationData,
        friend_group: locationData.friend_group || ''
      }
    }));
  }

  async getUserLocationsInGroup(friendGroup: string): Promise<{username: string, location: LocationData}[]> {
    const { Items } = await this.client.send(new QueryCommand({
      TableName: this.locationsTableName,
      IndexName: 'FriendGroupIndex',
      KeyConditionExpression: 'friend_group = :group',
      ExpressionAttributeValues: { ':group': friendGroup }
    }));

    return (Items || []).map(item => ({
      username: item.username,
      location: { ...item.location, tid: item.username }
    }));
  }
}
