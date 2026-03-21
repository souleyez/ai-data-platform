import os from 'node:os';
import path from 'node:path';

function unique(items: string[]) {
  return Array.from(new Set(items.filter(Boolean)));
}

function buildWindowsPythonHomes() {
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const baseDir = path.join(localAppData, 'Programs', 'Python');
  const versionDirs = ['Python313', 'Python312', 'Python311', 'Python310'];
  return versionDirs.map((dir) => path.join(baseDir, dir));
}

function getExtraPathEntries() {
  const entries = [
    process.env.TESSERACT_DIR || '',
    'C:\\Program Files\\Tesseract-OCR',
  ];

  if (process.platform === 'win32') {
    for (const home of buildWindowsPythonHomes()) {
      entries.push(home, path.join(home, 'Scripts'));
    }
  }

  return unique(entries);
}

export function buildAugmentedEnv() {
  const currentPath = process.env.PATH || '';
  const separator = process.platform === 'win32' ? ';' : ':';
  const additions = getExtraPathEntries().filter((entry) => !currentPath.toLowerCase().includes(entry.toLowerCase()));
  const tesseractBin = process.env.TESSERACT_BIN
    || (process.platform === 'win32' ? 'C:\\Program Files\\Tesseract-OCR\\tesseract.exe' : 'tesseract');
  return {
    ...process.env,
    PATH: additions.length ? `${additions.join(separator)}${separator}${currentPath}` : currentPath,
    TESSERACT_BIN: tesseractBin,
  };
}

export function getPythonCommandCandidates() {
  const commands = [process.env.PYTHON_BIN || ''];

  if (process.platform === 'win32') {
    for (const home of buildWindowsPythonHomes()) {
      commands.push(path.join(home, 'python.exe'));
    }
  }

  commands.push('python3', 'python');
  return unique(commands);
}

export function getOcrMyPdfCommandCandidates() {
  const commands = [process.env.OCRMYPDF_BIN || ''];

  if (process.platform === 'win32') {
    for (const home of buildWindowsPythonHomes()) {
      commands.push(path.join(home, 'Scripts', 'ocrmypdf.exe'));
    }
  }

  commands.push('ocrmypdf');
  return unique(commands);
}
