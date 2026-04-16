'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  clearStoredDatasetSecretState,
  createEmptyDatasetSecretState,
  loadStoredDatasetSecretState,
  resolveStoredDatasetSecretState,
  setActiveDatasetSecretGrant,
  verifyDatasetSecretText,
} from '../lib/dataset-secrets';

function summarizeGrant(grant) {
  const libraryKeys = Array.isArray(grant?.libraryKeys) ? grant.libraryKeys : [];
  if (!libraryKeys.length) return '未绑定数据集';
  if (libraryKeys.length === 1) return libraryKeys[0];
  return `${libraryKeys[0]} 等 ${libraryKeys.length} 个数据集`;
}

export default function FullIntelligenceModeButton({
  compact = false,
  datasetSecretState = null,
  onVerifySecret,
  onActivateGrant,
  onClearCache,
  promptTargetLibrary = null,
  onPromptHandled,
}) {
  const externalState = datasetSecretState && typeof datasetSecretState === 'object';
  const [internalState, setInternalState] = useState(() => loadStoredDatasetSecretState());
  const [modalOpen, setModalOpen] = useState(false);
  const [secretInput, setSecretInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const currentState = externalState ? datasetSecretState : internalState;
  const normalizedState = currentState && typeof currentState === 'object'
    ? currentState
    : createEmptyDatasetSecretState();
  const grants = Array.isArray(normalizedState.grants) ? normalizedState.grants : [];
  const activeGrant = normalizedState.activeGrant || null;
  const unlockedCount = Array.isArray(normalizedState.unlockedLibraryKeys) ? normalizedState.unlockedLibraryKeys.length : 0;

  useEffect(() => {
    if (externalState) return undefined;
    let alive = true;
    resolveStoredDatasetSecretState()
      .then((nextState) => {
        if (alive) setInternalState(nextState);
      })
      .catch(() => {
        if (alive) setInternalState(loadStoredDatasetSecretState());
      });
    return () => {
      alive = false;
    };
  }, [externalState]);

  useEffect(() => {
    if (!promptTargetLibrary) return;
    setModalOpen(true);
    setError('');
    setNotice(`数据集“${promptTargetLibrary.label || promptTargetLibrary.name || promptTargetLibrary.key}”需要输入密钥后才能进入。`);
  }, [promptTargetLibrary]);

  function syncState(nextState) {
    if (externalState) return nextState;
    setInternalState(nextState);
    return nextState;
  }

  async function handleVerify(event) {
    event?.preventDefault?.();
    const secret = String(secretInput || '').trim();
    if (!secret || loading) return;
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const nextState = onVerifySecret
        ? await onVerifySecret(secret)
        : await verifyDatasetSecretText(secret, normalizedState);
      syncState(nextState);
      setSecretInput('');
      setNotice(`已解锁 ${nextState?.activeLibraryKeys?.length || nextState?.unlockedLibraryKeys?.length || 0} 个数据集。`);
      onPromptHandled?.();
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : '密钥校验失败');
    } finally {
      setLoading(false);
    }
  }

  function handleActivate(bindingId) {
    const nextState = onActivateGrant
      ? onActivateGrant(bindingId)
      : setActiveDatasetSecretGrant(normalizedState, bindingId);
    syncState(nextState);
    setNotice('已切换当前活动密钥。');
  }

  function handleClearCache() {
    const nextState = onClearCache ? onClearCache() : clearStoredDatasetSecretState();
    syncState(nextState);
    setSecretInput('');
    setError('');
    setNotice('本地密钥缓存已清空。');
    onPromptHandled?.();
  }

  const buttonLabel = useMemo(() => {
    if (activeGrant) {
      return compact ? `输入密钥 · ${activeGrant.libraryKeys.length}` : `输入密钥 · 已解锁 ${unlockedCount} 个数据集`;
    }
    return '输入密钥';
  }, [activeGrant, compact, unlockedCount]);

  return (
    <>
      <button
        type="button"
        className={`ghost-btn ${compact ? 'ghost-btn-compact' : ''}`.trim()}
        onClick={() => {
          setModalOpen(true);
          setError('');
          setNotice('');
        }}
      >
        {buttonLabel}
      </button>

      {modalOpen ? (
        <div className="modal-backdrop" onClick={() => {
          setModalOpen(false);
          onPromptHandled?.();
        }}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <strong>输入数据集密钥</strong>
              <button type="button" className="ghost-btn compact-inline-btn" onClick={() => {
                setModalOpen(false);
                onPromptHandled?.();
              }}>
                关闭
              </button>
            </div>

            <form className="stack-sm" onSubmit={(event) => { void handleVerify(event); }}>
              <label className="field-label">
                <span>文本密钥</span>
                <input
                  type="password"
                  value={secretInput}
                  onChange={(event) => setSecretInput(event.target.value)}
                  placeholder="输入已绑定的数据集密钥"
                  autoFocus
                />
              </label>
              <div className="row gap-sm">
                <button type="submit" className="primary-btn" disabled={loading || !secretInput.trim()}>
                  {loading ? '校验中...' : '校验并启用'}
                </button>
                <button type="button" className="ghost-btn" onClick={handleClearCache}>
                  清空本地缓存
                </button>
              </div>
            </form>

            {error ? <p className="field-error">{error}</p> : null}
            {notice ? <p className="field-hint">{notice}</p> : null}

            <div className="stack-sm">
              <strong>本地已缓存的密钥授权</strong>
              {grants.length ? grants.map((grant) => {
                const active = activeGrant?.bindingId === grant.bindingId;
                return (
                  <div key={grant.bindingId} className="workspace-status-card">
                    <div className="workspace-status-row">
                      <span>{summarizeGrant(grant)}</span>
                      <button
                        type="button"
                        className={`ghost-btn compact-inline-btn ${active ? 'active' : ''}`.trim()}
                        onClick={() => handleActivate(grant.bindingId)}
                      >
                        {active ? '当前活动' : '设为活动'}
                      </button>
                    </div>
                  </div>
                );
              }) : (
                <p className="field-hint">当前还没有缓存的密钥授权。</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
