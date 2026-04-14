export type CommandFlags = Record<string, string>;

export type PlatformControlResult = {
  ok: boolean;
  action: string;
  summary: string;
  data?: Record<string, unknown>;
};
