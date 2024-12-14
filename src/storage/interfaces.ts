export interface UserCredentials {
  hashed_password: string;
  friend_group: string;
}

export interface LocationData {
  [key: string]: any;  // Flexible to accept OwnTracks location JSON
}

export interface StorageInterface {
  getUserCredentials(username: string): Promise<UserCredentials | null>;
  saveUserLocation(username: string, locationData: LocationData): Promise<void>;
  getUserLocationsInGroup(friendGroup: string): Promise<{username: string, location: LocationData}[]>;
  initialize(): Promise<void>;
}
