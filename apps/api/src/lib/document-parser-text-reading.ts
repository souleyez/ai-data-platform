import { promises as fs } from 'node:fs';

function hasUtf8Bom(buffer: Buffer) {
  return buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
}

function hasUtf16LeBom(buffer: Buffer) {
  return buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe;
}

function hasUtf16BeBom(buffer: Buffer) {
  return buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff;
}

function isExactUtf8RoundTrip(buffer: Buffer) {
  try {
    return Buffer.from(buffer.toString('utf8'), 'utf8').equals(buffer);
  } catch {
    return false;
  }
}

function scoreDecodedText(text: string) {
  if (!text) return -1000;

  const replacementCount = (text.match(/\uFFFD/g) || []).length;
  const nullCount = (text.match(/\u0000/g) || []).length;
  const controlCount = (text.match(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g) || []).length;
  const cjkCount = (text.match(/[\u4E00-\u9FFF]/g) || []).length;
  const asciiWordCount = (text.match(/[A-Za-z0-9]/g) || []).length;
  const whitespaceCount = (text.match(/\s/g) || []).length;
  const mojibakeChars = [0x951F, 0x9225, 0x935A, 0x93C2, 0x7EE0]
    .map((codePoint) => String.fromCodePoint(codePoint));
  const mojibakeCount = mojibakeChars.reduce(
    (count, char) => count + ((text.match(new RegExp(char, 'g')) || []).length),
    0,
  );

  return (cjkCount * 3)
    + asciiWordCount
    + whitespaceCount
    - (replacementCount * 40)
    - (nullCount * 30)
    - (controlCount * 20)
    - (mojibakeCount * 8);
}

export async function readTextWithBestEffortEncoding(filePath: string) {
  const buffer = await fs.readFile(filePath);

  if (hasUtf8Bom(buffer)) {
    return { text: new TextDecoder('utf-8').decode(buffer), encoding: 'utf8-bom' };
  }

  if (hasUtf16LeBom(buffer)) {
    return { text: new TextDecoder('utf-16le').decode(buffer), encoding: 'utf16le' };
  }

  if (hasUtf16BeBom(buffer)) {
    return { text: new TextDecoder('utf-16be').decode(buffer), encoding: 'utf16be' };
  }

  if (isExactUtf8RoundTrip(buffer)) {
    return { text: buffer.toString('utf8'), encoding: 'utf8' };
  }

  const candidates: Array<{ text: string; encoding: string }> = [
    { text: buffer.toString('utf8'), encoding: 'utf8' },
  ];

  try {
    candidates.push({ text: new TextDecoder('gb18030').decode(buffer), encoding: 'gb18030' });
  } catch {
    // ignore
  }

  try {
    candidates.push({ text: new TextDecoder('utf-16le').decode(buffer), encoding: 'utf16le' });
  } catch {
    // ignore
  }

  try {
    candidates.push({ text: new TextDecoder('utf-16be').decode(buffer), encoding: 'utf16be' });
  } catch {
    // ignore
  }

  const ranked = candidates
    .map((candidate) => ({ ...candidate, score: scoreDecodedText(candidate.text) }))
    .sort((left, right) => right.score - left.score);

  return ranked[0] || { text: buffer.toString('utf8'), encoding: 'utf8' };
}
