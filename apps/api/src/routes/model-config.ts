import type { FastifyInstance } from 'fastify';
import { installLatestOpenClaw, loadModelConfigState, updateSelectedModel } from '../lib/model-config.js';

export async function registerModelConfigRoutes(app: FastifyInstance) {
  app.get('/model-config', async () => {
    const state = await loadModelConfigState();
    return {
      status: 'ok',
      ...state,
    };
  });

  const runInstall = async (_request: unknown, reply: { code: (statusCode: number) => { send: (payload: unknown) => unknown } }) => {
    try {
      const result = await installLatestOpenClaw();
      return {
        message: '已完成云端模型服务安装与默认网关启动。',
        ...result,
      };
    } catch (error) {
      return reply.code(500).send({
        error: 'install_openclaw_failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  app.post('/model-config', async (request, reply) => {
    const body = (request.body || {}) as { modelId?: string };
    const modelId = String(body.modelId || '').trim();

    if (!modelId) {
      return reply.code(400).send({
        error: 'modelId_is_required',
        message: '请选择一个可用模型。',
      });
    }

    try {
      const state = await updateSelectedModel(modelId);
      return {
        status: 'updated',
        message: `已切换当前云端模型为 ${state.currentModel?.label || modelId}`,
        ...state,
      };
    } catch (error) {
      return reply.code(400).send({
        error: 'model_update_failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get('/model-config/install', runInstall);
  app.post('/model-config/install', runInstall);
}
