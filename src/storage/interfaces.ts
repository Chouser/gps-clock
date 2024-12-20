export interface UserCredentials {
  hashed_password: string;
  friend_group: string;
}

export interface LocationData {
  [key: string]: any;  // Flexible to accept OwnTracks location JSON
}

export interface Rect {
  name: string;
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface StorageInterface {
  getUserCredentials(username: string): Promise<UserCredentials | null>;
  setUserCredentials(username: string, hashed_password: string): Promise<void>;
  saveRects(rects: any): Promise<void>;
  getRects(): Promise<[Rect]>;
  saveUserLocation(username: string, friend_group: string, location: LocationData): Promise<void>;
  getUserLocationsInGroup(friendGroup: string): Promise<{ username: string, location: LocationData }[]>;
  initialize(): Promise<void>;
}
