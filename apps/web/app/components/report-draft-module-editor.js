'use client';

import {
  formatBulletLines,
  formatChartLines,
  formatMetricLines,
  getModuleTypeLabel,
  parseChartLines,
  parseLines,
  parseMetricLines,
} from './report-draft-editor-helpers';

const MODULE_TYPE_OPTIONS = ['hero', 'summary', 'metric-grid', 'insight-list', 'table', 'chart', 'timeline', 'comparison', 'cta', 'appendix'];
const CHART_TYPE_OPTIONS = ['bar', 'horizontal-bar', 'line'];

function DraftModuleList({ modules, selectedModuleId, setSelectedModuleId }) {
  return (
    <aside className="report-draft-modules">
      {modules.map((module, index) => (
        <button
          key={module.moduleId}
          type="button"
          className={`report-draft-module-item ${selectedModuleId === module.moduleId ? 'is-selected' : ''}`.trim()}
          onClick={() => setSelectedModuleId(module.moduleId)}
        >
          <span className="report-draft-module-order">{index + 1}</span>
          <span className="report-draft-module-meta">
            <strong>{module.title || '未命名模块'}</strong>
            <span>{module.moduleType}{module.enabled === false ? ' · 已禁用' : ''}</span>
          </span>
        </button>
      ))}
    </aside>
  );
}

function DraftModuleInspector({
  selectedModule,
  moveModule,
  updateModule,
  deleteModule,
  moveUpPreview,
  moveDownPreview,
  toggleImpact,
  deleteImpact,
  typeChangeSuggestions,
  moduleInstruction,
  setModuleInstruction,
  reviseCurrentModule,
  moduleSummary,
  submittingKey,
}) {
  if (!selectedModule) {
    return (
      <div className="report-empty-card">
        <h4>选择一个模块</h4>
        <p>左侧选择模块后，可在这里编辑标题、正文、模块类型和图表偏好。</p>
      </div>
    );
  }

  return (
    <>
      <div className="report-draft-edit-actions">
        <button className="ghost-btn" type="button" onClick={() => moveModule(selectedModule.moduleId, 'up')}>上移</button>
        <button className="ghost-btn" type="button" onClick={() => moveModule(selectedModule.moduleId, 'down')}>下移</button>
        <button
          className="ghost-btn"
          type="button"
          onClick={() => updateModule(selectedModule.moduleId, (module) => ({
            ...module,
            enabled: !module.enabled,
            status: !module.enabled ? 'edited' : 'disabled',
          }))}
        >
          {selectedModule.enabled === false ? '启用模块' : '禁用模块'}
        </button>
        <button className="ghost-btn" type="button" onClick={() => deleteModule(selectedModule.moduleId)}>删除模块</button>
      </div>

      {moveUpPreview || moveDownPreview ? (
        <div className="report-draft-order-notes">
          {moveUpPreview ? (
            <div className="report-draft-order-note">
              <strong>{moveUpPreview.label}</strong>
              <span>{moveUpPreview.detail}</span>
            </div>
          ) : null}
          {moveDownPreview ? (
            <div className="report-draft-order-note">
              <strong>{moveDownPreview.label}</strong>
              <span>{moveDownPreview.detail}</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {toggleImpact.length || deleteImpact.length ? (
        <div className="report-draft-impact-notes">
          {toggleImpact.length ? (
            <div className="report-draft-impact-note">
              <strong>{selectedModule.enabled === false ? '启用后' : '禁用后'}</strong>
              <div className="report-draft-impact-chip-row">
                {toggleImpact.map((impact) => (
                  <span
                    key={`toggle-${impact.key}`}
                    className={`report-draft-impact-chip ${impact.status}`.trim()}
                  >
                    {impact.label} {impact.currentCount}/{impact.targetCount}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {deleteImpact.length ? (
            <div className="report-draft-impact-note">
              <strong>删除后</strong>
              <div className="report-draft-impact-chip-row">
                {deleteImpact.map((impact) => (
                  <span
                    key={`delete-${impact.key}`}
                    className={`report-draft-impact-chip ${impact.status}`.trim()}
                  >
                    {impact.label} {impact.currentCount}/{impact.targetCount}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="report-draft-form">
        <label>
          <span>模块类型</span>
          <select
            className="filter-input"
            value={selectedModule.moduleType}
            onChange={(event) => updateModule(selectedModule.moduleId, (module) => ({
              ...module,
              moduleType: event.target.value,
              layoutType: event.target.value,
              status: 'edited',
            }))}
          >
            {MODULE_TYPE_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
        {typeChangeSuggestions.length ? (
          <div className="report-draft-type-suggestions">
            <strong>快速改成更合适的类型</strong>
            <div className="report-draft-type-suggestion-list">
              {typeChangeSuggestions.slice(0, 4).map((suggestion) => (
                <div key={`${selectedModule.moduleId}-${suggestion.moduleType}`} className="report-draft-type-suggestion-item">
                  <button
                    className="ghost-btn report-draft-type-suggestion-btn"
                    type="button"
                    onClick={() => updateModule(selectedModule.moduleId, (module) => ({
                      ...module,
                      moduleType: suggestion.moduleType,
                      layoutType: suggestion.moduleType,
                      status: 'edited',
                    }))}
                  >
                    改成{suggestion.label}
                  </button>
                  <div className="report-draft-impact-chip-row">
                    {suggestion.impacts.map((impact) => (
                      <span
                        key={impact.key}
                        className={`report-draft-impact-chip ${impact.status}`.trim()}
                      >
                        {impact.label} {impact.currentCount}/{impact.targetCount}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <label>
          <span>标题</span>
          <input
            className="filter-input"
            value={selectedModule.title}
            onChange={(event) => updateModule(selectedModule.moduleId, (module) => ({
              ...module,
              title: event.target.value,
              status: 'edited',
            }))}
          />
        </label>
        <label>
          <span>模块目的</span>
          <textarea
            className="filter-input"
            value={selectedModule.purpose || ''}
            onChange={(event) => updateModule(selectedModule.moduleId, (module) => ({
              ...module,
              purpose: event.target.value,
              status: 'edited',
            }))}
          />
        </label>
        {selectedModule.moduleType === 'metric-grid' ? (
          <label>
            <span>指标卡（每行：标题 | 数值 | 备注）</span>
            <textarea
              className="filter-input"
              value={formatMetricLines(selectedModule.cards)}
              onChange={(event) => updateModule(selectedModule.moduleId, (module) => ({
                ...module,
                cards: parseMetricLines(event.target.value),
                status: 'edited',
              }))}
            />
          </label>
        ) : selectedModule.moduleType === 'chart' ? (
          <>
            <label>
              <span>图表标题</span>
              <input
                className="filter-input"
                value={selectedModule.chartIntent?.title || selectedModule.title}
                onChange={(event) => updateModule(selectedModule.moduleId, (module) => ({
                  ...module,
                  chartIntent: {
                    ...(module.chartIntent || {}),
                    title: event.target.value,
                    preferredChartType: module.chartIntent?.preferredChartType || 'bar',
                    items: module.chartIntent?.items || [],
                  },
                  status: 'edited',
                }))}
              />
            </label>
            <label>
              <span>图表类型</span>
              <select
                className="filter-input"
                value={selectedModule.chartIntent?.preferredChartType || 'bar'}
                onChange={(event) => updateModule(selectedModule.moduleId, (module) => ({
                  ...module,
                  chartIntent: {
                    ...(module.chartIntent || {}),
                    title: module.chartIntent?.title || module.title,
                    preferredChartType: event.target.value,
                    items: module.chartIntent?.items || [],
                  },
                  status: 'edited',
                }))}
              >
                {CHART_TYPE_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
            <label>
              <span>图表数据（每行：标签 | 数值）</span>
              <textarea
                className="filter-input"
                value={formatChartLines(selectedModule.chartIntent?.items)}
                onChange={(event) => updateModule(selectedModule.moduleId, (module) => ({
                  ...module,
                  chartIntent: {
                    ...(module.chartIntent || {}),
                    title: module.chartIntent?.title || module.title,
                    preferredChartType: module.chartIntent?.preferredChartType || 'bar',
                    items: parseChartLines(event.target.value),
                  },
                  status: 'edited',
                }))}
              />
            </label>
          </>
        ) : (
          <>
            <label>
              <span>正文草稿</span>
              <textarea
                className="filter-input"
                value={selectedModule.contentDraft || ''}
                onChange={(event) => updateModule(selectedModule.moduleId, (module) => ({
                  ...module,
                  contentDraft: event.target.value,
                  status: 'edited',
                }))}
              />
            </label>
            <label>
              <span>要点（每行一条）</span>
              <textarea
                className="filter-input"
                value={formatBulletLines(selectedModule.bullets)}
                onChange={(event) => updateModule(selectedModule.moduleId, (module) => ({
                  ...module,
                  bullets: parseLines(event.target.value),
                  status: 'edited',
                }))}
              />
            </label>
          </>
        )}
      </div>

      <div className="report-draft-module-ai">
        <textarea
          className="filter-input"
          value={moduleInstruction}
          onChange={(event) => setModuleInstruction(event.target.value)}
          placeholder="例如：把这个模块改成更像客户汇报语气，强调风险和下一步动作"
        />
        <button
          className="ghost-btn"
          type="button"
          disabled={submittingKey === 'revise-module'}
          onClick={() => void reviseCurrentModule()}
        >
          {submittingKey === 'revise-module' ? '处理中...' : '重新生成当前模块'}
        </button>
      </div>

      {moduleSummary?.lines?.length ? (
        <div className="report-draft-structure-summary">
          <strong>{moduleSummary.headline}</strong>
          <div className="report-draft-structure-summary-list">
            {moduleSummary.lines.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

export { DraftModuleInspector, DraftModuleList };
