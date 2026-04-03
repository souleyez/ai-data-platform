import type { FastifyInstance } from 'fastify';
import {
  installLatestOpenClaw,
  launchProviderLogin,
  loadModelConfigState,
  saveProviderSettings,
  updateSelectedModel,
} from '../lib/model-config.js';

type ProviderId = 'openai' | 'github-copilot' | 'minimax' | 'moonshot' | 'zai';

type ModelConfigBody = {
  action?: 'select-model' | 'save-provider' | 'launch-login';
  modelId?: string;
  providerId?: ProviderId;
  methodId?: string;
  apiKey?: string;
};

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
        message: '模型引擎已安装，并已请求启动默认网关。',
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
    const body = ((request.body || {}) as ModelConfigBody) || {};
    const action = body.action || 'select-model';

    if (action === 'select-model') {
      const modelId = String(body.modelId || '').trim();
      if (!modelId) {
        return reply.code(400).send({
          error: 'modelId_is_required',
          message: 'modelId is required.',
        });
      }

      try {
        const state = await updateSelectedModel(modelId);
        return {
          status: 'updated',
          message: `Current model switched to ${state.currentModel?.label || modelId}.`,
          ...state,
        };
      } catch (error) {
        return reply.code(400).send({
          error: 'model_update_failed',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (action === 'save-provider') {
      const providerId = body.providerId;
      const methodId = String(body.methodId || '').trim();
      if (!providerId || !methodId) {
        return reply.code(400).send({
          error: 'provider_config_is_required',
          message: 'providerId and methodId are required.',
        });
      }

      try {
        const state = await saveProviderSettings({
          providerId,
          methodId,
          apiKey: String(body.apiKey || ''),
        });
        return {
          status: 'provider_saved',
          message: '模型提供方配置已保存。',
          ...state,
        };
      } catch (error) {
        return reply.code(400).send({
          error: 'provider_save_failed',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (action === 'launch-login') {
      const providerId = body.providerId;
      const methodId = String(body.methodId || '').trim();
      if (!providerId || !methodId) {
        return reply.code(400).send({
          error: 'provider_login_is_required',
          message: 'providerId and methodId are required.',
        });
      }

      try {
        const result = await launchProviderLogin({
          providerId,
          methodId,
        });
        return {
          ...result,
          ...result.state,
        };
      } catch (error) {
        return reply.code(400).send({
          error: 'provider_login_failed',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return reply.code(400).send({
      error: 'unsupported_action',
      message: `Unsupported action: ${String(action)}`,
    });
  });

  app.get('/model-config/install', runInstall);
  app.post('/model-config/install', runInstall);
}
