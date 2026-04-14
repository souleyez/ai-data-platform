import {
  installLatestOpenClaw,
  launchProviderLogin,
  loadModelConfigState,
  saveProviderSettings,
  updateSelectedModel,
} from './model-config.js';

type CommandFlags = Record<string, string>;
type ModelProviderId = 'openai' | 'github-copilot' | 'minimax' | 'moonshot' | 'zai';

export type PlatformControlResult = {
  ok: boolean;
  action: string;
  summary: string;
  data?: Record<string, unknown>;
};

export async function runModelCommand(subcommand: string, flags: CommandFlags): Promise<PlatformControlResult> {
  if (!subcommand || subcommand === 'status') {
    const state = await loadModelConfigState();
    return {
      ok: true,
      action: 'models.status',
      summary: `Loaded model runtime state${state.currentModel?.label ? ` for ${state.currentModel.label}` : ''}.`,
      data: {
        openclaw: state.openclaw,
        currentModel: state.currentModel || null,
        models: state.availableModels,
        providers: state.providers,
      },
    };
  }

  if (subcommand === 'select') {
    const modelId = String(flags.model || flags.id || '').trim();
    if (!modelId) throw new Error('Missing --model for models select.');
    const state = await updateSelectedModel(modelId);
    return {
      ok: true,
      action: 'models.select',
      summary: `Selected model "${state.currentModel?.label || modelId}".`,
      data: state,
    };
  }

  if (subcommand === 'save-provider') {
    const providerId = String(flags.provider || '').trim() as ModelProviderId;
    const methodId = String(flags.method || '').trim();
    if (!providerId || !methodId) {
      throw new Error('Missing --provider or --method for models save-provider.');
    }
    const state = await saveProviderSettings({
      providerId,
      methodId,
      apiKey: String(flags['api-key'] || ''),
    });
    return {
      ok: true,
      action: 'models.save-provider',
      summary: `Saved provider settings for "${providerId}".`,
      data: state,
    };
  }

  if (subcommand === 'launch-login') {
    const providerId = String(flags.provider || '').trim() as ModelProviderId;
    const methodId = String(flags.method || '').trim();
    if (!providerId || !methodId) {
      throw new Error('Missing --provider or --method for models launch-login.');
    }
    const result = await launchProviderLogin({
      providerId,
      methodId,
    });
    return {
      ok: true,
      action: 'models.launch-login',
      summary: result.message || `Launched login for "${providerId}".`,
      data: result as Record<string, unknown>,
    };
  }

  if (subcommand === 'install-openclaw') {
    const result = await installLatestOpenClaw();
    return {
      ok: true,
      action: 'models.install-openclaw',
      summary: 'OpenClaw installation/update requested.',
      data: result as Record<string, unknown>,
    };
  }

  throw new Error(`Unsupported models subcommand: ${subcommand}`);
}
