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

export default function GeneratedReportDetail({ item }) {
  if (!item) return null;
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
