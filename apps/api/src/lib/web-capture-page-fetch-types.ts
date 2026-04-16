export type PageResult = {
  kind: 'page';
  url: string;
  html: string;
  title: string;
  text: string;
  extractionMethod?: 'trafilatura' | 'fallback';
};

export type DownloadResult = {
  kind: 'download';
  url: string;
  title: string;
  text: string;
  contentType: string;
  fileName: string;
  extension: string;
  data: Buffer;
};

export type RuntimeAuth = {
  username: string;
  password: string;
};

export type CookieJar = Map<string, Map<string, string>>;

export type LoginForm = {
  actionUrl: string;
  method: 'GET' | 'POST';
  fields: Array<{
    name: string;
    value: string;
    type: string;
  }>;
};

export type MainContentResult = {
  text: string;
  title: string;
  method: 'trafilatura' | 'fallback';
};
