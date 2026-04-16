import { promises as fs } from 'node:fs';
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { buildAugmentedEnv, getPythonCommandCandidates } from './runtime-executables.js';

const execFileAsync = promisify(execFile);

export async function renderPdfPagesToImages(filePath: string, maxPages = 12) {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-presentation-render-'));
  const pythonScript = [
    'import json, sys',
    'if hasattr(sys.stdout, "reconfigure"): sys.stdout.reconfigure(encoding="utf-8")',
    'from pathlib import Path',
    'try:',
    '    import pypdfium2 as pdfium',
    'except Exception as exc:',
    '    print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))',
    '    sys.exit(0)',
    'pdf_path = sys.argv[1]',
    'work_dir = Path(sys.argv[2])',
    'max_pages = max(1, int(sys.argv[3]))',
    'work_dir.mkdir(parents=True, exist_ok=True)',
    'images = []',
    'try:',
    '    pdf = pdfium.PdfDocument(pdf_path)',
    '    page_count = len(pdf)',
    '    for index in range(min(page_count, max_pages)):',
    '        page = pdf[index]',
    '        bitmap = page.render(scale=2)',
    '        image = bitmap.to_pil()',
    '        image_path = work_dir / f"page-{index + 1}.png"',
    '        image.save(image_path)',
    '        images.append({"pageNumber": index + 1, "imagePath": str(image_path)})',
    '    print(json.dumps({"ok": True, "images": images}, ensure_ascii=False))',
    'except Exception as exc:',
    '    print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))',
  ].join('\n');

  try {
    for (const candidate of getPythonCommandCandidates()) {
      try {
        const { stdout } = await execFileAsync(candidate, ['-c', pythonScript, filePath, workDir, String(Math.max(1, maxPages))], {
          maxBuffer: 64 * 1024 * 1024,
          timeout: 120000,
          env: buildAugmentedEnv(),
        });
        const parsed = JSON.parse(String(stdout || '{}')) as {
          ok?: boolean;
          images?: Array<{ pageNumber?: number; imagePath?: string }>;
        };
        if (!parsed.ok || !Array.isArray(parsed.images) || !parsed.images.length) continue;
        const images = parsed.images
          .map((entry) => ({
            pageNumber: Number(entry.pageNumber || 0) || 0,
            imagePath: String(entry.imagePath || '').trim(),
          }))
          .filter((entry) => entry.pageNumber > 0 && entry.imagePath);
        if (images.length) {
          return { images, workDir };
        }
      } catch {
        // try next python candidate
      }
    }

    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    return null;
  } catch {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    return null;
  }
}

export async function renderPdfDocumentToImages(filePath: string, options?: { maxPages?: number }) {
  const rendered = await renderPdfPagesToImages(filePath, Math.max(1, Number(options?.maxPages || 12)));
  if (!rendered) return null;

  return {
    images: rendered.images,
    cleanup: async () => {
      await fs.rm(rendered.workDir, { recursive: true, force: true }).catch(() => undefined);
    },
  };
}
