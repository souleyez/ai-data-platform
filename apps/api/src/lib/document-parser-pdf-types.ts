export type PdfExtractionResult = {
  text: string;
  pageCount: number;
  method: 'pdf-parse' | 'pypdf' | 'ocrmypdf';
};

export type PdfParserDeps = {
  normalizeText: (text: string) => string;
  withTemporaryAsciiCopy: <T>(filePath: string, run: (inputPath: string) => Promise<T>) => Promise<T>;
};
