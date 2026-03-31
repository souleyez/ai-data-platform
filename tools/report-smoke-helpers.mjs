export const REPORT_CENTER_PAGE_TITLE = '\u62a5\u8868\u4e2d\u5fc3';
export const REPORT_CENTER_SECTION_LABELS = [
  '\u7528\u6237\u4e0a\u4f20\u7684\u6a21\u677f',
  '\u5df2\u751f\u6210\u7684\u62a5\u8868',
];
export const SHARED_REPORT_SHELL_MARKERS = ['shared-report-shell', 'shared-report-card'];
export const INVALID_SHARED_REPORT_TITLE = '\u9759\u6001\u9875\u94fe\u63a5\u65e0\u6548';

function fail(context, message) {
  throw new Error(`${context} ${message}`);
}

export function assertSectionsContainInOrder(actual, expected, context) {
  let cursor = 0;
  for (const section of expected) {
    const foundAt = actual.findIndex((item, index) => index >= cursor && String(item || '').includes(section));
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
    title: item?.title || '\u9759\u6001\u5206\u6790\u9875',
    createdAt: item?.createdAt || '',
    content: item?.content || '',
    page: item?.page || null,
  }));
}

export function assertReportCenterPageHtml(html, context = 'reports page') {
  const text = String(html || '');
  if (!text.includes(REPORT_CENTER_PAGE_TITLE)) {
    fail(context, `is missing title "${REPORT_CENTER_PAGE_TITLE}"`);
  }

  for (const sectionLabel of REPORT_CENTER_SECTION_LABELS) {
    if (!text.includes(sectionLabel)) {
      fail(context, `is missing section label "${sectionLabel}"`);
    }
  }
}

export function assertHtmlDocument(html, context = 'html page') {
  const text = String(html || '');
  if (!text.includes('<html') || !text.includes('<body')) {
    fail(context, 'did not render an html document');
  }
  if (text.length < 200) {
    fail(context, `html payload is unexpectedly small (${text.length})`);
  }
}

export function assertValidSharedReportHtml(html, item, context = 'shared report page') {
  const text = String(html || '');
  const title = String(item?.title || '').trim();
  if (!title || !text.includes(title)) {
    fail(context, 'did not render the expected report title');
  }

  for (const marker of SHARED_REPORT_SHELL_MARKERS) {
    if (!text.includes(marker)) {
      fail(context, `is missing expected shell marker "${marker}"`);
    }
  }

  if (item?.page?.summary && !text.includes(String(item.page.summary))) {
    fail(context, 'did not render the expected page summary');
  }

  if (item?.page?.cards?.length && !text.includes('generated-page-card')) {
    fail(context, 'did not render the expected page cards');
  }
}

export function assertInvalidSharedReportHtml(html, context = 'invalid shared report page') {
  const text = String(html || '');
  for (const marker of SHARED_REPORT_SHELL_MARKERS) {
    if (!text.includes(marker)) {
      fail(context, `is missing expected shell marker "${marker}"`);
    }
  }

  if (!text.includes(INVALID_SHARED_REPORT_TITLE)) {
    fail(context, `did not render fallback title "${INVALID_SHARED_REPORT_TITLE}"`);
  }
}
