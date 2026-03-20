declare module 'pdf-parse/lib/pdf-parse.js' {
  export default function pdfParse(
    dataBuffer: Buffer | Uint8Array,
    options?: Record<string, unknown>,
  ): Promise<{ text?: string }>;
}
