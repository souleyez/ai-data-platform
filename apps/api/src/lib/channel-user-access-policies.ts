import path from 'node:path';
import { readRuntimeStateJson, writeRuntimeStateJson } from './runtime-state-file.js';
import { STORAGE_CONFIG_DIR } from './paths.js';

export type ChannelAccessSubjectType = 'user' | 'group';

export type ChannelUserAccessPolicy = {
  id: string;
  sourceId: string;
  subjectType: ChannelAccessSubjectType;
  subjectId: string;
  visibleLibraryKeys: string[];
  updatedAt: string;
  updatedBy: string;
};

type ChannelUserAccessPolicyPayload = {
  items: ChannelUserAccessPolicy[];
};

const STORAGE_FILE = path.join(STORAGE_CONFIG_DIR, 'channel-user-access-policies.json');

function normalizeText(value: unknown) {
  return String(value || '').trim();
}

function normalizeTimestamp(value: unknown) {
  const text = normalizeText(value);
  if (!text) return '';
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) && parsed > 0 ? new Date(parsed).toISOString() : '';
}

function uniqueList(values: unknown[]) {
  return [...new Set(values.map((item) => normalizeText(item)).filter(Boolean))];
}

export function buildChannelUserAccessPolicyId(sourceId: string, subjectType: ChannelAccessSubjectType, subjectId: string) {
  return `${normalizeText(sourceId)}:${subjectType}:${normalizeText(subjectId)}`;
}

function normalizeSubjectType(value: unknown): ChannelAccessSubjectType {
  return normalizeText(value).toLowerCase() === 'group' ? 'group' : 'user';
}

function normalizePolicy(input: Partial<ChannelUserAccessPolicy> & Pick<ChannelUserAccessPolicy, 'sourceId' | 'subjectType' | 'subjectId'>) {
  const subjectType = normalizeSubjectType(input.subjectType);
  const sourceId = normalizeText(input.sourceId);
  const subjectId = normalizeText(input.subjectId);
  return {
    id: normalizeText(input.id) || buildChannelUserAccessPolicyId(sourceId, subjectType, subjectId),
    sourceId,
    subjectType,
    subjectId,
    visibleLibraryKeys: uniqueList(Array.isArray(input.visibleLibraryKeys) ? input.visibleLibraryKeys : []),
    updatedAt: normalizeTimestamp(input.updatedAt) || new Date().toISOString(),
    updatedBy: normalizeText(input.updatedBy),
  } satisfies ChannelUserAccessPolicy;
}

async function readPayload() {
  const { data } = await readRuntimeStateJson<ChannelUserAccessPolicyPayload>({
    filePath: STORAGE_FILE,
    fallback: { items: [] },
    normalize: (parsed) => {
      if (!parsed || typeof parsed !== 'object') return { items: [] };
      const items = Array.isArray((parsed as { items?: unknown[] }).items)
        ? (parsed as { items: unknown[] }).items
            .map((item) => {
              const source = item && typeof item === 'object' && !Array.isArray(item)
                ? item as Partial<ChannelUserAccessPolicy> & Pick<ChannelUserAccessPolicy, 'sourceId' | 'subjectType' | 'subjectId'>
                : null;
              if (!source?.sourceId || !source?.subjectId) return null;
              return normalizePolicy(source);
            })
            .filter((item): item is ChannelUserAccessPolicy => Boolean(item))
        : [];
      return { items };
    },
  });
  return data;
}

async function writePayload(items: ChannelUserAccessPolicy[]) {
  await writeRuntimeStateJson({
    filePath: STORAGE_FILE,
    payload: {
      items,
    },
  });
}

export async function listChannelUserAccessPolicies(sourceId?: string) {
  const payload = await readPayload();
  const normalizedSourceId = normalizeText(sourceId);
  const items = normalizedSourceId
    ? payload.items.filter((item) => item.sourceId === normalizedSourceId)
    : payload.items;
  return items.sort((left, right) => (
    left.subjectType.localeCompare(right.subjectType, 'zh-CN')
    || left.subjectId.localeCompare(right.subjectId, 'zh-CN')
  ));
}

export async function upsertChannelUserAccessPolicies(
  sourceId: string,
  items: Array<Pick<ChannelUserAccessPolicy, 'subjectType' | 'subjectId' | 'visibleLibraryKeys'>>,
  updatedBy = '',
) {
  const normalizedSourceId = normalizeText(sourceId);
  if (!normalizedSourceId) throw new Error('sourceId is required');
  const current = await listChannelUserAccessPolicies();
  const nextById = new Map(current.map((item) => [item.id, item]));

  for (const item of items) {
    const normalized = normalizePolicy({
      sourceId: normalizedSourceId,
      subjectType: item.subjectType,
      subjectId: item.subjectId,
      visibleLibraryKeys: item.visibleLibraryKeys,
      updatedBy,
      updatedAt: new Date().toISOString(),
    });
    nextById.set(normalized.id, normalized);
  }

  const nextItems = [...nextById.values()];
  await writePayload(nextItems);
  return nextItems.filter((item) => item.sourceId === normalizedSourceId);
}

export async function getSubjectAssignedLibraryKeys(sourceId: string, userId: string, groupIds: string[] = []) {
  const normalizedSourceId = normalizeText(sourceId);
  const normalizedUserId = normalizeText(userId);
  const normalizedGroupIds = uniqueList(Array.isArray(groupIds) ? groupIds : []);
  const policies = await listChannelUserAccessPolicies(normalizedSourceId);
  const userPolicy = policies.find((policy) => policy.subjectType === 'user' && policy.subjectId === normalizedUserId);
  const groupPolicies = new Map(
    policies
      .filter((policy) => policy.subjectType === 'group')
      .map((policy) => [policy.subjectId, policy] as const),
  );
  const keys = new Set<string>();

  if (userPolicy) {
    for (const key of userPolicy.visibleLibraryKeys) keys.add(key);
  }

  for (const groupId of normalizedGroupIds) {
    const groupPolicy = groupPolicies.get(groupId);
    if (!groupPolicy) continue;
    for (const key of groupPolicy.visibleLibraryKeys) keys.add(key);
  }

  return [...keys];
}
