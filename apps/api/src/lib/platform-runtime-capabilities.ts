export type PlatformRuntimeCapabilities = {
  canReadLocalFiles: boolean;
  canImportLocalFiles: boolean;
  canModifyLocalSystemFiles: boolean;
};

export const FULL_PLATFORM_RUNTIME_CAPABILITIES: PlatformRuntimeCapabilities = {
  canReadLocalFiles: true,
  canImportLocalFiles: true,
  canModifyLocalSystemFiles: true,
};

export function getPlatformRuntimeStatus() {
  return {
    readOnly: !FULL_PLATFORM_RUNTIME_CAPABILITIES.canModifyLocalSystemFiles,
    capabilities: FULL_PLATFORM_RUNTIME_CAPABILITIES,
  };
}
