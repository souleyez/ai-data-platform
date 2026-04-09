import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { parseDocument } from '../src/lib/document-parser.js';

async function createMinimalPptx(filePath: string) {
  const archive = new JSZip();
  archive.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
      <Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
      <Override PartName="/ppt/notesSlides/notesSlide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>
    </Types>`);
  archive.file('ppt/slides/slide1.xml', `<?xml version="1.0" encoding="UTF-8"?>
    <p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
      <p:cSld><p:spTree>
        <p:sp><p:txBody>
          <a:p><a:r><a:t>项目概览</a:t></a:r></a:p>
          <a:p><a:r><a:t>建设 8 个乡镇公共停车区域</a:t></a:r></a:p>
        </p:txBody></p:sp>
      </p:spTree></p:cSld>
    </p:sld>`);
  archive.file('ppt/slides/slide2.xml', `<?xml version="1.0" encoding="UTF-8"?>
    <p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
      <p:cSld><p:spTree>
        <p:sp><p:txBody>
          <a:p><a:r><a:t>招标要点</a:t></a:r></a:p>
          <a:p><a:r><a:t>投标保证金 8 万元</a:t></a:r></a:p>
        </p:txBody></p:sp>
      </p:spTree></p:cSld>
    </p:sld>`);
  archive.file('ppt/notesSlides/notesSlide1.xml', `<?xml version="1.0" encoding="UTF-8"?>
    <p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
      <p:cSld><p:spTree>
        <p:sp><p:txBody>
          <a:p><a:r><a:t>说明：优先关注建设规模。</a:t></a:r></a:p>
        </p:txBody></p:sp>
      </p:spTree></p:cSld>
    </p:notes>`);

  const buffer = await archive.generateAsync({ type: 'nodebuffer' });
  await fs.writeFile(filePath, buffer);
}

test('parseDocument should extract slide text from pptx archives', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-pptx-'));
  const filePath = path.join(tempDir, '招标汇报.pptx');

  try {
    await createMinimalPptx(filePath);
    const doc = await parseDocument(filePath);

    assert.equal(doc.parseStatus, 'parsed');
    assert.equal(doc.parseMethod, 'pptx-ooxml');
    assert.equal(doc.ext, '.pptx');
    assert.match(String(doc.fullText || ''), /项目概览/);
    assert.match(String(doc.fullText || ''), /投标保证金 8 万元/);
    assert.match(String(doc.fullText || ''), /Speaker notes/);
    assert.match(String(doc.summary || ''), /项目概览|招标要点/);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
