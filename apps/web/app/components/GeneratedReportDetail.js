'use client';

function buildSvgDataUrl(svg) {
  const content = String(svg || '').trim();
  if (!content) return '';
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(content)}`;
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

function PageCards({ cards }) {
  if (!cards?.length) return null;
  return (
    <div className="generated-page-cards">
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

function PageSections({ sections }) {
  if (!sections?.length) return null;
  return (
    <div className="generated-page-sections">
      {sections.map((section, index) => (
        <section className="generated-page-section" key={`${section.title || 'section'}-${index}`}>
          {section.title ? <h4>{section.title}</h4> : null}
          {section.body ? <p>{section.body}</p> : null}
          {section.bullets?.length ? (
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

function PageCharts({ charts }) {
  if (!charts?.length) return null;

  return (
    <div className="generated-page-charts">
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

function PageDetail({ page, content }) {
  if (!page && !content) return null;

  return (
    <div className="generated-page-detail">
      {content ? (
        <div className="generated-report-section">
          <p>{content}</p>
        </div>
      ) : null}
      {page?.summary ? (
        <div className="generated-report-section">
          <p>{page.summary}</p>
        </div>
      ) : null}
      <PageCards cards={page?.cards} />
      <PageSections sections={page?.sections} />
      <PageCharts charts={page?.charts} />
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
      || item.page?.charts?.length,
  );
  const hasContent = Boolean(String(item.content || '').trim());

  if (item.kind === 'page' && (hasPage || hasContent)) {
    return <PageDetail page={item.page} content={item.content} />;
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
          <p>{item.content}</p>
        </div>
      </div>
    );
  }

  return <EmptyDetail item={item} />;
}
