import { listDatasourceDefinitions } from './datasource-definitions.js';
import { loadDocumentLibraries } from './document-libraries.js';
import { loadModelConfigState } from './model-config.js';
import { executePlatformControlCommand } from './platform-control.js';

export type ChatActionInvalidateDomain =
  | 'documents'
  | 'datasources'
  | 'reports'
  | 'models'
  | 'bots'
  | 'audit';

export type ChatActionResult = {
  domain: ChatActionInvalidateDomain;
  action: string;
  status: 'completed' | 'failed';
  summary: string;
  invalidate: ChatActionInvalidateDomain[];
  entity?: Record<string, unknown> | null;
};

export type ExecutedPlatformChatAction = {
  content: string;
  libraries: Array<{ key: string; label: string }>;
  actionResult: ChatActionResult;
};

type MatchedChatAction =
  | { kind: 'create-library'; name: string }
  | { kind: 'update-library'; reference: string; nextLabel: string }
  | { kind: 'delete-library'; reference: string }
  | { kind: 'select-model' }
  | { kind: 'datasource-run' | 'datasource-pause' | 'datasource-activate'; reference: string };

function normalizeText(value: string) {
  return String(value || '')
    .normalize('NFKC')
    .trim();
}

function normalizeForMatch(value: string) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeReference(value: string) {
  return normalizeText(value)
    .replace(/^[“"'`]+|[”"'`]+$/gu, '')
    .trim();
}

function sanitizeLibraryName(value: string) {
  return sanitizeReference(value)
    .replace(/^(?:一个|个|一组|一套|一个新的|新的)\s*/u, '')
    .replace(/\s*(?:数据集分组|数据集|知识库分组|知识库|文档库|分组)\s*$/u, '')
    .trim();
}

function sanitizeDatasourceReference(value: string) {
  return sanitizeReference(value)
    .replace(/\s*(?:数据源|采集源|采集任务|采集)\s*$/u, '')
    .trim();
}

function extractQuotedNames(prompt: string) {
  return Array.from(normalizeText(prompt).matchAll(/[“"']([^“"'\n]{1,80})[”"']/gu))
    .map((match) => sanitizeReference(match[1] || ''))
    .filter(Boolean);
}

function scoreMatch(reference: string, haystacks: string[]) {
  const normalizedReference = normalizeForMatch(reference);
  if (!normalizedReference) return 0;
  let best = 0;
  for (const haystack of haystacks) {
    const normalizedHaystack = normalizeForMatch(haystack);
    if (!normalizedHaystack) continue;
    if (normalizedReference === normalizedHaystack) {
      best = Math.max(best, 200);
      continue;
    }
    if (normalizedHaystack.includes(normalizedReference)) {
      best = Math.max(best, 120 + Math.min(60, normalizedReference.length * 3));
      continue;
    }
    if (normalizedReference.includes(normalizedHaystack)) {
      best = Math.max(best, 90 + Math.min(40, normalizedHaystack.length * 2));
    }
  }
  return best;
}

async function resolveLibraryReference(reference: string) {
  const target = sanitizeLibraryName(reference);
  if (!target) throw new Error('缺少要操作的数据集分组名称。');
  const libraries = await loadDocumentLibraries();
  const matches = libraries
    .map((library) => ({
      library,
      score: scoreMatch(target, [library.key, library.label, library.description || '']),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);

  if (!matches.length) {
    throw new Error(`没有找到数据集分组“${target}”。`);
  }

  if (matches.length > 1 && matches[1].score >= matches[0].score - 10) {
    const choices = matches.slice(0, 3).map((item) => item.library.label).join('、');
    throw new Error(`数据集分组匹配不明确：${choices}`);
  }

  return matches[0].library;
}

async function resolveDatasourceReference(reference: string) {
  const target = sanitizeDatasourceReference(reference);
  if (!target) throw new Error('缺少要操作的数据源名称。');
  const definitions = await listDatasourceDefinitions();
  const matches = definitions
    .map((item) => ({
      item,
      score: scoreMatch(target, [
        item.id,
        item.name,
        ...item.targetLibraries.flatMap((library) => [library.key, library.label]),
      ]),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  if (!matches.length) {
    throw new Error(`没有找到数据源“${target}”。`);
  }

  if (matches.length > 1 && matches[1].score >= matches[0].score - 10) {
    const choices = matches.slice(0, 3).map((entry) => entry.item.name).join('、');
    throw new Error(`数据源匹配不明确：${choices}`);
  }

  return matches[0].item;
}

async function resolveModelReference(prompt: string) {
  const state = await loadModelConfigState();
  const candidates = state.availableModels || [];
  if (!candidates.length) {
    throw new Error('当前没有可切换的模型。');
  }
  const normalizedPrompt = normalizeForMatch(prompt);
  const matches = candidates
    .map((item) => ({
      item,
      score: scoreMatch(normalizedPrompt, [
        item.id,
        item.label,
        `${item.provider} ${item.label}`,
      ]),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  if (!matches.length) {
    throw new Error('没有识别到要切换的模型。');
  }

  if (matches.length > 1 && matches[1].score >= matches[0].score - 8) {
    const choices = matches.slice(0, 4).map((entry) => `${entry.item.provider} / ${entry.item.label}`).join('、');
    throw new Error(`模型匹配不明确：${choices}`);
  }

  return matches[0].item;
}

function mapPlatformActionToInvalidate(action: string): ChatActionInvalidateDomain[] {
  if (action.startsWith('documents.')) return ['documents'];
  if (action.startsWith('datasources.')) return ['datasources'];
  if (action.startsWith('reports.')) return ['reports'];
  if (action.startsWith('models.')) return ['models'];
  return [];
}

function mapPlatformActionDomain(action: string): ChatActionInvalidateDomain {
  const [domain = 'documents'] = String(action || '').split('.');
  if (domain === 'documents' || domain === 'datasources' || domain === 'reports' || domain === 'models') {
    return domain;
  }
  return 'documents';
}

function buildActionResult(input: {
  action: string;
  status?: 'completed' | 'failed';
  summary: string;
  entity?: Record<string, unknown> | null;
  invalidate?: ChatActionInvalidateDomain[];
}): ChatActionResult {
  const status = input.status || 'completed';
  return {
    domain: mapPlatformActionDomain(input.action),
    action: input.action,
    status,
    summary: input.summary,
    invalidate: input.invalidate || (status === 'completed' ? mapPlatformActionToInvalidate(input.action) : []),
    entity: input.entity || null,
  };
}

function buildFailedAction(input: {
  action: string;
  content: string;
  summary: string;
  entity?: Record<string, unknown> | null;
}): ExecutedPlatformChatAction {
  return {
    content: input.content,
    libraries: [],
    actionResult: buildActionResult({
      action: input.action,
      status: 'failed',
      summary: input.summary,
      entity: input.entity,
      invalidate: [],
    }),
  };
}

function detectCreateLibrary(prompt: string): MatchedChatAction | null {
  const text = normalizeText(prompt);
  const normalized = normalizeForMatch(prompt);
  if (!/(新建|创建|新增|添加|加个|加一个|建立)/u.test(text)) return null;
  if (!/(数据集分组|数据集|知识库分组|知识库|文档库|分组)/u.test(text)) return null;

  const quoted = extractQuotedNames(text)
    .map((item) => sanitizeLibraryName(item))
    .find(Boolean);
  if (quoted) return { kind: 'create-library', name: quoted };

  const patterns = [
    /(?:新建|创建|新增|添加|加个|加一个|建立)(?:一个|个|一组|一套|一个新的|新的)?\s*([^，。！？\n]{1,60}?)(?:数据集分组|数据集|知识库分组|知识库|文档库|分组)(?:$|[，。！？\n])/u,
    /(?:新建|创建|新增|添加|加个|加一个|建立).{0,12}?(?:叫|名为|名称为|取名为)\s*([^，。！？\n]{1,60})(?:$|[，。！？\n])/u,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const candidate = sanitizeLibraryName(match?.[1] || '');
    if (candidate) return { kind: 'create-library', name: candidate };
  }

  const tail = normalized.match(/(?:新建|创建|新增|添加|加个|加一个|建立)\s+(.+)$/u);
  const candidate = sanitizeLibraryName(tail?.[1] || '');
  return candidate ? { kind: 'create-library', name: candidate } : null;
}

function detectRenameLibrary(prompt: string): MatchedChatAction | null {
  const text = normalizeText(prompt);
  if (!/(数据集分组|数据集|知识库分组|知识库|文档库|分组)/u.test(text)) return null;
  if (!/(改名|重命名|改成|改为|名称改为|名字改为)/u.test(text)) return null;

  const quoted = extractQuotedNames(text).map((item) => sanitizeLibraryName(item)).filter(Boolean);
  if (quoted.length >= 2) {
    return { kind: 'update-library', reference: quoted[0], nextLabel: quoted[1] };
  }

  const patterns = [
    /(?:把|将)?\s*([^，。！？\n]{1,60}?)(?:数据集分组|数据集|知识库分组|知识库|文档库|分组)\s*(?:改名为|重命名为|改成|改为|名称改为|名字改为)\s*([^，。！？\n]{1,60})(?:$|[，。！？\n])/u,
    /(?:把|将)?\s*([^，。！？\n]{1,60}?)\s*(?:改名为|重命名为|改成|改为)\s*([^，。！？\n]{1,60})(?:数据集分组|数据集|知识库分组|知识库|文档库|分组)?(?:$|[，。！？\n])/u,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const reference = sanitizeLibraryName(match?.[1] || '');
    const nextLabel = sanitizeLibraryName(match?.[2] || '');
    if (reference && nextLabel) {
      return { kind: 'update-library', reference, nextLabel };
    }
  }

  return null;
}

function detectDeleteLibrary(prompt: string): MatchedChatAction | null {
  const text = normalizeText(prompt);
  if (!/(删除|移除|删掉|去掉|清掉)/u.test(text)) return null;
  if (!/(数据集分组|数据集|知识库分组|知识库|文档库|分组)/u.test(text)) return null;

  const quoted = extractQuotedNames(text).map((item) => sanitizeLibraryName(item)).find(Boolean);
  if (quoted) return { kind: 'delete-library', reference: quoted };

  const patterns = [
    /(?:删除|移除|删掉|去掉|清掉)(?:一个|个)?\s*([^，。！？\n]{1,60}?)(?:数据集分组|数据集|知识库分组|知识库|文档库|分组)(?:$|[，。！？\n])/u,
    /(?:把|将)\s*([^，。！？\n]{1,60}?)(?:数据集分组|数据集|知识库分组|知识库|文档库|分组)\s*(?:删除|移除|删掉|去掉|清掉)(?:$|[，。！？\n])/u,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const reference = sanitizeLibraryName(match?.[1] || '');
    if (reference) return { kind: 'delete-library', reference };
  }

  return null;
}

async function detectModelSelection(prompt: string): Promise<MatchedChatAction | null> {
  const text = normalizeText(prompt);
  if (!/(切换|切到|换成|改用|改成|使用|选用|换到|切换到)/u.test(text)) return null;
  if (!/(模型|model|gpt|glm|kimi|minimax|copilot|claude|openai)/i.test(text)) return null;
  return { kind: 'select-model' };
}

function detectDatasourceControl(prompt: string): MatchedChatAction | null {
  const text = normalizeText(prompt);
  if (!/(数据源|采集源|采集任务|采集)/u.test(text)) return null;

  let kind: MatchedChatAction['kind'] | null = null;
  if (/(暂停|停用|停止|停采)/u.test(text)) kind = 'datasource-pause';
  else if (/(启用|恢复|重新启用|重新打开|激活|继续采集)/u.test(text)) kind = 'datasource-activate';
  else if (/(运行|执行|启动|立即跑|跑一下|试跑|手动跑|立即执行)/u.test(text)) kind = 'datasource-run';
  if (!kind) return null;

  const quoted = extractQuotedNames(text).map((item) => sanitizeDatasourceReference(item)).find(Boolean);
  if (quoted) return { kind, reference: quoted };

  const patterns = [
    /(?:运行|执行|启动|立即跑|跑一下|试跑|手动跑|立即执行|暂停|停用|停止|停采|启用|恢复|重新启用|重新打开|激活|继续采集)(?:一个|个)?\s*([^，。！？\n]{1,80}?)(?:数据源|采集源|采集任务|采集)(?:$|[，。！？\n])/u,
    /(?:把|将)\s*([^，。！？\n]{1,80}?)(?:数据源|采集源|采集任务|采集)\s*(?:运行|执行|启动|暂停|停用|停止|停采|启用|恢复|重新启用|激活)(?:$|[，。！？\n])/u,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const reference = sanitizeDatasourceReference(match?.[1] || '');
    if (reference) return { kind, reference };
  }

  return null;
}

async function detectMatchedAction(prompt: string): Promise<MatchedChatAction | null> {
  return detectCreateLibrary(prompt)
    || detectRenameLibrary(prompt)
    || detectDeleteLibrary(prompt)
    || (await detectModelSelection(prompt))
    || detectDatasourceControl(prompt);
}

export async function tryExecutePlatformChatAction(input: {
  prompt: string;
}): Promise<ExecutedPlatformChatAction | null> {
  const prompt = normalizeText(input.prompt);
  if (!prompt) return null;

  const matched = await detectMatchedAction(prompt);
  if (!matched) return null;

  if (matched.kind === 'create-library') {
    try {
      const result = await executePlatformControlCommand([
        'documents',
        'create-library',
        '--name',
        matched.name,
      ]);
      const item = (result.data?.item || null) as Record<string, unknown> | null;
      const key = String(item?.key || '').trim();
      const label = String(item?.label || matched.name).trim() || matched.name;
      return {
        content: `已新建数据集分组“${label}”。左侧数据集列表会立即刷新，并默认切到这个分组。`,
        libraries: key ? [{ key, label }] : [],
        actionResult: buildActionResult({
          action: result.action,
          summary: result.summary,
          entity: item,
        }),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '新建数据集分组失败。';
      return buildFailedAction({
        action: 'documents.create-library',
        content: `新建数据集分组失败：${message}`,
        summary: message,
      });
    }
  }

  if (matched.kind === 'update-library') {
    try {
      const library = await resolveLibraryReference(matched.reference);
      const result = await executePlatformControlCommand([
        'documents',
        'update-library',
        '--library',
        library.key,
        '--label',
        matched.nextLabel,
      ]);
      const item = (result.data?.item || null) as Record<string, unknown> | null;
      return {
        content: `已将数据集分组“${library.label}”改名为“${matched.nextLabel}”。左侧数据集列表已刷新。`,
        libraries: item?.key ? [{ key: String(item.key), label: String(item.label || matched.nextLabel) }] : [],
        actionResult: buildActionResult({
          action: result.action,
          summary: result.summary,
          entity: item,
        }),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '修改数据集分组失败。';
      return buildFailedAction({
        action: 'documents.update-library',
        content: `修改数据集分组失败：${message}`,
        summary: message,
      });
    }
  }

  if (matched.kind === 'delete-library') {
    try {
      const library = await resolveLibraryReference(matched.reference);
      const result = await executePlatformControlCommand([
        'documents',
        'delete-library',
        '--library',
        library.key,
      ]);
      return {
        content: `已删除数据集分组“${library.label}”。左侧数据集列表已刷新。`,
        libraries: [],
        actionResult: buildActionResult({
          action: result.action,
          summary: result.summary,
          entity: { key: library.key, label: library.label },
        }),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '删除数据集分组失败。';
      return buildFailedAction({
        action: 'documents.delete-library',
        content: `删除数据集分组失败：${message}`,
        summary: message,
      });
    }
  }

  if (matched.kind === 'select-model') {
    try {
      const model = await resolveModelReference(prompt);
      const result = await executePlatformControlCommand([
        'models',
        'select',
        '--model',
        String(model.id || '').trim(),
      ]);
      const currentModel = (result.data?.currentModel || null) as Record<string, unknown> | null;
      return {
        content: `已切换到模型“${String(model.provider || '').trim()} / ${String(model.label || '').trim()}”。顶部工具条会同步刷新当前模型状态。`,
        libraries: [],
        actionResult: buildActionResult({
          action: result.action,
          summary: result.summary,
          entity: currentModel || {
            id: String(model.id || '').trim(),
            label: String(model.label || '').trim(),
            provider: String(model.provider || '').trim(),
          },
        }),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '切换模型失败。';
      return buildFailedAction({
        action: 'models.select',
        content: `切换模型失败：${message}`,
        summary: message,
      });
    }
  }

  try {
    const datasource = await resolveDatasourceReference(matched.reference);
    const subcommand = matched.kind === 'datasource-run'
      ? 'run'
      : (matched.kind === 'datasource-pause' ? 'pause' : 'activate');
    const result = await executePlatformControlCommand([
      'datasources',
      subcommand,
      '--datasource',
      datasource.id,
    ]);
    const verb = subcommand === 'run' ? '已运行' : (subcommand === 'pause' ? '已暂停' : '已启用');
    const nextDatasource = (result.data?.datasource || null) as Record<string, unknown> | null;
    return {
      content: `${verb}数据源“${datasource.name}”。页面会同步刷新当前采集状态。`,
      libraries: [],
      actionResult: buildActionResult({
        action: result.action,
        summary: result.summary,
        entity: nextDatasource || {
          id: datasource.id,
          name: datasource.name,
        },
      }),
    };
  } catch (error) {
    const action = matched.kind === 'datasource-run'
      ? 'datasources.run'
      : (matched.kind === 'datasource-pause' ? 'datasources.pause' : 'datasources.activate');
    const message = error instanceof Error ? error.message : '数据源操作失败。';
    return buildFailedAction({
      action,
      content: `数据源操作失败：${message}`,
      summary: message,
    });
  }
}
