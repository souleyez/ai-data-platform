'use client';

export default function DocumentFiltersBar({
  totalFiles,
  recentCount,
  parseRate,
  filteredItems,
  visibleItems,
  activeExtension,
  onSelectExtension,
  extensionSummary,
  keyword,
  onKeywordChange,
}) {
  return (
    <section className="card documents-card" style={{ paddingTop: 10, paddingBottom: 10 }}>
      <div className="message-refs" style={{ gap: 8, alignItems: 'center' }}>
        <span className="source-chip">总数 {totalFiles}</span>
        <span className="source-chip">新增 {recentCount}</span>
        <span className="source-chip">解析 {parseRate}</span>
        <span className="source-chip">结果 {filteredItems.length}/{visibleItems.length}</span>
        <button className={`ref-chip ${activeExtension === 'all' ? 'active-filter' : ''}`} onClick={() => onSelectExtension('all')}>
          全部格式
        </button>
        {extensionSummary.map(([ext, count]) => (
          <button key={ext} className={`ref-chip ${activeExtension === ext ? 'active-filter' : ''}`} onClick={() => onSelectExtension(ext)}>
            {ext} {count}
          </button>
        ))}
        <input
          className="filter-input"
          style={{ minWidth: 200, flex: '1 1 200px', marginLeft: 'auto' }}
          value={keyword}
          onChange={(event) => onKeywordChange(event.target.value)}
          placeholder="搜索文件名、摘要、知识库分组..."
        />
      </div>
    </section>
  );
}
