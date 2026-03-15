import type { FastifyInstance } from 'fastify';
import { sourceItems } from '../lib/mock-data.js';
import { listWebCaptureTasks } from '../lib/web-capture.js';

export async function registerDatasourceRoutes(app: FastifyInstance) {
  app.get('/datasources', async () => {
    const webTasks = await listWebCaptureTasks();
    const webItem = sourceItems.find((item) => item.type === 'web');
    const items = sourceItems.map((item) => {
      if (item.id !== webItem?.id) return item;
      const success = webTasks.filter((task) => task.lastStatus === 'success').length;
      const error = webTasks.filter((task) => task.lastStatus === 'error').length;
      const status = success > 0 ? 'connected' : error > 0 ? 'warning' : 'idle';
      return {
        ...item,
        name: webTasks.length ? `网页采集任务（${webTasks.length}）` : item.name,
        status,
        mode: webTasks.length ? 'active' : item.mode,
      };
    });

    return {
      mode: 'read-only',
      total: items.length,
      items,
      meta: {
        connected: items.filter((item) => item.status === 'connected').length,
        warning: items.filter((item) => item.status === 'warning').length,
        idle: items.filter((item) => item.status === 'idle').length,
        webTasks: webTasks.length,
      },
    };
  });
}
