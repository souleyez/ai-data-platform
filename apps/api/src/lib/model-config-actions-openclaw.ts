import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  getWslDistro,
  loadCanonicalOpenClawConfig,
  migrateLegacyKimiSearchConfig,
  writeCanonicalOpenClawConfig,
} from './model-config-openclaw.js';
import { loadModelConfigState } from './model-config-runtime.js';
import { TOOLS_DIR } from './paths.js';
import {
  PROVIDER_FAMILIES,
  type LaunchProviderLoginInput,
} from './model-config-types.js';
import { rememberProviderMethod } from './model-config-actions-support.js';

const execFileAsync = promisify(execFile);

export async function launchProviderLogin(input: LaunchProviderLoginInput) {
  if (process.platform !== 'win32') {
    throw new Error('网页登录拉起目前只支持 Windows 开发机。');
  }

  const provider = PROVIDER_FAMILIES.find((item) => item.id === input.providerId);
  if (!provider) {
    throw new Error(`不支持的模型供应商：${input.providerId}`);
  }
  const method = provider.methods.find((item) => item.id === input.methodId);
  if (!method) {
    throw new Error(`不支持的登录方式：${input.methodId}`);
  }
  if (method.kind !== 'browserLogin') {
    throw new Error('该方式不需要网页登录，请直接保存 API Key。');
  }

  const { config, source } = await loadCanonicalOpenClawConfig();
  if (config) {
    const migrated = migrateLegacyKimiSearchConfig(config);
    await writeCanonicalOpenClawConfig(migrated.config, source);
  }

  const scriptPath = path.join(TOOLS_DIR, 'openclaw-auth-login.ps1');
  await execFileAsync(
    'powershell.exe',
    [
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath,
      '-Provider',
      method.providerId,
      '-Method',
      method.openclawMethod,
      '-Distro',
      getWslDistro(),
    ],
    {
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    },
  );

  await rememberProviderMethod(provider.id, method.id);

  return {
    status: 'login_started',
    message: `已为 ${provider.label} 打开登录窗口，请在新终端完成授权后回到页面刷新状态。`,
    state: await loadModelConfigState(),
  };
}

export async function installLatestOpenClaw() {
  if (process.platform !== 'win32') {
    throw new Error('当前安装脚本仅支持 Windows + WSL 开发环境。');
  }

  const scriptPath = path.join(TOOLS_DIR, 'install-openclaw-latest.ps1');
  const { stdout } = await execFileAsync('powershell.exe', ['-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });

  return {
    status: 'installed',
    output: stdout.trim(),
    state: await loadModelConfigState(),
  };
}
