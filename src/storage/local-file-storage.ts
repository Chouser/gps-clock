import * as fs from 'fs/promises';
import * as path from 'path';
import { StorageInterface, UserCredentials, LocationData } from './interfaces';

const usersFilePath = './data/users.json';
const locationsFilePath = './data/locations.json';
const rectsFilePath = './data/rects.json';

export class LocalFileStorage implements StorageInterface {
  private users: Record<string, UserCredentials> = {};
  private locations: Record<string, LocationData> = {};

  async initialize(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(usersFilePath), { recursive: true });

      try {
        const usersData = await fs.readFile(usersFilePath, 'utf8');
        this.users = JSON.parse(usersData);
      } catch {
        this.users = {};
      }

      try {
        const locationsData = await fs.readFile(locationsFilePath, 'utf8');
        this.locations = JSON.parse(locationsData);
      } catch {
        this.locations = {};
      }
    } catch (error) {
      console.error('Error initializing local storage', error);
    }
  }

  async saveRects(rects: any) {
    await fs.writeFile(rectsFilePath, JSON.stringify(rects, null, 2));
  }

  async getRects() {
    return JSON.parse(await fs.readFile(rectsFilePath, 'utf8'));
  }

  async getUserCredentials(username: string): Promise<UserCredentials | null> {
    return this.users[username] || null;
  }

  async setUserCredentials(username: string, hashed_password: string): Promise<void> {
    if (this.users[username].hashed_password == 'tbd') {
      this.users[username].hashed_password = hashed_password;
      await fs.writeFile(usersFilePath, JSON.stringify(this.users, null, 2));
    }
  }

  async saveUserLocation(username: string, friend_group: string, location: LocationData): Promise<void> {
    this.locations[username] = location;
    await fs.writeFile(locationsFilePath, JSON.stringify(this.locations, null, 2));
  }

  async getUserLocationsInGroup(friendGroup: string): Promise<{ username: string, location: LocationData }[]> {
    return Object.entries(this.locations)
      .filter(([username]) => {
        const userCredentials = this.users[username];
        return userCredentials && userCredentials.friend_group === friendGroup;
      })
      .map(([username, location]) => ({ username, location }));
  }
}
