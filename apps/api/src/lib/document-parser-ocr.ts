import { promises as fs } from 'node:fs';
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { buildAugmentedEnv, getPythonCommandCandidates, getTesseractLanguageCandidates } from './runtime-executables.js';

const execFileAsync = promisify(execFile);

type OcrDeps = {
  normalizeText: (text: string) => string;
  withTemporaryAsciiCopy: <T>(filePath: string, run: (inputPath: string) => Promise<T>) => Promise<T>;
};

async function buildPreprocessedImageVariants(filePath: string) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-ocr-image-'));
  const pythonScript = [
    'import json, os, sys',
    'from pathlib import Path',
    'if hasattr(sys.stdout, "reconfigure"): sys.stdout.reconfigure(encoding="utf-8")',
    'try:',
    '    from PIL import Image, ImageOps, ImageFilter',
    'except Exception:',
    '    print(json.dumps({"ok": False, "variants": []}, ensure_ascii=False))',
    '    sys.exit(0)',
    'source = Path(sys.argv[1])',
    'target_dir = Path(sys.argv[2])',
    'target_dir.mkdir(parents=True, exist_ok=True)',
    'image = Image.open(source)',
    'image = ImageOps.exif_transpose(image)',
    'base = image.convert("L")',
    'variants = []',
    'def save_variant(name, variant):',
    '    output = target_dir / name',
    '    variant.save(output)',
    '    variants.append(str(output))',
    'width, height = base.size',
    'scale = 2 if max(width, height) < 1800 else 1',
    'if scale > 1:',
    '    resized = base.resize((max(1, width * scale), max(1, height * scale)))',
    'else:',
    '    resized = base.copy()',
    'save_variant("gray.png", resized)',
    'enhanced = ImageOps.autocontrast(resized)',
    'save_variant("gray-autocontrast.png", enhanced)',
    'denoised = enhanced.filter(ImageFilter.MedianFilter(size=3))',
    'save_variant("gray-denoised.png", denoised)',
    'thresholded = denoised.point(lambda pixel: 255 if pixel > 170 else 0)',
    'save_variant("bw-threshold.png", thresholded)',
    'inverted = ImageOps.invert(thresholded)',
    'save_variant("bw-inverted.png", inverted)',
    'print(json.dumps({"ok": True, "variants": variants}, ensure_ascii=False))',
  ].join('\n');

  try {
    for (const candidate of getPythonCommandCandidates()) {
      try {
        const { stdout } = await execFileAsync(candidate, ['-c', pythonScript, filePath, tempDir], {
          maxBuffer: 8 * 1024 * 1024,
          env: buildAugmentedEnv(),
        });
        const parsed = JSON.parse(String(stdout || '{}')) as { ok?: boolean; variants?: string[] };
        if (parsed.ok && Array.isArray(parsed.variants) && parsed.variants.length) {
          return {
            tempDir,
            variants: parsed.variants.map((item) => String(item || '').trim()).filter(Boolean),
          };
        }
      } catch {
        // try next python interpreter
      }
    }
  } catch {
    // fall through to cleanup + empty result
  }

  await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  return {
    tempDir: '',
    variants: [] as string[],
  };
}

export async function extractImageTextWithTesseract(filePath: string, { normalizeText, withTemporaryAsciiCopy }: OcrDeps) {
  const env = buildAugmentedEnv();
  const candidates = [
    env.TESSERACT_BIN || '',
    process.platform === 'win32' ? 'C:\\Program Files\\Tesseract-OCR\\tesseract.exe' : '',
    'tesseract',
  ].filter(Boolean);
  const languageCandidates = getTesseractLanguageCandidates();
  const psmCandidates = ['6', '3'];

  return withTemporaryAsciiCopy(filePath, async (inputPath) => {
    const preprocessed = await buildPreprocessedImageVariants(inputPath);
    const variantPaths = [inputPath, ...preprocessed.variants];
    let bestText = '';

    try {
      for (const variantPath of variantPaths) {
        for (const command of candidates) {
          for (const language of languageCandidates) {
            for (const psm of psmCandidates) {
              try {
                const { stdout } = await execFileAsync(command, [variantPath, 'stdout', '--psm', psm, '-l', language], {
                  maxBuffer: 16 * 1024 * 1024,
                  env,
                });
                const text = normalizeText(String(stdout || ''));
                if (text.length > bestText.length) {
                  bestText = text;
                }
              } catch {
                // Try the next OCR configuration.
              }
            }
          }
        }
      }
    } finally {
      if (preprocessed.tempDir) {
        await fs.rm(preprocessed.tempDir, { recursive: true, force: true }).catch(() => undefined);
      }
    }

    return bestText;
  });
}
