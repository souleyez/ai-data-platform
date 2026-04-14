export type PlatformCapabilityAreaId =
  | 'capabilities'
  | 'documents'
  | 'supply'
  | 'datasources'
  | 'reports'
  | 'models';

export type PlatformCommandSpec = {
  key: string;
  command: string;
  description: string;
};

export type PlatformCapabilityArea = {
  id: PlatformCapabilityAreaId;
  label: string;
  description: string;
  abilities: string[];
  commands: PlatformCommandSpec[];
};

export type PlatformIntegrationKind = 'service' | 'provider' | 'plugin' | 'tool' | 'search';

export type PlatformIntegration = {
  id: string;
  label: string;
  kind: PlatformIntegrationKind;
  description: string;
  capabilities: string[];
};
