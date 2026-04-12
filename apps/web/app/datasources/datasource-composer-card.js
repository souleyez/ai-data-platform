'use client';

import {
  AUTH_LABELS,
  DatasourceTag,
  KIND_LABELS,
  RequiredLabel,
  SCHEDULE_LABELS,
} from './datasource-page-support';

export default function DatasourceComposerCard({
  form,
  isLocalDirectory,
  libraries,
  selectedLibraries = [],
  credentials,
  saving,
  onUpdateForm,
  onToggleTargetLibrary,
  onSave,
  onStartNew,
  showTargetLibrariesSection = true,
}) {
  return (
    <section className="card documents-card">
      <div className="panel-header">
        <div>
          <h3>{form.id ? '编辑数据源' : '新建数据源'}</h3>
          <p>在一个工作栏里完成采集配置、认证和频率设置。</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {form.id ? <DatasourceTag tone="success-tag">编辑中</DatasourceTag> : null}
          <button className="primary-btn" type="button" disabled={saving || !form.targetKeys.length} onClick={onSave}>
            {saving ? '保存中...' : form.id ? '保存更新' : '创建数据源'}
          </button>
        </div>
      </div>

      <div className="datasource-form-grid">
        <label className="datasource-field">
          <RequiredLabel>数据源名称</RequiredLabel>
          <input
            value={form.name}
            onChange={(event) => onUpdateForm({ name: event.target.value })}
            placeholder="例如：政府采购医疗设备公告"
          />
        </label>
        <label className="datasource-field">
          <RequiredLabel>数据源类型</RequiredLabel>
          <select
            value={form.kind}
            onChange={(event) => {
              const nextKind = event.target.value;
              onUpdateForm({
                kind: nextKind,
                authMode: nextKind === 'local_directory' ? 'none' : form.authMode,
              });
            }}
          >
            {Object.entries(KIND_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        {!isLocalDirectory ? (
          <label className="datasource-field">
            <span>认证方式</span>
            <select value={form.authMode} onChange={(event) => onUpdateForm({ authMode: event.target.value })}>
              {Object.entries(AUTH_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="datasource-field">
          <span>采集频率</span>
          <select value={form.scheduleKind} onChange={(event) => onUpdateForm({ scheduleKind: event.target.value })}>
            {Object.entries(SCHEDULE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="datasource-field datasource-field-span">
          <span>{isLocalDirectory ? '目录路径' : '入口地址 / 连接地址'}</span>
          <input
            value={form.url}
            onChange={(event) => onUpdateForm({ url: event.target.value })}
            placeholder={isLocalDirectory ? '例如：C:\\data\\knowledge' : 'https://example.com 或 postgres://...'}
          />
        </label>
        {!isLocalDirectory ? (
          <label className="datasource-field datasource-field-span">
            <span>采集重点</span>
            <input
              value={form.focus}
              onChange={(event) => onUpdateForm({ focus: event.target.value })}
              placeholder="例如：招标公告、订单、客诉、IOT 方案、论文全文"
            />
          </label>
        ) : null}
        {!isLocalDirectory ? (
          <label className="datasource-field datasource-field-span">
            <span>关键词</span>
            <input
              value={form.keywords}
              onChange={(event) => onUpdateForm({ keywords: event.target.value })}
              placeholder="用逗号分隔，例如：医疗设备，体外诊断"
            />
          </label>
        ) : null}
        {!isLocalDirectory ? (
          <label className="datasource-field datasource-field-span">
            <span>站点提示 / 表名 / 模块提示</span>
            <input
              value={form.siteHints}
              onChange={(event) => onUpdateForm({ siteHints: event.target.value })}
              placeholder="例如：listing-detail，orders，complaints，inventory"
            />
          </label>
        ) : null}
        <label className="datasource-field">
          <span>每次最大条数</span>
          <input value={form.maxItemsPerRun} onChange={(event) => onUpdateForm({ maxItemsPerRun: event.target.value })} />
        </label>
        {isLocalDirectory ? (
          <label className="datasource-field">
            <span>保存后立即运行</span>
            <div className="datasource-inline-checkbox">
              <input
                type="checkbox"
                checked={Boolean(form.runAfterSave)}
                onChange={(event) => onUpdateForm({ runAfterSave: event.target.checked })}
              />
              <span>保存后立即执行一次扫描</span>
            </div>
          </label>
        ) : null}
        <label className="datasource-field datasource-field-span">
          <span>备注</span>
          <textarea
            rows={3}
            value={form.notes}
            onChange={(event) => onUpdateForm({ notes: event.target.value })}
            placeholder="补充抓取范围、排除规则、更新时间要求等。"
          />
        </label>
      </div>

      {showTargetLibrariesSection ? (
        <>
          <div className="panel-header" style={{ marginTop: 20 }}>
            <div>
              <h3><RequiredLabel>目标知识库</RequiredLabel></h3>
              <p>采集结果会直接进入选中的知识库，并自动进入日常后台深度解析链。</p>
            </div>
          </div>
          <div className="datasource-library-grid">
            {libraries.map((library) => {
              const selected = form.targetKeys.includes(library.key);
              return (
                <button
                  key={library.key}
                  type="button"
                  className={`datasource-library-chip ${selected ? 'active' : ''}`}
                  onClick={() => onToggleTargetLibrary(library.key)}
                >
                  <span>{library.label}</span>
                  <span>{library.documentCount || 0} 份</span>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <div className="capture-task-meta" style={{ marginTop: 20 }}>
          当前入库目标由左侧数据集分组决定。
          {selectedLibraries.length
            ? ` 当前将写入：${selectedLibraries.map((item) => item.label).join('、')}。`
            : ' 请先在左侧选择至少一个数据集。'}
        </div>
      )}

      {!isLocalDirectory ? (
        <>
          <div className="panel-header" style={{ marginTop: 20 }}>
            <div>
              <h3>认证与凭据</h3>
              <p>可直接引用已保存凭据，也可以在这里录入新凭据。页面只显示元信息，不回显敏感内容。</p>
            </div>
          </div>
          <div className="datasource-form-grid">
            <label className="datasource-field">
              <span>已保存凭据</span>
              <select value={form.credentialId} onChange={(event) => onUpdateForm({ credentialId: event.target.value })}>
                <option value="">不使用已保存凭据</option>
                {credentials.map((credential) => (
                  <option key={credential.id} value={credential.id}>{credential.label}</option>
                ))}
              </select>
            </label>
            <label className="datasource-field">
              <span>新凭据名称</span>
              <input
                value={form.credentialLabel}
                onChange={(event) => onUpdateForm({ credentialLabel: event.target.value })}
                placeholder="例如：政府采购登录账号"
              />
            </label>
            <label className="datasource-field">
              <span>凭据来源</span>
              <input
                value={form.credentialOrigin}
                onChange={(event) => onUpdateForm({ credentialOrigin: event.target.value })}
                placeholder="例如：manual / browser / db"
              />
            </label>
            <label className="datasource-field datasource-field-span">
              <span>凭据备注</span>
              <input
                value={form.credentialNotes}
                onChange={(event) => onUpdateForm({ credentialNotes: event.target.value })}
                placeholder="例如：只读账号，仅用于订单与客诉采集"
              />
            </label>
            <label className="datasource-field">
              <span>用户名</span>
              <input value={form.credentialUsername} onChange={(event) => onUpdateForm({ credentialUsername: event.target.value })} />
            </label>
            <label className="datasource-field">
              <span>密码</span>
              <input type="password" value={form.credentialPassword} onChange={(event) => onUpdateForm({ credentialPassword: event.target.value })} />
            </label>
            <label className="datasource-field">
              <span>API Token</span>
              <input value={form.credentialToken} onChange={(event) => onUpdateForm({ credentialToken: event.target.value })} />
            </label>
            <label className="datasource-field">
              <span>数据库连接串</span>
              <input value={form.credentialConnectionString} onChange={(event) => onUpdateForm({ credentialConnectionString: event.target.value })} />
            </label>
            <label className="datasource-field datasource-field-span">
              <span>Cookies</span>
              <textarea rows={3} value={form.credentialCookies} onChange={(event) => onUpdateForm({ credentialCookies: event.target.value })} />
            </label>
            <label className="datasource-field datasource-field-span">
              <span>Headers</span>
              <textarea
                rows={3}
                value={form.credentialHeaders}
                onChange={(event) => onUpdateForm({ credentialHeaders: event.target.value })}
                placeholder="一行一个 Header，例如：Authorization: Bearer xxx"
              />
            </label>
          </div>
        </>
      ) : null}

      <div className="datasource-inline-actions" style={{ marginTop: 20 }}>
        <button className="primary-btn" type="button" disabled={saving} onClick={onSave}>
          {saving ? '保存中...' : form.id ? '保存更新' : '创建数据源'}
        </button>
        {form.id ? (
          <button className="ghost-btn" type="button" onClick={onStartNew}>
            新建另一条
          </button>
        ) : null}
        <span className="datasource-inline-note">
          保存后会直接按左侧已选数据集入库，采集与深度解析继续走后台任务。
        </span>
      </div>
    </section>
  );
}
