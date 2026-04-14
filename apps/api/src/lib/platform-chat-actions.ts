import { executePlatformControlCommand } from './platform-control.js';
import { detectMatchedAction } from './platform-chat-actions-detection.js';
import {
  buildActionResult,
  buildFailedAction,
  normalizeText,
  resolveDatasourceReference,
  resolveLibraryReference,
  resolveModelReference,
} from './platform-chat-actions-support.js';
import type {
  ChatActionInvalidateDomain,
  ChatActionResult,
  ExecutedPlatformChatAction,
  MatchedChatAction,
} from './platform-chat-actions-types.js';

export type {
  ChatActionInvalidateDomain,
  ChatActionResult,
  ExecutedPlatformChatAction,
} from './platform-chat-actions-types.js';

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

  return executeDatasourceChatAction(matched);
}

async function executeDatasourceChatAction(matched: Extract<MatchedChatAction, { kind: 'datasource-run' | 'datasource-pause' | 'datasource-activate' }>) {
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
