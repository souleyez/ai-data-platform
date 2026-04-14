import type { MatchedChatAction } from './platform-chat-actions-types.js';
import {
  extractQuotedNames,
  normalizeForMatch,
  normalizeText,
  sanitizeDatasourceReference,
  sanitizeLibraryName,
} from './platform-chat-actions-support.js';

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

export async function detectMatchedAction(prompt: string): Promise<MatchedChatAction | null> {
  return detectCreateLibrary(prompt)
    || detectRenameLibrary(prompt)
    || detectDeleteLibrary(prompt)
    || (await detectModelSelection(prompt))
    || detectDatasourceControl(prompt);
}
