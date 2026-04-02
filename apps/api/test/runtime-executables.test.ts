import test from 'node:test';
import assert from 'node:assert/strict';
import { getTesseractLanguageCandidates } from '../src/lib/runtime-executables.js';

test('getTesseractLanguageCandidates should prefer configured values and keep chinese defaults', () => {
  const previousLang = process.env.TESSERACT_LANG;
  const previousLangs = process.env.TESSERACT_LANGS;

  process.env.TESSERACT_LANG = 'chi_tra+eng';
  process.env.TESSERACT_LANGS = 'chi_sim+eng, chi_sim, eng';

  try {
    assert.deepEqual(
      getTesseractLanguageCandidates().slice(0, 4),
      ['chi_sim+eng', 'chi_sim', 'eng', 'chi_tra+eng'],
    );
  } finally {
    if (previousLang === undefined) delete process.env.TESSERACT_LANG;
    else process.env.TESSERACT_LANG = previousLang;

    if (previousLangs === undefined) delete process.env.TESSERACT_LANGS;
    else process.env.TESSERACT_LANGS = previousLangs;
  }
});

test('getTesseractLanguageCandidates should default to chinese plus english OCR', () => {
  const previousLang = process.env.TESSERACT_LANG;
  const previousLangs = process.env.TESSERACT_LANGS;

  delete process.env.TESSERACT_LANG;
  delete process.env.TESSERACT_LANGS;

  try {
    assert.deepEqual(getTesseractLanguageCandidates(), ['chi_sim+eng', 'chi_sim', 'eng']);
  } finally {
    if (previousLang === undefined) delete process.env.TESSERACT_LANG;
    else process.env.TESSERACT_LANG = previousLang;

    if (previousLangs === undefined) delete process.env.TESSERACT_LANGS;
    else process.env.TESSERACT_LANGS = previousLangs;
  }
});
