import * as fs from 'fs/promises';
import * as path from 'path';
import { StorageInterface, UserCredentials, LocationData } from './interfaces';

export class LocalFileStorage implements StorageInterface {
  private usersFilePath: string;
  private locationsFilePath: string;
  private users: Record<string, UserCredentials> = {};
  private locations: Record<string, LocationData> = {};

  constructor(baseDir: string = './data') {
    this.usersFilePath = path.join(baseDir, 'users.json');
    this.locationsFilePath = path.join(baseDir, 'locations.json');
  }

  async initialize(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.usersFilePath), { recursive: true });

      try {
        const usersData = await fs.readFile(this.usersFilePath, 'utf8');
        this.users = JSON.parse(usersData);
      } catch {
        this.users = {};
      }

      try {
        const locationsData = await fs.readFile(this.locationsFilePath, 'utf8');
        this.locations = JSON.parse(locationsData);
      } catch {
        this.locations = {};
      }
    } catch (error) {
      console.error('Error initializing local storage', error);
    }
  }

  async getUserCredentials(username: string): Promise<UserCredentials | null> {
    return this.users[username] || null;
  }

  async saveUserLocation(username: string, friend_group: string, location: LocationData): Promise<void> {
    this.locations[username] = location;
    await fs.writeFile(this.locationsFilePath, JSON.stringify(this.locations, null, 2));
  }

  async getUserLocationsInGroup(friendGroup: string): Promise<{username: string, location: LocationData}[]> {
    return Object.entries(this.locations)
      .filter(([username]) => {
        const userCredentials = this.users[username];
        return userCredentials && userCredentials.friend_group === friendGroup;
      })
      .map(([username, location]) => ({ username, location }));
  }
}
