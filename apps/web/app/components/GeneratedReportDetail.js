'use client';

function buildSvgDataUrl(svg) {
  const content = String(svg || '').trim();
  if (!content) return '';
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(content)}`;
}

function normalizeMatchKey(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeVariantClass(value) {
  const normalized = String(value || '').trim();
  return normalized ? `generated-page-plan-variant-${normalized}` : '';
}

function normalizeVisualStyleClass(value) {
  const normalized = String(value || '').trim();
  return normalized ? `generated-page-style-${normalized}` : '';
}

function ReportTable({ table }) {
  if (!table) return null;

  return (
    <div className="generated-report-table">
      <div className="formula-table-scroll">
        <table className="formula-table">
          <thead>
            <tr>
              {(table.columns || []).map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(table.rows || []).map((row, rowIndex) => (
              <tr key={`detail-row-${rowIndex}`}>
                {row.map((cell, cellIndex) => (
                  <td key={`detail-cell-${rowIndex}-${cellIndex}`}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PageCards({ cards, className = '' }) {
  if (!cards?.length) return null;
  return (
    <div className={`generated-page-cards ${className}`.trim()}>
      {cards.map((card, index) => (
        <article className="generated-page-card" key={`${card.label || 'card'}-${index}`}>
          {card.label ? <div className="generated-page-card-label">{card.label}</div> : null}
          {card.value ? <div className="generated-page-card-value">{card.value}</div> : null}
          {card.note ? <div className="generated-page-card-note">{card.note}</div> : null}
        </article>
      ))}
    </div>
  );
}

function PageSections({ sections, className = '' }) {
  if (!sections?.length) return null;
  return (
    <div className={`generated-page-sections ${className}`.trim()}>
      {sections.map((section, index) => (
        <section
          className={`generated-page-section ${section.displayMode ? `generated-page-section-${section.displayMode}` : ''}`.trim()}
          key={`${section.title || 'section'}-${index}`}
        >
          {section.title ? <h4>{section.title}</h4> : null}
          {section.body ? <p>{section.body}</p> : null}
          {section.displayMode === 'timeline' && section.bullets?.length ? (
            <ol className="generated-page-timeline-list">
              {section.bullets.map((bullet, bulletIndex) => (
                <li key={`${section.title || 'section'}-bullet-${bulletIndex}`}>
                  <span className="generated-page-timeline-marker" />
                  <span>{bullet}</span>
                </li>
              ))}
            </ol>
          ) : section.displayMode === 'comparison' && section.bullets?.length ? (
            <div className="generated-page-comparison-list">
              {section.bullets.map((bullet, bulletIndex) => {
                const [left = '', right = ''] = String(bullet || '').split(/[：:|]/).map((item) => item.trim());
                return (
                  <div className="generated-page-comparison-row" key={`${section.title || 'section'}-bullet-${bulletIndex}`}>
                    <strong>{left || bullet}</strong>
                    {right ? <span>{right}</span> : null}
                  </div>
                );
              })}
            </div>
          ) : section.bullets?.length ? (
            <ul>
              {section.bullets.map((bullet, bulletIndex) => (
                <li key={`${section.title || 'section'}-bullet-${bulletIndex}`}>{bullet}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}
    </div>
  );
}

function PageCharts({ charts, className = '' }) {
  if (!charts?.length) return null;

  return (
    <div className={`generated-page-charts ${className}`.trim()}>
      {charts.map((chart, chartIndex) => {
        const svgUrl = buildSvgDataUrl(chart?.render?.svg);
        const maxValue = Math.max(...(chart.items || []).map((item) => Number(item.value || 0)), 1);
        return (
          <section className="generated-page-chart" key={`${chart.title || 'chart'}-${chartIndex}`}>
            {chart.title ? <h4>{chart.title}</h4> : null}
            {svgUrl ? (
              <div className="generated-page-chart-visual" style={{ marginTop: 12 }}>
                <img
                  src={svgUrl}
                  alt={chart?.render?.alt || chart.title || 'Chart'}
                  style={{ width: '100%', height: 'auto', display: 'block' }}
                />
              </div>
            ) : (
              <div className="generated-page-bars">
                {(chart.items || []).map((item, itemIndex) => {
                  const width = Math.max(8, (Number(item.value || 0) / maxValue) * 100);
                  return (
                    <div className="generated-page-bar-row" key={`${item.label || 'item'}-${itemIndex}`}>
                      <span className="generated-page-bar-label">{item.label}</span>
                      <span className="generated-page-bar-track">
                        <span className="generated-page-bar-fill" style={{ width: `${width}%` }} />
                      </span>
                      <span className="generated-page-bar-value">{item.value}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function takeFirstMatching(items, matchers, resolveKey) {
  const pending = [...items];
  const taken = [];
  if (!Array.isArray(items) || !items.length || !Array.isArray(matchers) || !matchers.length) {
    return { taken, remaining: pending };
  }
  for (const matcher of matchers) {
    const matcherKey = normalizeMatchKey(matcher);
    if (!matcherKey) continue;
    const index = pending.findIndex((item) => normalizeMatchKey(resolveKey(item)) === matcherKey);
    if (index >= 0) {
      taken.push(pending[index]);
      pending.splice(index, 1);
    }
  }
  return { taken, remaining: pending };
}

function buildPlannedPageView(page, dynamicSource) {
  const pageSpec = page?.pageSpec || dynamicSource?.planPageSpec || null;
  const datavizSlots =
    (Array.isArray(page?.datavizSlots) && page.datavizSlots.length ? page.datavizSlots : null)
    || (Array.isArray(dynamicSource?.planDatavizSlots) && dynamicSource.planDatavizSlots.length ? dynamicSource.planDatavizSlots : [])
    || [];

  if (!pageSpec?.sections?.length && !pageSpec?.heroCardLabels?.length && !pageSpec?.heroDatavizSlotKeys?.length) {
    return null;
  }

  const slotTitleByKey = new Map(
    datavizSlots
      .map((slot) => [normalizeMatchKey(slot?.key || slot?.title), String(slot?.title || '').trim()])
      .filter((entry) => entry[0] && entry[1]),
  );

  const heroCardResult = takeFirstMatching(page?.cards || [], pageSpec.heroCardLabels || [], (item) => item?.label);
  const heroChartTitles = (pageSpec.heroDatavizSlotKeys || [])
    .map((slotKey) => slotTitleByKey.get(normalizeMatchKey(slotKey)) || '')
    .filter(Boolean);
  const heroChartResult = takeFirstMatching(page?.charts || [], heroChartTitles, (item) => item?.title);

  let remainingSections = [...(page?.sections || [])];
  let remainingCharts = [...(heroChartResult?.remaining || page?.charts || [])];
  const plannedSections = (pageSpec.sections || [])
    .map((sectionSpec) => {
      const sectionResult = takeFirstMatching(remainingSections, [sectionSpec.title], (item) => item?.title);
      remainingSections = sectionResult?.remaining || remainingSections;
      const sectionChartTitles = (sectionSpec.datavizSlotKeys || [])
        .map((slotKey) => slotTitleByKey.get(normalizeMatchKey(slotKey)) || '')
        .filter(Boolean);
      const chartResult = takeFirstMatching(remainingCharts, sectionChartTitles, (item) => item?.title);
      remainingCharts = chartResult?.remaining || remainingCharts;
      const section = sectionResult?.taken?.[0] || null;
      const charts = chartResult?.taken || [];
      return section || charts.length
        ? {
            key: sectionSpec.title,
            title: section?.title || sectionSpec.title,
            section,
            charts,
          }
        : null;
    })
    .filter(Boolean);

  return {
    layoutVariant: pageSpec.layoutVariant || 'insight-brief',
    heroCards: heroCardResult?.taken || [],
    heroCharts: heroChartResult?.taken || [],
    plannedSections,
    remainingCards: heroCardResult?.remaining || page?.cards || [],
    remainingSections,
    remainingCharts,
  };
}

function PageDetail({ page, content, dynamicSource }) {
  if (!page && !content) return null;
  const plannedView = buildPlannedPageView(page, dynamicSource);
  const visualStyleClass = normalizeVisualStyleClass(page?.visualStyle || 'midnight-glass');

  return (
    <div className={`generated-page-detail ${visualStyleClass}`.trim()}>
      {content ? (
        <div className="generated-report-section">
          <p style={{ whiteSpace: 'pre-wrap' }}>{content}</p>
        </div>
      ) : null}
      {page?.summary ? (
        <div className="generated-report-section">
          <p>{page.summary}</p>
        </div>
      ) : null}
      {plannedView ? (
        <div className={`generated-page-plan ${normalizeVariantClass(plannedView.layoutVariant)}`.trim()}>
          <section className="generated-page-hero">
            <PageCards cards={plannedView.heroCards} className="generated-page-hero-cards" />
            <PageCharts charts={plannedView.heroCharts} className="generated-page-hero-charts" />
          </section>
          {plannedView.plannedSections.length ? (
            <div className="generated-page-plan-sections">
              {plannedView.plannedSections.map((item, index) => (
                <section className="generated-page-plan-section" key={`${item.key || 'planned-section'}-${index}`}>
                  <div className="generated-page-plan-section-copy">
                    {item.title ? <h4>{item.title}</h4> : null}
                    {item.section?.body ? <p>{item.section.body}</p> : null}
                    {item.section?.bullets?.length ? (
                      <ul>
                        {item.section.bullets.map((bullet, bulletIndex) => (
                          <li key={`${item.title || 'planned-section'}-bullet-${bulletIndex}`}>{bullet}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <PageCharts charts={item.charts} className="generated-page-plan-section-charts" />
                </section>
              ))}
            </div>
          ) : null}
          <div className="generated-page-plan-tail">
            <PageCards cards={plannedView.remainingCards} />
            <PageSections sections={plannedView.remainingSections} />
            <PageCharts charts={plannedView.remainingCharts} />
          </div>
        </div>
      ) : (
        <>
          <PageCards cards={page?.cards} />
          <PageSections sections={page?.sections} />
          <PageCharts charts={page?.charts} />
        </>
      )}
    </div>
  );
}

function EmptyDetail({ item }) {
  return (
    <div className="generated-report-detail">
      <div className="generated-report-section">
        <p>{item.summary || '该报表为历史记录，当前未保存正文内容。'}</p>
        <div style={{ marginTop: 8, color: '#64748b', display: 'grid', gap: 4 }}>
          <p>报表标题：{item.title || '未命名报表'}</p>
          <p>输出类型：{item.kind || item.format || '未知'}</p>
          {item.groupLabel ? <p>知识库：{item.groupLabel}</p> : null}
          {item.templateLabel ? <p>输出模板：{item.templateLabel}</p> : null}
        </div>
      </div>
    </div>
  );
}

export default function GeneratedReportDetail({ item }) {
  if (!item) return null;

  const hasTable = Boolean(item.table?.rows?.length);
  const hasPage = Boolean(
    item.page?.summary
      || item.page?.cards?.length
      || item.page?.sections?.length
      || item.page?.charts?.length
      || item.page?.pageSpec?.sections?.length
      || item.page?.pageSpec?.heroCardLabels?.length
      || item.page?.pageSpec?.heroDatavizSlotKeys?.length
      || item.page?.datavizSlots?.length,
  );
  const hasContent = Boolean(String(item.content || '').trim());

  if (item.kind === 'page' && (hasPage || hasContent)) {
    return <PageDetail page={item.page} content={item.content} dynamicSource={item.dynamicSource} />;
  }

  if (hasTable) {
    return (
      <div className="generated-report-detail">
        <ReportTable table={item.table} />
      </div>
    );
  }

  if (hasContent) {
    return (
      <div className="generated-report-detail">
        <div className="generated-report-section">
          <p style={{ whiteSpace: 'pre-wrap' }}>{item.content}</p>
        </div>
      </div>
    );
  }

  return <EmptyDetail item={item} />;
}
