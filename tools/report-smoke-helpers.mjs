export const REPORT_CENTER_PAGE_TITLE = '报表中心';
export const REPORT_CENTER_SECTION_LABELS = ['用户上传的模板', '已生成的报表'];
export const SHARED_REPORT_SHELL_MARKERS = ['shared-report-shell', 'shared-report-card'];
export const INVALID_SHARED_REPORT_TITLE = '静态页链接无效';

function fail(context, message) {
  throw new Error(`${context} ${message}`);
}

export function assertSectionsContainInOrder(actual, expected, context) {
  let cursor = 0;
  for (const section of expected) {
    const foundAt = actual.indexOf(section, cursor);
    if (foundAt === -1) {
      fail(context, `is missing section "${section}" in ${actual.join(', ') || 'none'}`);
    }
    cursor = foundAt + 1;
  }
}

export function encodeBase64Url(text) {
  return Buffer.from(String(text || ''), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function buildSharedReportPayload(item) {
  if (!item || item.kind === 'answer') return '';

  return encodeBase64Url(JSON.stringify({
    title: item?.title || '静态分析页',
    createdAt: item?.createdAt || '',
    content: item?.content || '',
    page: item?.page || null,
  }));
}

export function assertReportCenterPageHtml(html, context = 'reports page') {
  if (!String(html || '').includes(REPORT_CENTER_PAGE_TITLE)) {
    fail(context, `is missing title "${REPORT_CENTER_PAGE_TITLE}"`);
  }

  for (const sectionLabel of REPORT_CENTER_SECTION_LABELS) {
    if (!html.includes(sectionLabel)) {
      fail(context, `is missing section label "${sectionLabel}"`);
    }
  }
}

export function assertValidSharedReportHtml(html, item, context = 'shared report page') {
  const title = String(item?.title || '').trim();
  if (!title || !html.includes(title)) {
    fail(context, 'did not render the expected report title');
  }

  for (const marker of SHARED_REPORT_SHELL_MARKERS) {
    if (!html.includes(marker)) {
      fail(context, `is missing expected shell marker "${marker}"`);
    }
  }

  if (item?.page?.summary && !html.includes(String(item.page.summary))) {
    fail(context, 'did not render the expected page summary');
  }

  if (item?.page?.cards?.length && !html.includes('generated-page-card')) {
    fail(context, 'did not render the expected page cards');
  }
}

export function assertInvalidSharedReportHtml(html, context = 'invalid shared report page') {
  for (const marker of SHARED_REPORT_SHELL_MARKERS) {
    if (!html.includes(marker)) {
      fail(context, `is missing expected shell marker "${marker}"`);
    }
  }

  if (!html.includes(INVALID_SHARED_REPORT_TITLE)) {
    fail(context, `did not render fallback title "${INVALID_SHARED_REPORT_TITLE}"`);
  }
}
