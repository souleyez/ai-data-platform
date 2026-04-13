'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchModelConfig, fetchOperationsOverview, updateModelConfig } from '../home-api';
import { CLOUD_MODEL_STATUS_EVENT, loadCloudModelStatus } from '../lib/cloud-model-status';
import ThemeToggleButton from './ThemeToggleButton';

const DESKTOP_NAV_LINKS = [
  { label: '智能会话', href: '/' },
  { label: '数据集', href: '/documents' },
  { label: '采集源', href: '/datasources' },
  { label: '报表', href: '/reports' },
  { label: '审计', href: '/audit' },
];

const INITIAL_MODEL_STATE = {
  openclaw: {
    installed: false,
    running: false,
    installedVersion: null,
  },
  currentModel: null,
  availableModels: [],
  providers: [],
};

function getRuntimeLabel(openclaw) {
  if (openclaw?.running) return '已连接';
  if (openclaw?.installed) return '网关未连通';
  return '未安装';
}

export default function HomeWorkspaceToolbar({
  sourceItems = [],
  initialModelState = INITIAL_MODEL_STATE,
  fullIntelligenceSlot = null,
  currentPath = '/',
}) {
  const [modelState, setModelState] = useState(initialModelState);
  const [modelBusy, setModelBusy] = useState(false);
  const [modelMessage, setModelMessage] = useState('');
  const [cloudStatus, setCloudStatus] = useState(() => loadCloudModelStatus());
  const [healthState, setHealthState] = useState({
    warningCount: 0,
    criticalCount: 0,
    deepParseBacklog: 0,
    captureErrorTasks: 0,
    dynamicOutputCount: 0,
    draftBlockedCount: 0,
    draftNeedsAttentionCount: 0,
  });

  useEffect(() => {
    let alive = true;

    async function loadModelState() {
      try {
        const json = await fetchModelConfig();
        if (!alive) return;
        setModelState({
          openclaw: json.openclaw || INITIAL_MODEL_STATE.openclaw,
          currentModel: json.currentModel || null,
          availableModels: Array.isArray(json.availableModels) ? json.availableModels : [],
          providers: Array.isArray(json.providers) ? json.providers : [],
        });
      } catch {
        if (!alive) return;
        setModelMessage('模型状态读取失败');
      }
    }

    void loadModelState();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const syncCloudStatus = () => {
      setCloudStatus(loadCloudModelStatus());
    };
    syncCloudStatus();
    window.addEventListener(CLOUD_MODEL_STATUS_EVENT, syncCloudStatus);
    window.addEventListener('storage', syncCloudStatus);
    return () => {
      window.removeEventListener(CLOUD_MODEL_STATUS_EVENT, syncCloudStatus);
      window.removeEventListener('storage', syncCloudStatus);
    };
  }, []);

  useEffect(() => {
    let alive = true;

    async function loadHealthState() {
      try {
        const json = await fetchOperationsOverview();
        if (!alive) return;
        setHealthState({
          warningCount: Number(json?.stability?.summary?.warningCount || 0),
          criticalCount: Number(json?.stability?.summary?.criticalCount || 0),
          deepParseBacklog: Number(json?.stability?.summary?.deepParseBacklog || 0),
          captureErrorTasks: Number(json?.stability?.summary?.captureErrorTasks || 0),
          dynamicOutputCount: Number(json?.stability?.summary?.dynamicOutputCount || 0),
          draftBlockedCount: Number(json?.stability?.summary?.draftBlockedCount || 0),
          draftNeedsAttentionCount: Number(json?.stability?.summary?.draftNeedsAttentionCount || 0),
        });
      } catch {
        if (!alive) return;
        setHealthState((current) => current);
      }
    }

    void loadHealthState();
    const timer = setInterval(() => {
      void loadHealthState();
    }, 30000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const currentModel = useMemo(
    () => modelState.currentModel || modelState.availableModels[0] || null,
    [modelState],
  );
  const configuredProviderCount = useMemo(
    () => modelState.providers.filter((item) => item.configured).length,
    [modelState.providers],
  );
  const modelConnectionState = useMemo(() => {
    if (!modelState.openclaw?.running) {
      return {
        level: 'critical',
        badgeText: '未连通',
        summary: '云端网关未连通',
        detail: '当前模型网关未连接，云端问答不可用。',
      };
    }
    if (cloudStatus?.status === 'healthy') {
      return {
        level: 'healthy',
        badgeText: '已连接',
        summary: '云端模型可用',
        detail: currentModel ? `${currentModel.provider} / ${currentModel.label}` : '最近一次云端调用成功。',
      };
    }
    if (cloudStatus?.status === 'unavailable') {
      return {
        level: 'critical',
        badgeText: '不可用',
        summary: '云端模型暂不可用',
        detail: cloudStatus.message || '最近一次云端调用失败，请稍后重试或检查模型连接。',
      };
    }
    if (!currentModel && !modelState.availableModels.length) {
      return {
        level: 'critical',
        badgeText: '未配置',
        summary: '未配置云端模型',
        detail: '当前还没有可用模型，请先完成模型连接配置。',
      };
    }
    if (configuredProviderCount === 0) {
      return {
        level: 'warning',
        badgeText: '待验',
        summary: '云端模型待验证',
        detail: '当前网关在线，但还没有确认可用的云端提供方。',
      };
    }
    return {
      level: 'healthy',
      badgeText: '已连接',
      summary: '云端模型可用',
      detail: currentModel ? `${currentModel.provider} / ${currentModel.label}` : '已连接',
    };
  }, [
    cloudStatus,
    currentModel,
    configuredProviderCount,
    modelState.availableModels,
    modelState.openclaw?.running,
  ]);
  const healthLabel = healthState.criticalCount > 0
    ? 'critical'
    : healthState.warningCount > 0
      ? 'warning'
      : 'healthy';
  const healthText = healthState.criticalCount > 0
    ? '需要处理'
    : healthState.warningCount > 0
      ? '需要关注'
      : '运行正常';

  async function refreshModelState(message = '') {
    try {
      const json = await fetchModelConfig();
      setModelState({
        openclaw: json.openclaw || INITIAL_MODEL_STATE.openclaw,
        currentModel: json.currentModel || null,
        availableModels: Array.isArray(json.availableModels) ? json.availableModels : [],
        providers: Array.isArray(json.providers) ? json.providers : [],
      });
      if (message) setModelMessage(message);
    } catch {
      if (message) setModelMessage(message);
    }
  }

  async function handleSelectModel(modelId) {
    if (!modelId || modelBusy) return;
    setModelBusy(true);
    setModelMessage('');
    try {
      const json = await updateModelConfig({ action: 'select-model', modelId });
      setModelState({
        openclaw: json.openclaw || INITIAL_MODEL_STATE.openclaw,
        currentModel: json.currentModel || null,
        availableModels: Array.isArray(json.availableModels) ? json.availableModels : [],
        providers: Array.isArray(json.providers) ? json.providers : [],
      });
      setModelMessage(json.message || '模型已切换');
    } catch (error) {
      setModelMessage(error instanceof Error ? error.message : '模型切换失败');
    } finally {
      setModelBusy(false);
    }
  }

  return (
    <header className="card home-toolbar">
      <div className="home-toolbar-left">
        <a href="/" className="home-toolbar-brand">
          <span className="home-toolbar-brand-mark">AI</span>
          <span className="home-toolbar-brand-name">智能助手</span>
        </a>
        <nav className="home-toolbar-nav" aria-label="桌面导航">
          {DESKTOP_NAV_LINKS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`home-toolbar-nav-link ${item.href === currentPath ? 'active' : ''}`}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </div>

      <div className="home-toolbar-right">
        <ThemeToggleButton compact />

        <div className="home-toolbar-flyout">
          <button type="button" className="ghost-btn home-toolbar-flyout-trigger">
            系统健康
            <span className={`library-tab-count health-${healthLabel}`}>
              {healthState.criticalCount > 0 ? `${healthState.criticalCount} 严重` : healthState.warningCount > 0 ? `${healthState.warningCount} 提醒` : '正常'}
            </span>
          </button>
          <div className="home-toolbar-flyout-panel">
            <div className="home-toolbar-flyout-title">系统健康</div>
            <div className="home-toolbar-health-status">
              <div className="home-toolbar-model-line">
                <strong>当前状态</strong>
                <span>{healthText}</span>
              </div>
              <span className={`home-toolbar-health-badge health-${healthLabel}`}>{healthText}</span>
            </div>
            <div className="home-toolbar-model-line">
              <strong>严重告警</strong>
              <span>{healthState.criticalCount}</span>
            </div>
            <div className="home-toolbar-model-line">
              <strong>一般提醒</strong>
              <span>{healthState.warningCount}</span>
            </div>
            <div className="home-toolbar-model-line">
              <strong>深解析积压</strong>
              <span>{healthState.deepParseBacklog}</span>
            </div>
            <div className="home-toolbar-model-line">
              <strong>采集错误任务</strong>
              <span>{healthState.captureErrorTasks}</span>
            </div>
            <div className="home-toolbar-model-line">
              <strong>动态报表</strong>
              <span>{healthState.dynamicOutputCount}</span>
            </div>
            <div className="home-toolbar-model-line">
              <strong>草稿需补齐</strong>
              <span>{healthState.draftBlockedCount}</span>
            </div>
            <div className="home-toolbar-model-line">
              <strong>草稿待优化</strong>
              <span>{healthState.draftNeedsAttentionCount}</span>
            </div>
          </div>
        </div>

        <div className="home-toolbar-flyout">
          <button type="button" className="ghost-btn home-toolbar-flyout-trigger">
            已连接数据源
            <span className="library-tab-count">{sourceItems.length}</span>
          </button>
          <div className="home-toolbar-flyout-panel">
            <div className="home-toolbar-flyout-title">已连接数据源</div>
            <div className="home-toolbar-source-list">
              {sourceItems.map((item) => (
                <div key={item.name} className="home-toolbar-source-item">
                  <span className={`dot ${item.status}`}></span>
                  <span>{item.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="home-toolbar-flyout">
          <button type="button" className="ghost-btn home-toolbar-flyout-trigger">
            模型连接
            <span className={`library-tab-count status-${modelConnectionState.level}`}>
              {modelConnectionState.badgeText}
            </span>
          </button>
          <div className="home-toolbar-flyout-panel">
            <div className="home-toolbar-flyout-title">模型连接</div>
            {modelConnectionState.level !== 'healthy' ? (
              <div className={`home-toolbar-model-warning status-${modelConnectionState.level}`}>
                <strong>{modelConnectionState.summary}</strong>
                <span>{modelConnectionState.detail}</span>
              </div>
            ) : null}
            <div className="home-toolbar-model-line">
              <strong>运行状态</strong>
              <span>{getRuntimeLabel(modelState.openclaw)}</span>
            </div>
            <div className="home-toolbar-model-line">
              <strong>当前模型</strong>
              <span>{currentModel ? `${currentModel.provider} / ${currentModel.label}` : '未配置'}</span>
            </div>
            <div className="home-toolbar-model-line">
              <strong>已配置提供方</strong>
              <span>{configuredProviderCount}</span>
            </div>
            <div className="home-toolbar-model-line">
              <strong>本机已配置</strong>
              <select
                className="home-toolbar-model-select"
                value={currentModel?.id || ''}
                onChange={(event) => {
                  void handleSelectModel(event.target.value);
                }}
                disabled={modelBusy || !modelState.availableModels.length}
              >
                <option value="" disabled>选择模型</option>
                {modelState.availableModels.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.provider} / {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="home-toolbar-model-actions">
              <button
                type="button"
                className="ghost-btn compact-inline-btn"
                onClick={() => { void refreshModelState('模型状态已刷新'); }}
                disabled={modelBusy}
              >
                刷新
              </button>
            </div>
            {modelMessage ? <div className="home-toolbar-model-message">{modelMessage}</div> : null}
          </div>
        </div>

        <div className="home-toolbar-mode-slot">
          {fullIntelligenceSlot}
        </div>
      </div>
    </header>
  );
}
