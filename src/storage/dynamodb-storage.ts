import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand
} from "@aws-sdk/lib-dynamodb";
import { StorageInterface, UserCredentials, LocationData } from './interfaces';

export const usersTableName: string = 'OwnTracksUsers';
export const locationsTableName: string = 'OwnTracksLocations';

export class DynamoDBStorage implements StorageInterface {
  private client: DynamoDBDocumentClient;

  constructor() {
    const dynamoClient = new DynamoDBClient({});
    this.client = DynamoDBDocumentClient.from(dynamoClient);
  }

  async initialize(): Promise<void> {
    // No specific initialization needed for DynamoDB
    return;
  }

  async getUserCredentials(username: string): Promise<UserCredentials | null> {
    const { Item } = await this.client.send(new GetCommand({
      TableName: usersTableName,
      Key: { username }
    }));
    return Item as UserCredentials || null;
  }

  async setUserCredentials(username: string, hashed_password: string): Promise<void> {
    await this.client.send(new UpdateCommand({
      TableName: usersTableName,
      Key: { username },
      UpdateExpression: "SET hashed_password = :newPw",
      ConditionExpression: "hashed_password = :tbd",
      ExpressionAttributeValues: {
        ":newPw": hashed_password,
        ":tbd": "tbd"
      }
    }));
  }

  async saveUserLocation(username: string, friend_group: string, location: LocationData): Promise<void> {
    await this.client.send(new PutCommand({
      TableName: locationsTableName,
      Item: { friend_group, username, location }
    }));
  }

  async getUserLocationsInGroup(friendGroup: string): Promise<{username: string, location: LocationData}[]> {
    const { Items } = await this.client.send(new QueryCommand({
      TableName: locationsTableName,
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
