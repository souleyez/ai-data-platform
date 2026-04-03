
'use client';

import { useState } from 'react';

const TEMPLATE_TYPES = ['table', 'static-page', 'ppt', 'document'];
const REQUEST_ADAPTER_KINDS = ['page', 'table'];

function nextId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseListInput(value) {
  return String(value || '')
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatListInput(values) {
  return Array.isArray(values) ? values.join('\n') : '';
}

function normalizeEnvelope(value = {}) {
  return {
    fixedStructure: Array.isArray(value.fixedStructure) ? value.fixedStructure : [],
    variableZones: Array.isArray(value.variableZones) ? value.variableZones : [],
    outputHint: value.outputHint || '',
    tableColumns: Array.isArray(value.tableColumns) ? value.tableColumns : [],
    pageSections: Array.isArray(value.pageSections) ? value.pageSections : [],
  };
}

function normalizeEnvelopeOverride(value = {}) {
  return {
    title: value.title || '',
    fixedStructure: Array.isArray(value.fixedStructure) ? value.fixedStructure : [],
    variableZones: Array.isArray(value.variableZones) ? value.variableZones : [],
    outputHint: value.outputHint || '',
    tableColumns: Array.isArray(value.tableColumns) ? value.tableColumns : [],
    pageSections: Array.isArray(value.pageSections) ? value.pageSections : [],
  };
}

function createTemplateSpec() {
  return { suffix: nextId('template'), label: '', type: 'table', description: '', supported: true };
}

function createDatasourceProfile() {
  return {
    id: nextId('datasource'),
    label: '',
    matchKeywords: [],
    description: '',
    triggerKeywords: [],
    defaultTemplateSuffix: '',
    templates: [createTemplateSpec()],
  };
}

function createTemplateProfile() {
  return { id: nextId('profile'), label: '', type: 'table', matchKeywords: [], envelope: normalizeEnvelope() };
}

function createSystemTemplate() {
  return { key: nextId('shared'), label: '', type: 'table', description: '', supported: true, isDefault: false };
}

function createRequestAdapterView() {
  return {
    id: nextId('view'),
    label: '',
    matchKeywords: [],
    kindOverrides: { page: normalizeEnvelopeOverride(), table: normalizeEnvelopeOverride() },
  };
}

function createRequestAdapterProfile() {
  return {
    id: nextId('adapter'),
    label: '',
    matchKeywords: [],
    defaultViewId: 'generic',
    fallbackEnvelopeKind: 'table',
    views: [{ id: 'generic', label: '通用', matchKeywords: [], kindOverrides: {} }],
  };
}

function normalizeDatasourceProfile(profile = {}) {
  const templates = Array.isArray(profile.templates) && profile.templates.length
    ? profile.templates.map((template) => ({
      suffix: template.suffix || nextId('template'),
      label: template.label || '',
      type: TEMPLATE_TYPES.includes(template.type) ? template.type : 'table',
      description: template.description || '',
      supported: template.supported !== false,
    }))
    : [createTemplateSpec()];
  const fallbackDefaultSuffix = templates[0]?.suffix || '';
  const defaultTemplateSuffix = templates.some((template) => template.suffix === profile.defaultTemplateSuffix)
    ? profile.defaultTemplateSuffix
    : fallbackDefaultSuffix;

  return {
    id: profile.id || nextId('datasource'),
    label: profile.label || '',
    matchKeywords: Array.isArray(profile.matchKeywords) ? profile.matchKeywords : [],
    description: profile.description || '',
    triggerKeywords: Array.isArray(profile.triggerKeywords) ? profile.triggerKeywords : [],
    defaultTemplateSuffix,
    templates,
  };
}

function normalizeRequestAdapterView(view = {}) {
  const kindOverrides = {};
  for (const kind of REQUEST_ADAPTER_KINDS) {
    if (view.kindOverrides?.[kind]) {
      kindOverrides[kind] = normalizeEnvelopeOverride(view.kindOverrides[kind]);
    }
  }
  return {
    id: view.id || nextId('view'),
    label: view.label || '',
    matchKeywords: Array.isArray(view.matchKeywords) ? view.matchKeywords : [],
    kindOverrides,
  };
}

function normalizeRequestAdapterProfile(profile = {}) {
  const views = Array.isArray(profile.views) && profile.views.length
    ? profile.views.map(normalizeRequestAdapterView)
    : [createRequestAdapterView()];
  return {
    id: profile.id || nextId('adapter'),
    label: profile.label || '',
    matchKeywords: Array.isArray(profile.matchKeywords) ? profile.matchKeywords : [],
    defaultViewId: profile.defaultViewId || views[0]?.id || 'generic',
    fallbackEnvelopeKind: profile.fallbackEnvelopeKind === 'page' ? 'page' : 'table',
    views,
  };
}

function normalizeConfig(config = {}) {
  return {
    version: Number(config.version || 1) || 1,
    updatedAt: config.updatedAt || '',
    datasourceProfiles: Array.isArray(config.datasourceProfiles)
      ? config.datasourceProfiles.map(normalizeDatasourceProfile)
      : [],
    templateProfiles: Array.isArray(config.templateProfiles)
      ? config.templateProfiles.map((item) => ({
        id: item.id || nextId('profile'),
        label: item.label || '',
        type: TEMPLATE_TYPES.includes(item.type) ? item.type : 'table',
        matchKeywords: Array.isArray(item.matchKeywords) ? item.matchKeywords : [],
        envelope: normalizeEnvelope(item.envelope),
      }))
      : [],
    systemTemplates: Array.isArray(config.systemTemplates)
      ? config.systemTemplates.map((item) => ({
        key: item.key || nextId('shared'),
        label: item.label || '',
        type: TEMPLATE_TYPES.includes(item.type) ? item.type : 'table',
        description: item.description || '',
        supported: item.supported !== false,
        isDefault: Boolean(item.isDefault),
      }))
      : [],
    requestAdapterProfiles: Array.isArray(config.requestAdapterProfiles)
      ? config.requestAdapterProfiles.map(normalizeRequestAdapterProfile)
      : [],
  };
}

function collectGovernanceValidationErrors(config) {
  const errors = [];

  const pushDuplicateError = (label, value) => {
    errors.push(`${label} 不能重复: ${value}`);
  };

  const validateUniqueField = (items, field, label) => {
    const seen = new Set();
    items.forEach((item, index) => {
      const value = String(item?.[field] || '').trim();
      if (!value) {
        errors.push(`${label} 第 ${index + 1} 项缺少 ${field}`);
        return;
      }
      if (seen.has(value)) {
        pushDuplicateError(label, value);
        return;
      }
      seen.add(value);
    });
  };

  validateUniqueField(config.datasourceProfiles || [], 'id', '数据源定义');
  validateUniqueField(config.templateProfiles || [], 'id', '模板标准');
  validateUniqueField(config.systemTemplates || [], 'key', '系统模板');
  validateUniqueField(config.requestAdapterProfiles || [], 'id', '请求适配规则');

  (config.datasourceProfiles || []).forEach((profile, index) => {
    const templates = Array.isArray(profile.templates) ? profile.templates : [];
    if (!templates.length) {
      errors.push(`数据源定义第 ${index + 1} 项至少需要一个候选模板`);
      return;
    }
    const seenSuffixes = new Set();
    templates.forEach((template, templateIndex) => {
      const suffix = String(template?.suffix || '').trim();
      if (!suffix) {
        errors.push(`数据源定义 ${profile.id || index + 1} 的模板第 ${templateIndex + 1} 项缺少 suffix`);
        return;
      }
      if (seenSuffixes.has(suffix)) {
        errors.push(`数据源定义 ${profile.id || index + 1} 存在重复模板 suffix: ${suffix}`);
        return;
      }
      seenSuffixes.add(suffix);
    });
    const defaultSuffix = String(profile.defaultTemplateSuffix || '').trim();
    if (defaultSuffix && !templates.some((template) => String(template?.suffix || '').trim() === defaultSuffix)) {
      errors.push(`数据源定义 ${profile.id || index + 1} 的默认模板 suffix 不存在: ${defaultSuffix}`);
    }
  });

  (config.requestAdapterProfiles || []).forEach((profile, index) => {
    const views = Array.isArray(profile.views) ? profile.views : [];
    if (!views.length) {
      errors.push(`请求适配规则第 ${index + 1} 项至少需要一个视图规则`);
      return;
    }
    const seenViewIds = new Set();
    views.forEach((view, viewIndex) => {
      const viewId = String(view?.id || '').trim();
      if (!viewId) {
        errors.push(`请求适配规则 ${profile.id || index + 1} 的视图第 ${viewIndex + 1} 项缺少 id`);
        return;
      }
      if (seenViewIds.has(viewId)) {
        errors.push(`请求适配规则 ${profile.id || index + 1} 存在重复视图 id: ${viewId}`);
        return;
      }
      seenViewIds.add(viewId);
    });
    const defaultViewId = String(profile.defaultViewId || '').trim();
    if (!defaultViewId || !views.some((view) => String(view?.id || '').trim() === defaultViewId)) {
      errors.push(`请求适配规则 ${profile.id || index + 1} 的默认视图不存在: ${defaultViewId || '(空)'}`);
    }
  });

  return errors;
}

function Field({ label, children, wide = false }) {
  return (
    <label className={`cp-governance-field ${wide ? 'wide' : ''}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function ListField({ label, value, onChange }) {
  return (
    <Field label={label} wide>
      <textarea
        className="cp-governance-textarea"
        rows={4}
        value={formatListInput(value)}
        onChange={(event) => onChange(parseListInput(event.target.value))}
      />
    </Field>
  );
}

function EnvelopeEditor({ title, value, onChange, includeTitle = false }) {
  const next = value || normalizeEnvelopeOverride();
  return (
    <section className="cp-governance-mini-card">
      <div className="cp-governance-card-head compact">
        <strong>{title}</strong>
      </div>
      <div className="cp-governance-grid">
        {includeTitle ? (
          <Field label="标题">
            <input value={next.title || ''} onChange={(event) => onChange({ ...next, title: event.target.value })} />
          </Field>
        ) : null}
        <Field label="输出提示" wide>
          <input value={next.outputHint || ''} onChange={(event) => onChange({ ...next, outputHint: event.target.value })} />
        </Field>
        <ListField label="固定结构" value={next.fixedStructure} onChange={(list) => onChange({ ...next, fixedStructure: list })} />
        <ListField label="变量区" value={next.variableZones} onChange={(list) => onChange({ ...next, variableZones: list })} />
        <ListField label="页面分区" value={next.pageSections} onChange={(list) => onChange({ ...next, pageSections: list })} />
        <ListField label="表格列" value={next.tableColumns} onChange={(list) => onChange({ ...next, tableColumns: list })} />
      </div>
    </section>
  );
}
function DatasourceEditor({ items, onChange }) {
  const update = (index, updater) => onChange(items.map((item, itemIndex) => (itemIndex === index ? updater(item) : item)));
  const updateProfile = (index, updater) => update(index, (item) => normalizeDatasourceProfile(updater(item)));
  return (
    <section className="cp-governance-card">
      <div className="cp-governance-card-head">
        <div><strong>数据源定义</strong><p>控制数据源分组、默认模板和模板候选集。</p></div>
        <button className="cp-ghost-btn" type="button" onClick={() => onChange([...items, createDatasourceProfile()])}>Add datasource</button>
      </div>
      <div className="cp-governance-stack">
        {items.map((profile, index) => (
          <section className="cp-governance-nested-card" key={profile.id}>
            <div className="cp-governance-card-head compact">
              <strong>{profile.label || profile.id}</strong>
              <button className="cp-ghost-btn" type="button" onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
            </div>
            <div className="cp-governance-grid">
              <Field label="ID"><input value={profile.id} onChange={(event) => updateProfile(index, (item) => ({ ...item, id: event.target.value }))} /></Field>
              <Field label="名称"><input value={profile.label} onChange={(event) => updateProfile(index, (item) => ({ ...item, label: event.target.value }))} /></Field>
              <Field label="默认模板">
                <select value={profile.defaultTemplateSuffix} onChange={(event) => updateProfile(index, (item) => ({ ...item, defaultTemplateSuffix: event.target.value }))}>
                  {(profile.templates || []).map((template) => (
                    <option key={template.suffix} value={template.suffix}>{template.label || template.suffix}</option>
                  ))}
                </select>
              </Field>
              <Field label="描述" wide><input value={profile.description} onChange={(event) => updateProfile(index, (item) => ({ ...item, description: event.target.value }))} /></Field>
              <ListField label="匹配关键词" value={profile.matchKeywords} onChange={(list) => updateProfile(index, (item) => ({ ...item, matchKeywords: list }))} />
              <ListField label="触发关键词" value={profile.triggerKeywords} onChange={(list) => updateProfile(index, (item) => ({ ...item, triggerKeywords: list }))} />
            </div>
            <div className="cp-governance-subsection">
              <div className="cp-governance-card-head compact">
                <strong>候选模板</strong>
                <button className="cp-ghost-btn" type="button" onClick={() => updateProfile(index, (item) => ({ ...item, templates: [...item.templates, createTemplateSpec()] }))}>Add template</button>
              </div>
              <div className="cp-governance-stack">
                {profile.templates.map((template, templateIndex) => (
                  <section className="cp-governance-mini-card" key={`${profile.id}-${template.suffix}-${templateIndex}`}>
                    <div className="cp-governance-card-head compact">
                      <strong>{template.label || template.suffix}</strong>
                      <button className="cp-ghost-btn" type="button" onClick={() => updateProfile(index, (item) => ({ ...item, templates: item.templates.filter((_, nextIndex) => nextIndex !== templateIndex) }))}>Remove</button>
                    </div>
                    <div className="cp-governance-grid">
                      <Field label="suffix"><input value={template.suffix} onChange={(event) => updateProfile(index, (item) => ({ ...item, templates: item.templates.map((entry, nextIndex) => (nextIndex === templateIndex ? { ...entry, suffix: event.target.value } : entry)) }))} /></Field>
                      <Field label="名称"><input value={template.label} onChange={(event) => updateProfile(index, (item) => ({ ...item, templates: item.templates.map((entry, nextIndex) => (nextIndex === templateIndex ? { ...entry, label: event.target.value } : entry)) }))} /></Field>
                      <Field label="类型"><select value={template.type} onChange={(event) => updateProfile(index, (item) => ({ ...item, templates: item.templates.map((entry, nextIndex) => (nextIndex === templateIndex ? { ...entry, type: event.target.value } : entry)) }))}>{TEMPLATE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></Field>
                      <Field label="描述" wide><input value={template.description} onChange={(event) => updateProfile(index, (item) => ({ ...item, templates: item.templates.map((entry, nextIndex) => (nextIndex === templateIndex ? { ...entry, description: event.target.value } : entry)) }))} /></Field>
                      <Field label="已支持"><div className="cp-check-row"><input type="checkbox" checked={template.supported !== false} onChange={(event) => updateProfile(index, (item) => ({ ...item, templates: item.templates.map((entry, nextIndex) => (nextIndex === templateIndex ? { ...entry, supported: event.target.checked } : entry)) }))} /><span>{template.supported !== false ? 'Supported' : 'Disabled'}</span></div></Field>
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

function TemplateProfileEditor({ items, onChange }) {
  const update = (index, updater) => onChange(items.map((item, itemIndex) => (itemIndex === index ? updater(item) : item)));
  return (
    <section className="cp-governance-card">
      <div className="cp-governance-card-head">
        <div><strong>模板标准</strong><p>控制模板类型的默认 envelope 和匹配规则。</p></div>
        <button className="cp-ghost-btn" type="button" onClick={() => onChange([...items, createTemplateProfile()])}>Add template profile</button>
      </div>
      <div className="cp-governance-stack">
        {items.map((profile, index) => (
          <section className="cp-governance-nested-card" key={profile.id}>
            <div className="cp-governance-card-head compact">
              <strong>{profile.label || profile.id}</strong>
              <button className="cp-ghost-btn" type="button" onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
            </div>
            <div className="cp-governance-grid">
              <Field label="ID"><input value={profile.id} onChange={(event) => update(index, (item) => ({ ...item, id: event.target.value }))} /></Field>
              <Field label="名称"><input value={profile.label} onChange={(event) => update(index, (item) => ({ ...item, label: event.target.value }))} /></Field>
              <Field label="类型"><select value={profile.type} onChange={(event) => update(index, (item) => ({ ...item, type: event.target.value }))}>{TEMPLATE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></Field>
              <ListField label="匹配关键词" value={profile.matchKeywords} onChange={(list) => update(index, (item) => ({ ...item, matchKeywords: list }))} />
            </div>
            <EnvelopeEditor title="Envelope" value={profile.envelope} onChange={(envelope) => update(index, (item) => ({ ...item, envelope }))} />
          </section>
        ))}
      </div>
    </section>
  );
}
function SystemTemplateEditor({ items, onChange }) {
  const update = (index, updater) => onChange(items.map((item, itemIndex) => (itemIndex === index ? updater(item) : item)));
  return (
    <section className="cp-governance-card">
      <div className="cp-governance-card-head">
        <div><strong>系统模板</strong><p>控制共享默认模板和输出默认项。</p></div>
        <button className="cp-ghost-btn" type="button" onClick={() => onChange([...items, createSystemTemplate()])}>Add system template</button>
      </div>
      <div className="cp-governance-stack">
        {items.map((template, index) => (
          <section className="cp-governance-nested-card" key={template.key}>
            <div className="cp-governance-card-head compact">
              <strong>{template.label || template.key}</strong>
              <button className="cp-ghost-btn" type="button" onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
            </div>
            <div className="cp-governance-grid">
              <Field label="Key"><input value={template.key} onChange={(event) => update(index, (item) => ({ ...item, key: event.target.value }))} /></Field>
              <Field label="名称"><input value={template.label} onChange={(event) => update(index, (item) => ({ ...item, label: event.target.value }))} /></Field>
              <Field label="类型"><select value={template.type} onChange={(event) => update(index, (item) => ({ ...item, type: event.target.value }))}>{TEMPLATE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></Field>
              <Field label="描述" wide><input value={template.description} onChange={(event) => update(index, (item) => ({ ...item, description: event.target.value }))} /></Field>
              <Field label="已支持"><div className="cp-check-row"><input type="checkbox" checked={template.supported !== false} onChange={(event) => update(index, (item) => ({ ...item, supported: event.target.checked }))} /><span>{template.supported !== false ? 'Supported' : 'Disabled'}</span></div></Field>
              <Field label="默认项"><div className="cp-check-row"><input type="checkbox" checked={Boolean(template.isDefault)} onChange={(event) => update(index, (item) => ({ ...item, isDefault: event.target.checked }))} /><span>{template.isDefault ? 'Default' : 'Optional'}</span></div></Field>
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

function AdapterProfileEditor({ items, onChange }) {
  const update = (index, updater) => onChange(items.map((item, itemIndex) => (itemIndex === index ? updater(item) : item)));
  const updateProfile = (index, updater) => update(index, (item) => normalizeRequestAdapterProfile(updater(item)));
  return (
    <section className="cp-governance-card">
      <div className="cp-governance-card-head">
        <div><strong>请求适配规则</strong><p>控制按业务域和视图覆盖报告标题、分区和表格列。</p></div>
        <button className="cp-ghost-btn" type="button" onClick={() => onChange([...items, createRequestAdapterProfile()])}>Add adapter profile</button>
      </div>
      <div className="cp-governance-stack">
        {items.map((profile, index) => (
          <section className="cp-governance-nested-card" key={profile.id}>
            <div className="cp-governance-card-head compact">
              <strong>{profile.label || profile.id}</strong>
              <button className="cp-ghost-btn" type="button" onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
            </div>
            <div className="cp-governance-grid">
              <Field label="ID"><input value={profile.id} onChange={(event) => updateProfile(index, (item) => ({ ...item, id: event.target.value }))} /></Field>
              <Field label="名称"><input value={profile.label} onChange={(event) => updateProfile(index, (item) => ({ ...item, label: event.target.value }))} /></Field>
              <Field label="默认视图"><select value={profile.defaultViewId} onChange={(event) => updateProfile(index, (item) => ({ ...item, defaultViewId: event.target.value }))}>{profile.views.map((view) => <option key={view.id} value={view.id}>{view.label || view.id}</option>)}</select></Field>
              <Field label="非 page/table 回退"><select value={profile.fallbackEnvelopeKind} onChange={(event) => updateProfile(index, (item) => ({ ...item, fallbackEnvelopeKind: event.target.value }))}>{REQUEST_ADAPTER_KINDS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}</select></Field>
              <ListField label="业务域匹配关键词" value={profile.matchKeywords} onChange={(list) => updateProfile(index, (item) => ({ ...item, matchKeywords: list }))} />
            </div>
            <div className="cp-governance-subsection">
              <div className="cp-governance-card-head compact">
                <strong>视图规则</strong>
                <button className="cp-ghost-btn" type="button" onClick={() => updateProfile(index, (item) => ({ ...item, views: [...item.views, createRequestAdapterView()] }))}>Add view</button>
              </div>
              <div className="cp-governance-stack">
                {profile.views.map((view, viewIndex) => (
                  <section className="cp-governance-mini-card" key={`${profile.id}-${view.id}-${viewIndex}`}>
                    <div className="cp-governance-card-head compact">
                      <strong>{view.label || view.id}</strong>
                      <button
                        className="cp-ghost-btn"
                        type="button"
                        disabled={profile.views.length <= 1}
                        onClick={() => updateProfile(index, (item) => ({ ...item, views: item.views.filter((_, nextIndex) => nextIndex !== viewIndex) }))}
                      >
                        Remove
                      </button>
                    </div>
                    <div className="cp-governance-grid">
                      <Field label="View ID"><input value={view.id} onChange={(event) => updateProfile(index, (item) => ({ ...item, views: item.views.map((entry, nextIndex) => (nextIndex === viewIndex ? { ...entry, id: event.target.value } : entry)) }))} /></Field>
                      <Field label="名称"><input value={view.label} onChange={(event) => updateProfile(index, (item) => ({ ...item, views: item.views.map((entry, nextIndex) => (nextIndex === viewIndex ? { ...entry, label: event.target.value } : entry)) }))} /></Field>
                      <ListField label="视图匹配关键词" value={view.matchKeywords} onChange={(list) => updateProfile(index, (item) => ({ ...item, views: item.views.map((entry, nextIndex) => (nextIndex === viewIndex ? { ...entry, matchKeywords: list } : entry)) }))} />
                    </div>
                    <div className="cp-governance-columns">
                      {REQUEST_ADAPTER_KINDS.map((kind) => (
                        <EnvelopeEditor
                          key={kind}
                          title={`${kind.toUpperCase()} override`}
                          includeTitle
                          value={view.kindOverrides?.[kind] || normalizeEnvelopeOverride()}
                          onChange={(nextOverride) => updateProfile(index, (item) => ({ ...item, views: item.views.map((entry, nextIndex) => (nextIndex === viewIndex ? { ...entry, kindOverrides: { ...(entry.kindOverrides || {}), [kind]: nextOverride } } : entry)) }))}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
export default function ReportGovernanceEditor({ initialConfig, initialError }) {
  const [config, setConfig] = useState(() => normalizeConfig(initialConfig || {}));
  const [notice, setNotice] = useState('');
  const [error, setError] = useState(initialError || '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const validationErrors = collectGovernanceValidationErrors(config);
    if (validationErrors.length) {
      setNotice('');
      setError(validationErrors[0]);
      return;
    }
    setSaving(true);
    setNotice('');
    setError('');
    try {
      const response = await fetch('/api/admin/report-governance', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.code || payload.error || response.statusText);
      }
      setConfig(normalizeConfig(payload.item || config));
      setNotice('Governance config saved.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="cp-list-card">
      <div className="cp-card-head">
        <div>
          <h2>治理配置</h2>
          <p>按结构维护数据源定义、模板标准、系统模板和请求适配规则。</p>
        </div>
        <div className="cp-row-actions">
          <button className="cp-primary-btn" type="button" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save config'}
          </button>
        </div>
      </div>
      {notice ? <div className="cp-banner success">{notice}</div> : null}
      {error ? <div className="cp-banner error">{error}</div> : null}
      <div className="cp-governance-stack">
        <section className="cp-governance-card">
          <div className="cp-governance-card-head">
            <div><strong>基础信息</strong><p>版本和最近更新时间由后台持久化维护。</p></div>
          </div>
          <div className="cp-governance-grid">
            <Field label="版本"><input type="number" value={config.version} onChange={(event) => setConfig((current) => ({ ...current, version: Number(event.target.value || 1) || 1 }))} /></Field>
            <Field label="最近更新时间"><input value={config.updatedAt || '保存后由系统生成'} readOnly /></Field>
          </div>
        </section>
        <DatasourceEditor items={config.datasourceProfiles} onChange={(datasourceProfiles) => setConfig((current) => ({ ...current, datasourceProfiles }))} />
        <TemplateProfileEditor items={config.templateProfiles} onChange={(templateProfiles) => setConfig((current) => ({ ...current, templateProfiles }))} />
        <SystemTemplateEditor items={config.systemTemplates} onChange={(systemTemplates) => setConfig((current) => ({ ...current, systemTemplates }))} />
        <AdapterProfileEditor items={config.requestAdapterProfiles} onChange={(requestAdapterProfiles) => setConfig((current) => ({ ...current, requestAdapterProfiles }))} />
      </div>
    </section>
  );
}
