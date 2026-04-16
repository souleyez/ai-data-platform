'use client';

import { useEffect, useState } from 'react';
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
  const localSecretPending = !activeGrant && Boolean(String(normalizedState.localSecret || '').trim());
  const promptTargetLabel = promptTargetLibrary?.label || promptTargetLibrary?.name || promptTargetLibrary?.key || '';
  const inputPlaceholder = promptTargetLabel
    ? '输入该数据集已绑定的密钥'
    : '输入新密钥，或输入已绑定密钥继续使用';
  const submitLabel = promptTargetLabel ? '校验并解锁' : '保存并继续';

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
    setNotice('');
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
      const activeLibraryKeys = Array.isArray(nextState?.activeLibraryKeys) ? nextState.activeLibraryKeys : [];
      const promptUnlocked = !promptTargetLibrary?.key || activeLibraryKeys.includes(promptTargetLibrary.key);

      if (nextState?.activeGrant && promptUnlocked) {
        setNotice('');
        setModalOpen(false);
        onPromptHandled?.();
        return;
      }

      if (nextState?.activeGrant && promptTargetLabel && !promptUnlocked) {
        setNotice(`当前密钥已启用，但它不包含数据集“${promptTargetLabel}”。`);
        return;
      }

      if (String(nextState?.localSecret || '').trim()) {
        setNotice(promptTargetLabel
          ? `当前输入已保存为本地新密钥，但它还没有绑定到数据集“${promptTargetLabel}”，暂时不能解锁。后续新建数据集会自动绑定这把密钥。`
          : '当前输入已保存为本地新密钥。后续新建数据集会自动绑定这把密钥，创建后会自动转为正式授权。');
        return;
      }

      setNotice('');
      setModalOpen(false);
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

  return (
    <>
      <button
        type="button"
        className={`ghost-btn mode-entry-btn dataset-secret-trigger ${compact ? 'mode-entry-btn-compact' : ''}`.trim()}
        onClick={() => {
          setModalOpen(true);
          setError('');
          setNotice('');
        }}
      >
        输入密钥
      </button>

      {modalOpen ? (
        <div className="mode-modal-backdrop" onClick={() => {
          setModalOpen(false);
          onPromptHandled?.();
        }}>
          <div className="mode-modal card dataset-secret-modal" onClick={(event) => event.stopPropagation()}>
            <div className="mode-modal-head">
              <div>
                <strong>输入数据集密钥</strong>
                <div className="dataset-secret-modal-subtitle">
                  用途：如果这把密钥已经绑定过数据集，会立即解锁并复用；如果还没有绑定，它会先作为当前浏览器里的本地新密钥保存，
                  后续新建数据集、上传文档会自动沿用，首次建库后再自动转成正式授权。未输入密钥时，新建分组默认为公共分组。
                </div>
              </div>
              <button type="button" className="ghost-btn compact-inline-btn" onClick={() => {
                setModalOpen(false);
                onPromptHandled?.();
              }}>
                关闭
              </button>
            </div>

            {promptTargetLibrary ? (
              <div className="dataset-secret-modal-banner">
                数据集“{promptTargetLabel}”需要先输入已绑定密钥后才能进入。
              </div>
            ) : null}

            <form className="mode-modal-body dataset-secret-form" onSubmit={(event) => { void handleVerify(event); }}>
              <label className="mode-modal-label">
                <span>文本密钥</span>
                <input
                  className="filter-input mode-modal-input"
                  type="password"
                  value={secretInput}
                  onChange={(event) => setSecretInput(event.target.value)}
                  placeholder={inputPlaceholder}
                  autoFocus
                />
              </label>
              <div className="mode-modal-actions dataset-secret-form-actions">
                <button type="submit" className="primary-btn" disabled={loading || !secretInput.trim()}>
                  {loading ? '处理中...' : submitLabel}
                </button>
                <button type="button" className="ghost-btn" onClick={handleClearCache}>
                  清空本地缓存
                </button>
              </div>
            </form>

            {error ? <div className="mode-modal-error">{error}</div> : null}
            {notice ? <div className="dataset-secret-inline-note">{notice}</div> : null}

            <div className={`dataset-secret-current-card ${activeGrant ? 'is-grant' : (localSecretPending ? 'is-local' : 'is-empty')}`.trim()}>
              <strong>{activeGrant ? '当前活动密钥' : (localSecretPending ? '当前本地新密钥' : '当前密钥状态')}</strong>
              <span>
                {activeGrant
                  ? `${summarizeGrant(activeGrant)} · 已解锁 ${unlockedCount} 个数据集`
                  : (localSecretPending
                    ? '已保存 1 把本地新密钥，尚未绑定任何数据集。后续新建数据集会自动绑定这把密钥，并在创建后转成正式授权。'
                    : '当前未启用密钥，新建分组将保持公共可见。')}
              </span>
            </div>

            <div className="dataset-secret-cache-list">
              <strong>已缓存的已绑定密钥</strong>
              {localSecretPending ? (
                <div className="dataset-secret-inline-note">
                  当前浏览器里还有 1 把本地新密钥，等待首次绑定到新建数据集。
                </div>
              ) : null}
              {grants.length ? grants.map((grant) => {
                const active = activeGrant?.bindingId === grant.bindingId;
                return (
                  <div key={grant.bindingId} className="dataset-secret-cache-item">
                    <div className="dataset-secret-cache-copy">
                      <span>{summarizeGrant(grant)}</span>
                      <small>关联 {grant.libraryKeys.length} 个数据集</small>
                    </div>
                    <div className="dataset-secret-cache-actions">
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
                <div className="dataset-secret-inline-note">当前还没有缓存的已绑定密钥。</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
