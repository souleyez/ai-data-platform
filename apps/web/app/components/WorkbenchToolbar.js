'use client';

export default function WorkbenchToolbar({ categories = [], activeKey, onSelect }) {
  return (
    <section className="workbench-toolbar card">
      <div className="workbench-toolbar-tabs">
        {categories.map((item) => (
          <button
            key={item.key}
            className={`workbench-tab ${activeKey === item.key ? 'active' : ''}`}
            onClick={() => onSelect?.(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </section>
  );
}
