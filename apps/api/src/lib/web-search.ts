type SearchResultItem = {
  title: string;
  url: string;
  snippet: string;
};

const WEB_SEARCH_TRIGGER = /(最新|最近|今日|今天|目前|当前|刚刚|新闻|官网|官方|发布|公告|价格|股价|汇率|天气|比分|赛程|热搜|什么时候|何时|what's new|latest|today|current|news|official|price|weather|score|schedule)/i;

function decodeHtml(text: string) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x2F;/g, '/');
}

function stripTags(text: string) {
  return decodeHtml(String(text || '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function extractDuckDuckGoResults(html: string) {
  const results: SearchResultItem[] = [];
  const blocks = html.match(/<div class="result(?:.|\n|\r)*?<\/div>\s*<\/div>/g) || [];

  for (const block of blocks) {
    const titleMatch = block.match(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;
    const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i)
      || block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/div>/i);
    const url = decodeHtml(titleMatch[1] || '').trim();
    const title = stripTags(titleMatch[2] || '');
    const snippet = stripTags(snippetMatch?.[1] || '');
    if (!url || !title) continue;
    results.push({ title, url, snippet });
    if (results.length >= 5) break;
  }

  return results;
}

function extractBingResults(html: string) {
  const results: SearchResultItem[] = [];
  const blocks = html.match(/<li class="b_algo"[\s\S]*?<\/li>/g) || [];

  for (const block of blocks) {
    const titleMatch = block.match(/<h2><a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h2>/i);
    if (!titleMatch) continue;
    const snippetMatch = block.match(/<p>([\s\S]*?)<\/p>/i);
    const url = decodeHtml(titleMatch[1] || '').trim();
    const title = stripTags(titleMatch[2] || '');
    const snippet = stripTags(snippetMatch?.[1] || '');
    if (!url || !title) continue;
    results.push({ title, url, snippet });
    if (results.length >= 5) break;
  }

  return results;
}

async function fetchSearchPage(url: string) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) {
    throw new Error(`Search request failed (${response.status})`);
  }
  return response.text();
}

export function shouldUseWebSearchForPrompt(prompt: string) {
  return WEB_SEARCH_TRIGGER.test(String(prompt || ''));
}

export async function searchWeb(query: string) {
  const encoded = encodeURIComponent(String(query || '').trim());
  if (!encoded) return [];

  try {
    const html = await fetchSearchPage(`https://html.duckduckgo.com/html/?q=${encoded}`);
    const results = extractDuckDuckGoResults(html);
    if (results.length) return results;
  } catch {
    // fall through to Bing
  }

  try {
    const html = await fetchSearchPage(`https://www.bing.com/search?q=${encoded}`);
    return extractBingResults(html);
  } catch {
    return [];
  }
}

export async function buildWebSearchContextBlock(query: string) {
  const results = await searchWeb(query);
  if (!results.length) return '';

  return [
    'Realtime web search results:',
    ...results.map((item, index) => {
      const snippet = item.snippet ? ` | snippet=${item.snippet}` : '';
      return `${index + 1}. ${item.title} | url=${item.url}${snippet}`;
    }),
  ].join('\n');
}
