'use client';

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
        const maxValue = Math.max(...(chart.items || []).map((item) => Number(item.value || 0)), 1);
        return (
          <section className="generated-page-chart" key={`${chart.title || 'chart'}-${chartIndex}`}>
            {chart.title ? <h4>{chart.title}</h4> : null}
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

export default function GeneratedReportDetail({ item }) {
  if (!item) return null;

  if (item.kind === 'page') {
    return <PageDetail page={item.page} content={item.content} />;
  }

  const hasTable = Boolean(item.table);

  return (
    <div className="generated-report-detail">
      {!hasTable && item.content ? (
        <div className="generated-report-section">
          <p>{item.content}</p>
        </div>
      ) : null}
      <ReportTable table={item.table} />
    </div>
  );
}
