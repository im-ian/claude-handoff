export interface Substitution {
  from: string;
  to: string;
}

export interface ScopeConfig {
  include: string[];
  optIn: string[];
  excludeExtra: string[];
}

export interface SecretPolicy {
  // Relative paths the scanner should not inspect (e.g. files the user has
  // verified contain intentional template placeholders that match secret regexes).
  allow: string[];
}

export interface DeviceConfig {
  device: string;
  hubRemote: string;
  claudeDir: string;
  substitutions: Substitution[];
  scope: ScopeConfig;
  secretPolicy: SecretPolicy;
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

export interface DependencyEntry {
  description?: string;
  install: {
    darwin?: string;
    linux?: string;
  };
}

export interface DependencyManifest {
  version: 1;
  dependencies: Record<string, DependencyEntry>;
}
