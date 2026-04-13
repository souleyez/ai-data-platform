'use client';

import { useState } from 'react';
import ReportDraftEditor from '../../components/ReportDraftEditor';
import GeneratedReportDetail from '../../components/GeneratedReportDetail';
import ReportResultsPanel from '../../components/ReportResultsPanel';
import {
  buildHomepageFeaturedBenchmarkItems,
  buildOperationsDraftBenchmarkItem,
  buildWorkspaceFinalBenchmarkItem,
} from '../../lib/report-benchmark-fixtures';

export default function ReportBenchmarkHarness() {
  const draftItem = buildOperationsDraftBenchmarkItem();
  const finalItem = buildWorkspaceFinalBenchmarkItem();
  const featuredItems = buildHomepageFeaturedBenchmarkItems();
  const [featuredSelectedId, setFeaturedSelectedId] = useState(featuredItems[0]?.id || '');

  return (
    <main className="main-panel report-benchmarks-page">
      <header className="report-benchmarks-header">
        <div>
          <h2>静态页 Benchmark</h2>
          <p>用于锁定草稿编辑器和终稿展示的视觉回归，不依赖实时项目数据。</p>
        </div>
      </header>

      <section className="card report-benchmarks-block">
        <div className="panel-header">
          <div>
            <h3>经营页草稿台</h3>
            <p>Benchmark: operations-cockpit draft workflow</p>
          </div>
        </div>
        <ReportDraftEditor item={draftItem} onItemChange={() => {}} />
      </section>

      <section className="card report-benchmarks-block">
        <div className="panel-header">
          <div>
            <h3>工作台首页终稿预览</h3>
            <p>Benchmark: workspace overview final page</p>
          </div>
        </div>
        <GeneratedReportDetail item={finalItem} />
      </section>

      <section className="card report-benchmarks-block report-benchmarks-block-home">
        <div className="panel-header">
          <div>
            <h3>首页已出报表展开态</h3>
            <p>Benchmark: homepage featured report preview and edit toggle</p>
          </div>
        </div>
        <ReportResultsPanel
          items={featuredItems}
          selectedReportId={featuredSelectedId}
          onSelectReport={setFeaturedSelectedId}
          featuredExpanded
          className="report-results-benchmark-home"
        />
      </section>
    </main>
  );
}
