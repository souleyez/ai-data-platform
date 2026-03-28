import PptxGenJS from 'pptxgenjs';

function sanitizeFilename(value, fallback = 'report') {
  const normalized = String(value || '')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\.+$/g, '');
  return normalized || fallback;
}

function normalizeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function chunkArray(items, size) {
  if (!Array.isArray(items) || size <= 0) return [];
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function buildChartSeries(chart) {
  const labels = (chart?.items || []).map((item) => item.label || '');
  const values = (chart?.items || []).map((item) => normalizeNumber(item.value));
  return [{ name: chart?.title || '数据', labels, values }];
}

function detectChartType(pptx, chart) {
  const title = String(chart?.title || '');
  if (/(占比|结构|构成|分布)/i.test(title)) return pptx.ChartType.pie;
  if (/(趋势|走势|变化|月|周|日)/i.test(title)) return pptx.ChartType.line;
  return pptx.ChartType.bar;
}

function addPptTitleBlock(slide, title, subtitle = '') {
  slide.addText(title || '报表结果', {
    x: 0.5,
    y: 0.35,
    w: 12.3,
    h: 0.45,
    fontFace: 'Microsoft YaHei',
    fontSize: 24,
    bold: true,
    color: '0F172A',
  });

  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.5,
      y: 0.85,
      w: 12.3,
      h: 0.35,
      fontFace: 'Microsoft YaHei',
      fontSize: 10,
      color: '64748B',
    });
  }
}

function addMetricCardsSlide(pptx, item, cards) {
  const slide = pptx.addSlide();
  addPptTitleBlock(slide, `${item?.title || '报表结果'} · 核心指标`, '从当前报表内容提炼的关键指标卡片');
  const positions = [
    { x: 0.5, y: 1.45 },
    { x: 3.65, y: 1.45 },
    { x: 6.8, y: 1.45 },
    { x: 9.95, y: 1.45 },
  ];

  cards.slice(0, 4).forEach((card, index) => {
    const position = positions[index];
    slide.addShape(pptx.ShapeType.roundRect, {
      x: position.x,
      y: position.y,
      w: 2.8,
      h: 1.5,
      rectRadius: 0.08,
      fill: { color: 'F8FAFC' },
      line: { color: 'CBD5E1', pt: 1 },
    });
    slide.addText(card.label || '指标', {
      x: position.x + 0.18,
      y: position.y + 0.18,
      w: 2.4,
      h: 0.24,
      fontFace: 'Microsoft YaHei',
      fontSize: 9,
      color: '64748B',
      bold: true,
    });
    slide.addText(String(card.value || '-'), {
      x: position.x + 0.18,
      y: position.y + 0.52,
      w: 2.4,
      h: 0.36,
      fontFace: 'Microsoft YaHei',
      fontSize: 20,
      color: '0F172A',
      bold: true,
    });
    if (card.note) {
      slide.addText(card.note, {
        x: position.x + 0.18,
        y: position.y + 1.03,
        w: 2.4,
        h: 0.25,
        fontFace: 'Microsoft YaHei',
        fontSize: 8,
        color: '64748B',
      });
    }
  });
}

function addSectionSlides(pptx, item, sections) {
  chunkArray(sections, 2).forEach((sectionGroup, groupIndex) => {
    const slide = pptx.addSlide();
    addPptTitleBlock(slide, `${item?.title || '报表结果'} · 重点分析 ${groupIndex + 1}`);
    sectionGroup.forEach((section, index) => {
      const top = 1.35 + index * 2.9;
      slide.addShape(pptx.ShapeType.roundRect, {
        x: 0.5,
        y: top,
        w: 12.3,
        h: 2.45,
        rectRadius: 0.06,
        fill: { color: 'FFFFFF' },
        line: { color: 'E2E8F0', pt: 1 },
      });
      slide.addText(section.title || `分节 ${groupIndex * 2 + index + 1}`, {
        x: 0.72,
        y: top + 0.18,
        w: 11.7,
        h: 0.28,
        fontFace: 'Microsoft YaHei',
        fontSize: 14,
        bold: true,
        color: '0F172A',
      });
      if (section.body) {
        slide.addText(section.body, {
          x: 0.72,
          y: top + 0.58,
          w: 11.3,
          h: 0.75,
          fontFace: 'Microsoft YaHei',
          fontSize: 10,
          color: '334155',
          breakLine: false,
          fit: 'shrink',
        });
      }
      const bullets = (section.bullets || []).slice(0, 5).map((bullet) => ({
        text: bullet,
        options: { bullet: { indent: 10 } },
      }));
      if (bullets.length) {
        slide.addText(bullets, {
          x: 0.86,
          y: top + 1.35,
          w: 11.0,
          h: 0.85,
          fontFace: 'Microsoft YaHei',
          fontSize: 9,
          color: '475569',
          breakLine: false,
          fit: 'shrink',
        });
      }
    });
  });
}

function addChartSlides(pptx, item, charts) {
  charts.forEach((chart) => {
    const slide = pptx.addSlide();
    addPptTitleBlock(slide, chart.title || `${item?.title || '报表结果'} · 图表分析`, item?.title || '');
    const series = buildChartSeries(chart);
    try {
      slide.addChart(detectChartType(pptx, chart), series, {
        x: 0.7,
        y: 1.5,
        w: 7.6,
        h: 4.6,
        catAxisLabelFontFace: 'Microsoft YaHei',
        valAxisLabelFontFace: 'Microsoft YaHei',
        showLegend: false,
        showTitle: false,
        showValue: true,
        chartColors: ['0F766E', '14B8A6', '38BDF8', 'F59E0B', 'F97316', 'A855F7'],
      });
    } catch {
      slide.addText(
        (chart.items || []).map((entry) => ({
          text: `${entry.label}：${entry.value}`,
          options: { bullet: { indent: 10 } },
        })),
        {
          x: 0.9,
          y: 1.6,
          w: 7.2,
          h: 4.4,
          fontFace: 'Microsoft YaHei',
          fontSize: 11,
          color: '334155',
        },
      );
    }

    slide.addShape(pptx.ShapeType.roundRect, {
      x: 8.65,
      y: 1.5,
      w: 4.0,
      h: 4.6,
      rectRadius: 0.06,
      fill: { color: 'F8FAFC' },
      line: { color: 'CBD5E1', pt: 1 },
    });
    slide.addText('图表摘要', {
      x: 8.9,
      y: 1.78,
      w: 3.4,
      h: 0.28,
      fontFace: 'Microsoft YaHei',
      fontSize: 12,
      bold: true,
      color: '0F172A',
    });
    slide.addText(
      (chart.items || []).slice(0, 6).map((entry) => ({
        text: `${entry.label}：${entry.value}`,
        options: { bullet: { indent: 10 } },
      })),
      {
        x: 8.95,
        y: 2.18,
        w: 3.1,
        h: 3.5,
        fontFace: 'Microsoft YaHei',
        fontSize: 9,
        color: '475569',
        fit: 'shrink',
      },
    );
  });
}

function addTableSlides(pptx, item, table) {
  const columns = Array.isArray(table?.columns) ? table.columns : [];
  const rows = Array.isArray(table?.rows) ? table.rows : [];
  if (!columns.length) return;

  chunkArray(rows, 8).forEach((rowGroup, index) => {
    const slide = pptx.addSlide();
    addPptTitleBlock(slide, `${item?.title || '报表结果'} · 表格明细 ${index + 1}`);
    slide.addTable([columns, ...rowGroup], {
      x: 0.45,
      y: 1.3,
      w: 12.4,
      h: 5.6,
      margin: 0.05,
      border: { type: 'solid', color: 'CBD5E1', pt: 1 },
      fill: 'FFFFFF',
      fontFace: 'Microsoft YaHei',
      fontSize: 8,
      color: '334155',
      bold: false,
      valign: 'mid',
      autoFit: true,
      rowH: 0.42,
      autoPage: false,
    });
  });
}

function addTextSlides(pptx, item, text) {
  chunkArray(String(text || '').split(/\n{2,}/).filter(Boolean), 4).forEach((paragraphs, index) => {
    const slide = pptx.addSlide();
    addPptTitleBlock(slide, `${item?.title || '报表结果'} · 正文 ${index + 1}`);
    slide.addText(paragraphs.join('\n\n'), {
      x: 0.7,
      y: 1.4,
      w: 12.0,
      h: 5.4,
      fontFace: 'Microsoft YaHei',
      fontSize: 12,
      color: '334155',
      fit: 'shrink',
      margin: 0.08,
      valign: 'top',
    });
  });
}

export function buildReportPptxFilename(item) {
  const baseName = sanitizeFilename(item?.title, 'report');
  return baseName.toLowerCase().endsWith('.pptx') ? baseName : `${baseName}.pptx`;
}

export async function buildReportPptxBuffer(item) {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'AI文档数据助理';
  pptx.company = 'AI文档数据助理';
  pptx.subject = item?.title || '报表结果';
  pptx.title = item?.title || '报表结果';
  pptx.lang = 'zh-CN';
  pptx.theme = {
    headFontFace: 'Microsoft YaHei',
    bodyFontFace: 'Microsoft YaHei',
    lang: 'zh-CN',
  };

  const libraries = Array.isArray(item?.libraries)
    ? item.libraries.map((entry) => entry.label || entry.key).filter(Boolean).join('、')
    : '';
  const subtitleParts = [
    item?.templateLabel ? `模板：${item.templateLabel}` : '',
    libraries ? `知识库：${libraries}` : '',
    item?.createdAt ? `生成时间：${item.createdAt}` : '',
  ].filter(Boolean);

  const titleSlide = pptx.addSlide();
  titleSlide.background = { color: 'F8FAFC' };
  titleSlide.addText(item?.title || '报表结果', {
    x: 0.7,
    y: 1.2,
    w: 11.5,
    h: 0.8,
    fontFace: 'Microsoft YaHei',
    fontSize: 28,
    bold: true,
    color: '0F172A',
  });
  if (subtitleParts.length) {
    titleSlide.addText(subtitleParts.join('  |  '), {
      x: 0.75,
      y: 2.15,
      w: 11.2,
      h: 0.35,
      fontFace: 'Microsoft YaHei',
      fontSize: 10,
      color: '64748B',
    });
  }
  if (item?.summary || item?.page?.summary || item?.content) {
    titleSlide.addShape(pptx.ShapeType.roundRect, {
      x: 0.75,
      y: 3.0,
      w: 11.4,
      h: 2.3,
      rectRadius: 0.08,
      fill: { color: 'FFFFFF' },
      line: { color: 'CBD5E1', pt: 1 },
    });
    titleSlide.addText(item?.page?.summary || item?.summary || item?.content || '', {
      x: 1.0,
      y: 3.3,
      w: 10.9,
      h: 1.7,
      fontFace: 'Microsoft YaHei',
      fontSize: 12,
      color: '334155',
      fit: 'shrink',
    });
  }

  if (item?.page?.cards?.length) {
    addMetricCardsSlide(pptx, item, item.page.cards);
  }
  if (item?.page?.sections?.length) {
    addSectionSlides(pptx, item, item.page.sections);
  }
  if (item?.page?.charts?.length) {
    addChartSlides(pptx, item, item.page.charts);
  }
  if (item?.table?.columns?.length) {
    addTableSlides(pptx, item, item.table);
  }
  if (!item?.page?.sections?.length && item?.content) {
    addTextSlides(pptx, item, item.content);
  }

  const buffer = await pptx.write({ outputType: 'nodebuffer' });
  return buffer;
}
