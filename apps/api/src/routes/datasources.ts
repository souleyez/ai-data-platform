import type { FastifyInstance } from 'fastify';
import { sourceItems } from '../lib/mock-data.js';
import { listWebCaptureTasks } from '../lib/web-capture.js';

export async function registerDatasourceRoutes(app: FastifyInstance) {
  app.get('/datasources', async () => {
    const webTasks = await listWebCaptureTasks();
    const dynamicItems = [
      {
        id: 'web-fixed',
        name: `固定网页抓取${webTasks.length ? `（${webTasks.length}）` : ''}`,
        type: 'web',
        status: webTasks.some((task) => task.lastStatus === 'success') ? 'connected' : webTasks.length ? 'warning' : 'idle',
        mode: webTasks.length ? 'active' : 'standby',
        updateMode: '定时抓取 / 手动补抓',
        capability: '固定网页、知识网站与专题页面持续采集',
        group: '在线采集',
        actions: ['hide', 'delete'],
      },
      {
        id: 'knowledge-sites',
        name: '知识网站获取',
        type: 'web',
        status: webTasks.length ? 'connected' : 'idle',
        mode: webTasks.length ? 'active' : 'standby',
        updateMode: '定时拉取 / 增量更新',
        capability: '知识网站、研究站点、专题内容更新抓取',
        group: '在线采集',
        actions: ['hide', 'delete'],
      },
      {
        id: 'db-access',
        name: '数据库接入',
        type: 'database',
        status: 'connected',
        mode: 'read-only',
        updateMode: '定时同步 / 查询拉取',
        capability: '结构化数据库、业务台账、查询视图读取',
        group: '业务系统',
        actions: ['hide', 'delete'],
      },
      {
        id: 'erp-orders',
        name: 'ERP订单后台数据接入',
        type: 'database',
        status: 'connected',
        mode: 'read-only',
        updateMode: '定时同步',
        capability: '订单、回款、客户交易流水更新',
        group: '业务系统',
        actions: ['hide', 'delete'],
      },
      {
        id: 'crawler-ingest',
        name: '爬虫数据接入',
        type: 'crawler',
        status: webTasks.length ? 'warning' : 'idle',
        mode: webTasks.length ? 'active' : 'standby',
        updateMode: '任务驱动 / 周期运行',
        capability: '外部站点、专题页面与监测对象批量采集',
        group: '在线采集',
        actions: ['hide', 'delete'],
      },
    ];

    const items = [...sourceItems, ...dynamicItems].map((item: any) => ({
      ...item,
      actions: item.actions || ['hide', 'delete'],
      updateMode: item.updateMode || '手动更新',
      hidden: false,
    }));

    const activeItems = items.filter((item) => item.mode === 'active' || item.status === 'connected');

    return {
      mode: 'read-only',
      total: items.length,
      items,
      activeItems,
      meta: {
        connected: items.filter((item) => item.status === 'connected').length,
        warning: items.filter((item) => item.status === 'warning').length,
        idle: items.filter((item) => item.status === 'idle').length,
        active: activeItems.length,
        webTasks: webTasks.length,
      },
    };
  });
}
