const API_BASE = 'http://127.0.0.1:3100/api';

const LABEL_ORDER = '\u8ba2\u5355\u5206\u6790';
const LABEL_RESUME = '\u7b80\u5386';
const LABEL_BIDS = 'bids';
const LABEL_IOT = 'IOT\u89e3\u51b3\u65b9\u6848';
const SYSTEM_PREFIX = '[\u7cfb\u7edf\u6837\u4f8b]';

async function api(pathname, options = {}) {
  const response = await fetch(`${API_BASE}${pathname}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!response.ok) {
    throw new Error(`${pathname} ${response.status}: ${json?.error || text}`);
  }
  return json;
}

async function main() {
  const [overview, reports, documents] = await Promise.all([
    api('/documents-overview'),
    api('/reports'),
    api('/documents'),
  ]);

  const libraries = (overview.libraries || []).filter((item) =>
    [LABEL_ORDER, LABEL_RESUME, LABEL_BIDS, LABEL_IOT].includes(item.label),
  );

  const sampleDocs = (documents.items || [])
    .filter((item) => String(item.name || '').includes('sample-') || String(item.name || '').includes('default-sample-'))
    .map((item) => ({
      name: item.name,
      title: item.title,
      schemaType: item.schemaType,
      parseStage: item.parseStage,
      groups: item.confirmedGroups || item.groups || [],
    }));

  const sampleReports = (reports.outputRecords || [])
    .filter((item) => String(item.title || '').startsWith(SYSTEM_PREFIX))
    .map((item) => ({
      title: item.title,
      groupLabel: item.groupLabel,
      templateLabel: item.templateLabel,
      outputType: item.outputType,
    }));

  console.log(
    JSON.stringify(
      {
        status: 'ok',
        libraries,
        sampleDocs,
        sampleReports,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
