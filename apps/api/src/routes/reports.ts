import type { FastifyInstance } from 'fastify';

export async function registerReportRoutes(app: FastifyInstance) {
  app.get('/reports', async () => {
    const items = [
      { id: 'weekly-ops', name: '经营周报', type: 'weekly', status: 'ready' },
      { id: 'contract-risk', name: '合同风险汇总', type: 'risk', status: 'ready' },
      { id: 'order-trend', name: '订单趋势分析', type: 'trend', status: 'ready' },
    ];

    return {
      mode: 'read-only',
      total: items.length,
      items,
      meta: {
        ready: items.filter((item) => item.status === 'ready').length,
      },
    };
  });
}
