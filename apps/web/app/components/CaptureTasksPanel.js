'use client';

export default function CaptureTasksPanel({ captureTasks = [] }) {
  return (
    <section className="card documents-card">
      <div className="panel-header">
        <div>
          <h3>网页采集任务</h3>
          <p>已创建的网页采集任务会继续显示在这里，方便查看频次、状态和最近一次摘要。</p>
        </div>
      </div>

      <div className="capture-task-list">
        {captureTasks.length ? captureTasks.slice(0, 6).map((task) => (
          <div key={task.id} className="summary-item capture-task-item">
            <div className="summary-key">{task.title || task.url}</div>
            <div className="capture-task-meta">频次：{task.frequency} · 状态：{task.lastStatus || 'idle'}</div>
            <div className="capture-task-note">关注：{task.focus}</div>
            <div className="capture-task-note">总结：{task.lastSummary || '暂无'}</div>
          </div>
        )) : (
          <div className="summary-item capture-task-item">
            <div className="summary-key">还没有网页采集任务</div>
            <div className="capture-task-note">直接在对话框里发送“采集 + 链接”，系统会尝试抓正文、分类并写入文档库。</div>
          </div>
        )}
      </div>
    </section>
  );
}
