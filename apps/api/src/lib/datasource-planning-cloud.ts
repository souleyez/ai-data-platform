import { runOpenClawChat } from './openclaw-adapter.js';
import type { DatasourcePreset } from './datasource-presets.js';

export function buildPlanningPrompt(
  prompt: string,
  libraries: Array<{ key: string; label: string }>,
  presets: DatasourcePreset[],
) {
  const libraryText = libraries.map((item) => `${item.label}(${item.key})`).join('、') || '暂无';
  const presetText = presets.map((item) => `${item.name} -> ${item.kind}`).join('\n') || '暂无预置';
  return [
    '请把下面的自然语言采集需求整理成结构化数据源配置草案。',
    '只返回 JSON，不要解释，不要 Markdown。',
    'JSON schema:',
    '{"name":"...","kind":"web_public|web_login|web_discovery|database|erp","authMode":"none|credential|manual_session|database_password|api_token","scheduleKind":"manual|daily|weekly","targetLibraries":[{"key":"...","label":"...","mode":"primary|secondary"}],"config":{"url":"","focus":"","notes":"","keywords":[],"siteHints":[],"tables":[],"views":[],"modules":[]}}',
    `可选知识库：${libraryText}`,
    `可选预置站点：\n${presetText}`,
    `需求：${prompt}`,
  ].join('\n\n');
}

export function parseCloudPlan(raw: string) {
  try {
    const trimmed = String(raw || '').trim();
    const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1].trim() : trimmed;
    const firstBrace = candidate.indexOf('{');
    const lastBrace = candidate.lastIndexOf('}');
    const jsonText = firstBrace >= 0 && lastBrace > firstBrace ? candidate.slice(firstBrace, lastBrace + 1) : candidate;
    return JSON.parse(jsonText) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function looksLikeBrokenPlan(parsed: Record<string, unknown> | null) {
  if (!parsed) return true;
  return !String(parsed.name || '').trim();
}

export async function tryCloudPlanning(
  prompt: string,
  libraries: Array<{ key: string; label: string }>,
  presets: DatasourcePreset[],
) {
  const planning = runOpenClawChat({
    prompt: buildPlanningPrompt(prompt, libraries, presets),
    systemPrompt: [
      '你是数据源配置助手。',
      '你的任务是把自然语言采集需求转换成结构化数据源配置草案。',
      '不要输出解释，只返回严格 JSON。',
      '如果用户要持续采集公开站点列表页和详情页，优先使用 web_discovery。',
      '如果提到数据库、SQL、表、视图，使用 database。',
      '如果提到 ERP、订单后台、客诉后台、CRM，使用 erp。',
    ].join('\n'),
  });
  return Promise.race([planning, new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000))]);
}
