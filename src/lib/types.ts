

export type UserRole = 'Admin' | 'Editor' | 'Viewer'; // Legacy, will be phased out

export interface AppUser {
  username: string;
  roles: string[];
  permissions?: string[]; // Permissions are resolved at login time and attached to the user object
  role?: UserRole; // Kept for migrating old data format
}

export interface Role {
  name: string;
  permissions: string[];
}

export interface GameServer {
  id: string;
  name: string;
  status: 'Online' | 'Offline' | 'Starting' | 'Error' | 'restarting' | 'stopping';
  port: number;
  ip: string; 
  softwareType: string; 
  serverVersion: string; 
  description?: string;
  logoUrl?: string; 
  
  minRam: string; 
  maxRam: string; 
  
  cpuUsage?: number; 
  ramUsage?: number; 
  currentRam?: number; // RAM usage in MB
  lastOnline?: string; 
  linkedInstances?: BackendInstance[]; 
  
  templateId?: string;
  pid?: number;
  consoleLogFile?: string;
  launchArgs?: string;
  paperBuild?: string; 
  velocityBuild?: string; 
  maxPlayers?: number;
  connectedPlayers?: string[]; // Added for player list
  jarFileName?: string;
  tags?: string[];
}

export interface BackendInstance {
  id: string;
  name: string;
  status: 'Online' | 'Offline';
  version: string;
  ram: string; // e.g., "2GB"
}

export interface ServerTemplate {
  id: string;
  name: string;
  description: string;
  mainServerConfig: string; 
  backendInstanceConfig: string; 
  plugins: string[];
}

export type ConfigAdvisorInput = {
  requirements: string;
};

export type ConfigAdvisorOutput = {
  mainServerConfiguration: string;
  backendInstanceConfiguration: string;
  pluginRecommendations: string;
};

export interface DirectoryItem {
  id: string; // Unique ID, usually serverId + type + base64(path)
  name: string;
  type: 'file' | 'folder';
  path: string; // Full server-relative path, e.g. "/plugins/MyPlugin.jar" or "/world/"
  size: string; // Formatted string like "1.2 KB" or "-" for folders
  lastModified: string; // ISO date string
  serverId: string;
}

export interface ServerPlugin {
  id: string;
  name: string;
  version: string;
  isEnabled: boolean;
  fileName: string;
  serverId: string;
}

export interface BannedPlayerEntry {
  uuid: string;
  name: string;
  created: string; 
  source: string;
  expires: string; 
  reason: string;
}

export interface Backup {
  fileName: string;
  size: string;
  createdAt: string;
}

// Spiget Types
export interface SpigetPlugin {
  id: number;
  name: string;
  tag: string;
  downloads: number;
  testedVersions: string[];
  author: {
    id: number;
    name: string;
  };
  icon: {
    url: string; // data URI
  };
}

export interface SpigetSearchResult {
  pagination: {
    limit: number;
    offset: number;
    count: number;
  };
  result: SpigetPlugin[];
}

export interface SpigetPluginVersion {
  id: number;
  name: string;
}


// Modrinth Types
export interface ModrinthProject {
  slug: string;
  project_id: string;
  project_type: string;
  server_id: string;
  title: string;
  description: string;
  icon_url: string;
  client_side: string;
  server_side: string;
  downloads: number;
  versions: string[]; // array of version IDs
}

export interface ModrinthVersion {
    id: string;
    project_id: string;
    name: string;
    version_number: string;
    game_versions: string[];
    version_type: 'release' | 'beta' | 'alpha';
    loaders: string[];
    featured: boolean;
    files: ModrinthFile[];
    project?: ModrinthProject; // Sometimes included
}

export interface ModrinthFile {
    hashes: {
        sha512: string;
        sha1: string;
    };
    url: string;
    filename: string;
    primary: boolean;
    size: number;
}

export interface DiagnoseLogsOutput {
  hasError: boolean;
  errorSummary: string;
  possibleCause: string;
  suggestedFix: string;
}
