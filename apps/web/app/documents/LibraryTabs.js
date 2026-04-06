'use client';

const EXTRACTION_FIELD_SET_OPTIONS = [
  { value: 'auto', label: '自动' },
  { value: 'contract', label: '合同' },
  { value: 'resume', label: '简历' },
  { value: 'enterprise-guidance', label: '企业规范' },
  { value: 'order', label: '订单' },
];

const EXTRACTION_SCHEMA_OPTIONS = [
  { value: 'auto', label: '自动' },
  { value: 'contract', label: 'contract' },
  { value: 'resume', label: 'resume' },
  { value: 'technical', label: 'technical' },
  { value: 'order', label: 'order' },
];

const KNOWLEDGE_PAGE_MODE_OPTIONS = [
  { value: 'none', label: '关闭' },
  { value: 'overview', label: '概览' },
  { value: 'topics', label: '专题' },
];

const EXTRACTION_FIELD_KEY_OPTIONS = {
  contract: ['contractNo', 'partyA', 'partyB', 'amount', 'signDate', 'effectiveDate', 'paymentTerms', 'duration'],
  resume: ['candidateName', 'targetRole', 'currentRole', 'yearsOfExperience', 'education', 'major', 'expectedCity', 'expectedSalary', 'latestCompany', 'companies', 'skills', 'highlights', 'projectHighlights', 'itProjectHighlights'],
  'enterprise-guidance': ['businessSystem', 'documentKind', 'applicableScope', 'operationEntry', 'approvalLevels', 'policyFocus', 'contacts'],
  order: ['period', 'platform', 'orderCount', 'netSales', 'grossMargin', 'topCategory', 'inventoryStatus', 'replenishmentAction'],
};

const FIELD_LABELS = {
  contractNo: '合同编号',
  partyA: '甲方',
  partyB: '乙方',
  amount: '金额',
  signDate: '签订日期',
  effectiveDate: '生效日期',
  paymentTerms: '付款条款',
  duration: '履约期限',
  candidateName: '候选人姓名',
  targetRole: '目标岗位',
  currentRole: '当前岗位',
  yearsOfExperience: '工作年限',
  education: '学历',
  major: '专业',
  expectedCity: '期望城市',
  expectedSalary: '期望薪资',
  latestCompany: '最近公司',
  companies: '公司经历',
  skills: '技能',
  highlights: '亮点',
  projectHighlights: '项目亮点',
  itProjectHighlights: 'IT 项目亮点',
  businessSystem: '业务系统',
  documentKind: '文档类型',
  applicableScope: '适用范围',
  operationEntry: '操作入口',
  approvalLevels: '审批层级',
  policyFocus: '规范重点',
  contacts: '联系方式',
  period: '周期',
  platform: '平台',
  orderCount: '订单量',
  netSales: '净销售额',
  grossMargin: '毛利率',
  topCategory: '重点类目',
  inventoryStatus: '库存状态',
  replenishmentAction: '补货动作',
};

function normalizePermissionLevel(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.floor(numeric));
}

function buildPreferredFieldOptions(fieldSet) {
  return EXTRACTION_FIELD_KEY_OPTIONS[String(fieldSet || '')] || [];
}

function getFieldLabel(fieldKey) {
  return FIELD_LABELS[fieldKey] || fieldKey;
}

function moveItem(items, fromIndex, toIndex) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) {
    return items;
  }
  const next = items.slice();
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export default function LibraryTabs({
  libraries,
  activeLibrary,
  activeLibraryRecord,
  activeLibrarySettingsDraft,
  onSelectLibrary,
  getLibraryDocumentCount,
  visibleItems,
  ungroupedCount,
  createDraft,
  createPermissionLevel,
  onCreateDraftChange,
  onCreatePermissionLevelChange,
  onCreateLibrary,
  createSubmitting,
  onSettingsChange,
  onSaveSettings,
  settingsSubmittingId,
}) {
  const preferredFieldOptions = buildPreferredFieldOptions(activeLibrarySettingsDraft?.extractionFieldSet);
  const selectedFieldKeys = Array.isArray(activeLibrarySettingsDraft?.extractionPreferredFieldKeys)
    ? activeLibrarySettingsDraft.extractionPreferredFieldKeys
    : [];
  const requiredFieldKeys = Array.isArray(activeLibrarySettingsDraft?.extractionRequiredFieldKeys)
    ? activeLibrarySettingsDraft.extractionRequiredFieldKeys
    : [];
  const fieldAliases = activeLibrarySettingsDraft?.extractionFieldAliases && typeof activeLibrarySettingsDraft.extractionFieldAliases === 'object'
    ? activeLibrarySettingsDraft.extractionFieldAliases
    : {};

  return (
    <section className="workbench-toolbar card">
      <div className="library-toolbar-head">
        <div className="workbench-toolbar-label">知识库分组</div>
        <div className="library-inline-create">
          <input
            className="filter-input library-inline-create-name"
            value={createDraft}
            onChange={(event) => onCreateDraftChange(event.target.value)}
            placeholder="新建知识库名称"
          />
          <input
            className="filter-input library-inline-create-level"
            type="number"
            min="0"
            step="1"
            value={normalizePermissionLevel(createPermissionLevel)}
            onChange={(event) => onCreatePermissionLevelChange(normalizePermissionLevel(event.target.value))}
            placeholder="权限等级"
          />
          <button
            className="ghost-btn"
            type="button"
            onClick={onCreateLibrary}
            disabled={createSubmitting || !String(createDraft || '').trim()}
          >
            {createSubmitting ? '创建中...' : '新建知识库'}
          </button>
        </div>
      </div>

      <div className="workbench-toolbar-tabs">
        {libraries.map((library) => (
          <button
            key={library.key}
            className={`workbench-tab ${activeLibrary === library.key ? 'active' : ''}`}
            type="button"
            onClick={() => onSelectLibrary(library.key)}
          >
            <span>{library.label}</span>
            <span className="library-permission-pill">L{normalizePermissionLevel(library.permissionLevel)}</span>
            <span className="library-tab-count">{getLibraryDocumentCount(library, visibleItems, libraries)}</span>
          </button>
        ))}
        <button className={`workbench-tab ${activeLibrary === 'all' ? 'active' : ''}`} type="button" onClick={() => onSelectLibrary('all')}>
          全部文档
        </button>
        <button className={`workbench-tab ${activeLibrary === 'ungrouped' ? 'active' : ''}`} type="button" onClick={() => onSelectLibrary('ungrouped')}>
          <span>未分组</span>
          <span className="library-tab-count">{ungroupedCount}</span>
        </button>
      </div>

      {activeLibraryRecord && activeLibrarySettingsDraft ? (
        <div className="library-settings-inline">
          <div className="library-settings-inline-head">
            <strong>当前知识库设置</strong>
            <span className="bot-config-subtle">在这里配置权限等级、解析模板，以及重点字段的顺序、必填和别名。</span>
          </div>

          <div className="library-settings-inline-grid">
            <label className="bot-field">
              <span>知识库名称</span>
              <input
                value={activeLibrarySettingsDraft.label}
                onChange={(event) => onSettingsChange(activeLibraryRecord.key, { label: event.target.value })}
              />
            </label>

            <label className="bot-field">
              <span>权限等级</span>
              <input
                type="number"
                min="0"
                step="1"
                value={normalizePermissionLevel(activeLibrarySettingsDraft.permissionLevel)}
                onChange={(event) => onSettingsChange(activeLibraryRecord.key, {
                  permissionLevel: normalizePermissionLevel(event.target.value),
                })}
              />
            </label>

            <label className="bot-field">
              <span>提取模板</span>
              <select
                value={String(activeLibrarySettingsDraft.extractionFieldSet || 'auto')}
                onChange={(event) => onSettingsChange(activeLibraryRecord.key, {
                  extractionFieldSet: event.target.value,
                  extractionPreferredFieldKeys: [],
                  extractionRequiredFieldKeys: [],
                  extractionFieldAliases: {},
                })}
              >
                {EXTRACTION_FIELD_SET_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label className="bot-field">
              <span>知识页</span>
              <label className="bot-channel-chip active" style={{ width: 'fit-content' }}>
                <input
                  type="checkbox"
                  checked={Boolean(activeLibrarySettingsDraft.knowledgePagesEnabled)}
                  onChange={(event) => onSettingsChange(activeLibraryRecord.key, {
                    knowledgePagesEnabled: event.target.checked,
                    knowledgePagesMode: event.target.checked
                      ? (String(activeLibrarySettingsDraft.knowledgePagesMode || '') === 'topics' ? 'topics' : 'overview')
                      : 'none',
                  })}
                />
                <span>启用库级知识页</span>
              </label>
            </label>

            <label className="bot-field">
              <span>知识页模式</span>
              <select
                value={String(activeLibrarySettingsDraft.knowledgePagesMode || 'none')}
                onChange={(event) => onSettingsChange(activeLibraryRecord.key, {
                  knowledgePagesMode: event.target.value,
                  knowledgePagesEnabled: event.target.value !== 'none',
                })}
              >
                {KNOWLEDGE_PAGE_MODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label className="bot-field">
              <span>回退结构</span>
              <select
                value={String(activeLibrarySettingsDraft.extractionFallbackSchemaType || 'auto')}
                onChange={(event) => onSettingsChange(activeLibraryRecord.key, {
                  extractionFallbackSchemaType: event.target.value,
                })}
              >
                {EXTRACTION_SCHEMA_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label className="bot-field bot-field-span">
              <span>重点提取字段</span>
              {preferredFieldOptions.length ? (
                <div className="bot-channel-tags">
                  {preferredFieldOptions.map((fieldKey) => {
                    const selected = selectedFieldKeys.includes(fieldKey);
                    return (
                      <label key={fieldKey} className={`bot-channel-chip ${selected ? 'active' : ''}`}>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(event) => {
                            const next = event.target.checked
                              ? [...selectedFieldKeys, fieldKey].filter((item, index, items) => items.indexOf(item) === index)
                              : selectedFieldKeys.filter((item) => item !== fieldKey);
                            onSettingsChange(activeLibraryRecord.key, {
                              extractionPreferredFieldKeys: next,
                              extractionRequiredFieldKeys: requiredFieldKeys.filter((item) => next.includes(item)),
                              extractionFieldAliases: Object.fromEntries(
                                Object.entries(fieldAliases).filter(([key]) => next.includes(key)),
                              ),
                            });
                          }}
                        />
                        <span>{getFieldLabel(fieldKey)}</span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <span className="bot-config-subtle">先选择提取模板，再挑选重点字段。</span>
              )}
            </label>

            {selectedFieldKeys.length ? (
              <div className="bot-field bot-field-span">
                <span>字段治理</span>
                <div style={{ display: 'grid', gap: 10 }}>
                  {selectedFieldKeys.map((fieldKey, index) => (
                    <div key={fieldKey} className="bot-summary-card">
                      <div style={{ display: 'grid', gap: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                          <strong>{index + 1}. {getFieldLabel(fieldKey)}</strong>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button
                              className="ghost-btn"
                              type="button"
                              disabled={index === 0}
                              onClick={() => onSettingsChange(activeLibraryRecord.key, {
                                extractionPreferredFieldKeys: moveItem(selectedFieldKeys, index, index - 1),
                              })}
                            >
                              上移
                            </button>
                            <button
                              className="ghost-btn"
                              type="button"
                              disabled={index === selectedFieldKeys.length - 1}
                              onClick={() => onSettingsChange(activeLibraryRecord.key, {
                                extractionPreferredFieldKeys: moveItem(selectedFieldKeys, index, index + 1),
                              })}
                            >
                              下移
                            </button>
                          </div>
                        </div>

                        <label className="bot-field">
                          <span>字段别名</span>
                          <input
                            value={String(fieldAliases[fieldKey] || '')}
                            placeholder={getFieldLabel(fieldKey)}
                            onChange={(event) => onSettingsChange(activeLibraryRecord.key, {
                              extractionFieldAliases: {
                                ...fieldAliases,
                                [fieldKey]: event.target.value,
                              },
                            })}
                          />
                        </label>

                        <label className="bot-channel-chip active" style={{ width: 'fit-content' }}>
                          <input
                            type="checkbox"
                            checked={requiredFieldKeys.includes(fieldKey)}
                            onChange={(event) => {
                              const next = event.target.checked
                                ? [...requiredFieldKeys, fieldKey].filter((item, itemIndex, items) => items.indexOf(item) === itemIndex)
                                : requiredFieldKeys.filter((item) => item !== fieldKey);
                              onSettingsChange(activeLibraryRecord.key, {
                                extractionRequiredFieldKeys: next,
                              });
                            }}
                          />
                          <span>设为必填字段</span>
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <label className="bot-field bot-field-span">
              <span>描述</span>
              <textarea
                rows={2}
                value={activeLibrarySettingsDraft.description}
                onChange={(event) => onSettingsChange(activeLibraryRecord.key, { description: event.target.value })}
                placeholder="可选，补充这个知识库的资料范围"
              />
            </label>
          </div>

          <div className="bot-config-actions">
            <button
              className="ghost-btn"
              type="button"
              onClick={() => onSaveSettings(activeLibraryRecord.key)}
              disabled={settingsSubmittingId === activeLibraryRecord.key}
            >
              {settingsSubmittingId === activeLibraryRecord.key ? '保存中...' : '保存知识库设置'}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
