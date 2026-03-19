import type { FastifyInstance } from 'fastify';

export async function registerReportRoutes(app: FastifyInstance) {
  app.get('/reports', async () => {
    const fixedTemplates = [
      {
        id: 'tpl-weekly-ops',
        name: '经营周报模板',
        outputType: '表格 / 文件',
        status: 'ready',
        description: '按固定格式输出经营周报，适合周维度汇总和例会材料。',
        lastGeneratedAt: '2026-03-19 09:20',
      },
      {
        id: 'tpl-contract-risk',
        name: '合同风险汇总模板',
        outputType: '表格 / PPT',
        status: 'ready',
        description: '按固定格式输出合同风险表和汇报页，适合法务/经营复盘。',
        lastGeneratedAt: '2026-03-18 18:40',
      },
      {
        id: 'tpl-order-trend',
        name: '订单趋势分析模板',
        outputType: '表格 / 文件 / PPT',
        status: 'ready',
        description: '按固定格式输出订单趋势、渠道变化与重点客户分析。',
        lastGeneratedAt: '2026-03-19 08:50',
      },
    ];

    const staticPageTemplates = [
      {
        id: 'page-order-overview',
        name: '订单趋势静态页模板',
        status: 'ready',
        frequency: 'daily',
        scope: '订单、渠道、客户趋势',
        publicUrl: 'https://reports.example.local/order-overview',
      },
      {
        id: 'page-service-hotspots',
        name: '客服热点静态页模板',
        status: 'ready',
        frequency: 'daily',
        scope: '客服热点、投诉升级、待回访',
        publicUrl: 'https://reports.example.local/service-hotspots',
      },
    ];

    const activePages = [
      {
        id: 'run-order-overview-east',
        name: '订单趋势静态页（华东版）',
        status: 'running',
        frequency: 'daily',
        updatedAt: '2026-03-19 14:10',
        scope: '近30天订单趋势 / 华东区域',
        publicUrl: 'https://reports.example.local/order-overview-east',
      },
      {
        id: 'run-inventory-core-sku',
        name: '库存监控静态页（核心SKU）',
        status: 'running',
        frequency: 'weekly',
        updatedAt: '2026-03-19 09:45',
        scope: '低库存SKU / 周转异常',
        publicUrl: 'https://reports.example.local/inventory-core-sku',
      },
    ];

    const outputRecords = [
      {
        id: 'out-001',
        name: '经营周报-2026W12',
        outputType: 'XLSX',
        createdAt: '2026-03-19 09:20',
        category: '工作日报',
        source: '经营周报模板',
      },
      {
        id: 'out-002',
        name: '合同风险汇总-晨会版',
        outputType: 'PPTX',
        createdAt: '2026-03-18 18:40',
        category: '合同协议',
        source: '合同风险汇总模板',
      },
      {
        id: 'out-003',
        name: '订单趋势分析-管理层简版',
        outputType: 'DOCX',
        createdAt: '2026-03-19 08:50',
        category: '订单分析',
        source: '订单趋势分析模板',
      },
    ];

    return {
      mode: 'read-only',
      total: fixedTemplates.length + staticPageTemplates.length + activePages.length + outputRecords.length,
      fixedTemplates,
      staticPageTemplates,
      activePages,
      outputRecords,
      meta: {
        readyTemplates: fixedTemplates.filter((item) => item.status === 'ready').length,
        staticPages: activePages.length,
        outputs: outputRecords.length,
      },
    };
  });
}
