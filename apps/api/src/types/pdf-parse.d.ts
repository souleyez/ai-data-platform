declare module 'pdf-parse' {
  export default function pdfParse(
    dataBuffer: Buffer,
    options?: Record<string, unknown>,
  ): Promise<{
    numpages: number;
    numrender: number;
    info?: Record<string, unknown>;
    metadata?: unknown;
    version?: string;
    text: string;
  }>;
}
