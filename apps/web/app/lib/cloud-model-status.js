'use client';

export const CLOUD_MODEL_STATUS_STORAGE_KEY = 'aidp_cloud_model_status_v1';
export const CLOUD_MODEL_STATUS_EVENT = 'aidp-cloud-model-status-changed';
const UNAVAILABLE_STATUS_TTL_MS = 15 * 60 * 1000;

function canUseWindow() {
  return typeof window !== 'undefined';
}

function dispatchCloudModelStatusEvent(detail) {
  if (!canUseWindow()) return;
  window.dispatchEvent(new CustomEvent(CLOUD_MODEL_STATUS_EVENT, { detail }));
}

export function loadCloudModelStatus() {
  if (!canUseWindow()) return null;
  try {
    const raw = window.localStorage.getItem(CLOUD_MODEL_STATUS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const updatedAt = Number(parsed.updatedAt || 0);
    if (parsed.status === 'unavailable' && updatedAt > 0 && Date.now() - updatedAt > UNAVAILABLE_STATUS_TTL_MS) {
      window.localStorage.removeItem(CLOUD_MODEL_STATUS_STORAGE_KEY);
      return null;
    }
    return {
      status: parsed.status === 'healthy' ? 'healthy' : 'unavailable',
      reason: String(parsed.reason || '').trim(),
      message: String(parsed.message || '').trim(),
      updatedAt,
    };
  } catch {
    return null;
  }
}

export function setCloudModelHealthy(source = 'chat-success') {
  if (!canUseWindow()) return;
  const next = {
    status: 'healthy',
    reason: String(source || 'chat-success'),
    message: '',
    updatedAt: Date.now(),
  };
  window.localStorage.setItem(CLOUD_MODEL_STATUS_STORAGE_KEY, JSON.stringify(next));
  dispatchCloudModelStatusEvent(next);
}

export function setCloudModelUnavailable(message, reason = 'chat-fallback') {
  if (!canUseWindow()) return;
  const next = {
    status: 'unavailable',
    reason: String(reason || 'chat-fallback'),
    message: String(message || '当前云端模型暂时不可用，请稍后再试。'),
    updatedAt: Date.now(),
  };
  window.localStorage.setItem(CLOUD_MODEL_STATUS_STORAGE_KEY, JSON.stringify(next));
  dispatchCloudModelStatusEvent(next);
}
