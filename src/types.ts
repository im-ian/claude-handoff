export interface Substitution {
  from: string;
  to: string;
}

export interface ScopeConfig {
  include: string[];
  optIn: string[];
  excludeExtra: string[];
}

export interface DeviceConfig {
  device: string;
  hubRemote: string;
  claudeDir: string;
  substitutions: Substitution[];
  scope: ScopeConfig;
}

export interface DeviceVersion {
  device: string;
  pushedAt: string;
  host: string;
  fileCount: number;
  byteCount: number;
}

export interface HubManifest {
  version: 1;
  devices: Record<string, { latest: DeviceVersion }>;
  updatedAt: string;
}
