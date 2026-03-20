import type { FastifyInstance } from 'fastify';
import { sourceItems } from '../lib/mock-data.js';
import { listWebCaptureTasks } from '../lib/web-capture.js';

function toDatasourceItem(item: any) {
  return {
    ...item,
    actions: item.actions || ['hide', 'delete'],
    updateMode: item.updateMode || '手动更新',
    hidden: false,
  };
}

export async function registerDatasourceRoutes(app: FastifyInstance) {
  app.get('/datasources', async () => {
    const webTasks = await listWebCaptureTasks();
    const scheduledTasks = webTasks.filter((task) => task.frequency !== 'manual');
    const successfulTasks = webTasks.filter((task) => task.lastStatus === 'success');
    const failedTasks = webTasks.filter((task) => task.lastStatus === 'error');
    const latestCaptureAt = webTasks
      .map((task) => task.lastRunAt || '')
      .filter(Boolean)
      .sort()
      .at(-1) || '';

    const dynamicItems = [
      {
        id: 'web-fixed',
        name: `固定网页抓取${webTasks.length ? `（${webTasks.length}）` : ''}`,
        type: 'web',
        status: successfulTasks.length ? 'connected' : webTasks.length ? 'warning' : 'idle',
        mode: scheduledTasks.length ? 'active' : webTasks.length ? 'standby' : 'standby',
        updateMode: '定时抓取 / 手动补抓',
        capability: '固定网页、知识站点与专题页面持续采集',
        group: '在线采集',
      },
      {
        id: 'knowledge-sites',
        name: '固定学术站点采集',
        type: 'web',
        status: successfulTasks.length ? 'connected' : webTasks.length ? 'warning' : 'idle',
        mode: scheduledTasks.length ? 'active' : webTasks.length ? 'standby' : 'standby',
        updateMode: '定时拉取 / 增量更新',
        capability: 'PubMed Central、arXiv、DOAJ、WHO IRIS 等公开权威学术站点采集',
        group: '在线采集',
      },
      {
        id: 'db-access',
        name: '数据库接入',
        type: 'database',
        status: 'connected',
        mode: 'read-only',
        updateMode: '定时同步 / 查询拉取',
        capability: '结构化数据库、业务台账、查询视图只读接入',
        group: '业务系统',
      },
      {
        id: 'erp-orders',
        name: 'ERP 订单后台数据接入',
        type: 'database',
        status: 'connected',
        mode: 'read-only',
        updateMode: '定时同步',
        capability: '订单、回款、客户交易流水更新',
        group: '业务系统',
      },
      {
        id: 'crawler-ingest',
        name: '爬虫数据接入',
        type: 'crawler',
        status: failedTasks.length ? 'warning' : webTasks.length ? 'connected' : 'idle',
        mode: scheduledTasks.length ? 'active' : webTasks.length ? 'standby' : 'standby',
        updateMode: '任务驱动 / 周期运行',
        capability: '外部站点、专题页面与监测对象批量采集',
        group: '在线采集',
      },
    ].map(toDatasourceItem);

    const items = [...sourceItems.map(toDatasourceItem), ...dynamicItems];
    const activeItems = items.filter((item) => item.mode === 'active' || item.status === 'connected');
    const captureTasks = webTasks.slice(0, 8).map((task) => ({
      id: task.id,
      title: task.title || task.url,
      url: task.url,
      focus: task.focus,
      frequency: task.frequency,
      maxItems: task.maxItems || 5,
      status: task.lastStatus || 'idle',
      lastRunAt: task.lastRunAt || '',
      nextRunAt: task.nextRunAt || '',
      summary: task.lastSummary || '',
      documentPath: task.documentPath || '',
      note: task.note || '',
      collectedCount: task.lastCollectedCount || 0,
      collectedItems: task.lastCollectedItems || [],
    }));

    return {
      mode: 'read-only',
      total: items.length,
      items,
      activeItems,
      captureTasks,
      meta: {
        connected: items.filter((item) => item.status === 'connected').length,
        warning: items.filter((item) => item.status === 'warning').length,
        idle: items.filter((item) => item.status === 'idle').length,
        active: activeItems.length,
        webTasks: webTasks.length,
        latestCaptureAt,
        captureSuccess: successfulTasks.length,
        captureError: failedTasks.length,
        captureScheduled: scheduledTasks.length,
      },
    };
  });
}
