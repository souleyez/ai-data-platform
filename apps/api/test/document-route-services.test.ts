import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { discoverCandidateDirectories } from '../src/lib/document-route-services.js';

async function writeFixtureFile(filePath: string, contents = 'fixture') {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents, 'utf8');
}

test('discoverCandidateDirectories should summarize files and hotspots under common roots', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'candidate-discovery-'));
  const userProfile = path.join(tempRoot, 'UserProfile');
  const appData = path.join(userProfile, 'AppData', 'Roaming');
  const localAppData = path.join(userProfile, 'AppData', 'Local');
  const oneDrive = path.join(userProfile, 'OneDrive');
  const documents = path.join(userProfile, 'Documents');
  const desktop = path.join(userProfile, 'Desktop');

  const previousEnv = {
    USERPROFILE: process.env.USERPROFILE,
    HOME: process.env.HOME,
    APPDATA: process.env.APPDATA,
    LOCALAPPDATA: process.env.LOCALAPPDATA,
    OneDrive: process.env.OneDrive,
  };

  process.env.USERPROFILE = userProfile;
  process.env.HOME = userProfile;
  process.env.APPDATA = appData;
  process.env.LOCALAPPDATA = localAppData;
  process.env.OneDrive = oneDrive;

  try {
    await writeFixtureFile(path.join(documents, 'Contracts', 'msa.pdf'));
    await writeFixtureFile(path.join(documents, 'Contracts', 'pricing.docx'));
    await writeFixtureFile(path.join(documents, 'Notes', 'brief.md'));
    await writeFixtureFile(path.join(desktop, 'todo.txt'));

    const items = await discoverCandidateDirectories();
    const documentsCandidate = items.find((item) => item.path === documents);
    const desktopCandidate = items.find((item) => item.path === desktop);

    assert.ok(documentsCandidate);
    assert.equal(documentsCandidate?.fileCount, 3);
    assert.equal(documentsCandidate?.pendingScan, false);
    assert.deepEqual(documentsCandidate?.sampleExtensions, ['.docx', '.md', '.pdf']);
    assert.match(documentsCandidate?.discoveryExplanation || '', /系统兜底目录/);
    assert.match(documentsCandidate?.discoveryExplanation || '', /3 个可扫描文件/);
    assert.ok(documentsCandidate?.latestModifiedAt);
    assert.equal(documentsCandidate?.hotspots.length, 2);
    assert.deepEqual(
      documentsCandidate?.hotspots.map((item) => item.label),
      ['Contracts', 'Notes'],
    );
    assert.equal(documentsCandidate?.hotspots[0]?.fileCount, 2);
    assert.deepEqual(documentsCandidate?.hotspots[0]?.sampleExtensions, ['.docx', '.pdf']);
    assert.match(documentsCandidate?.hotspots[0]?.discoveryExplanation || '', /热点子目录/);

    assert.ok(desktopCandidate);
    assert.equal(desktopCandidate?.fileCount, 1);
    assert.deepEqual(desktopCandidate?.sampleExtensions, ['.txt']);
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (typeof value === 'undefined') {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('discoverCandidateDirectories should include common IM storage directories when they exist', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'candidate-discovery-im-'));
  const userProfile = path.join(tempRoot, 'UserProfile');
  const appData = path.join(userProfile, 'AppData', 'Roaming');
  const localAppData = path.join(userProfile, 'AppData', 'Local');
  const oneDrive = path.join(userProfile, 'OneDrive');
  const documents = path.join(userProfile, 'Documents');

  const previousEnv = {
    USERPROFILE: process.env.USERPROFILE,
    HOME: process.env.HOME,
    APPDATA: process.env.APPDATA,
    LOCALAPPDATA: process.env.LOCALAPPDATA,
    OneDrive: process.env.OneDrive,
  };

  process.env.USERPROFILE = userProfile;
  process.env.HOME = userProfile;
  process.env.APPDATA = appData;
  process.env.LOCALAPPDATA = localAppData;
  process.env.OneDrive = oneDrive;

  try {
    await writeFixtureFile(path.join(documents, 'WeChat Files', 'wxid_demo', 'proposal.pdf'));
    await writeFixtureFile(path.join(userProfile, 'xwechat_files', 'soulzyn_demo', 'quote.xlsx'));
    await writeFixtureFile(path.join(documents, 'Tencent Files', '12345', 'chat.docx'));
    await writeFixtureFile(path.join(appData, 'LarkShell', 'sdk_storage', 'meta.json'));
    await writeFixtureFile(path.join(appData, 'DingTalk', 'meeting', 'agenda.docx'));

    const items = await discoverCandidateDirectories();

    const wechatCandidate = items.find((item) => item.label === 'WeChat Files');
    const altWechatCandidate = items.find((item) => item.label === 'WeChat Files (Alt)');
    const qqCandidate = items.find((item) => item.label === 'Tencent Files');
    const larkCandidate = items.find((item) => item.label === 'Lark Cache');
    const dingTalkCandidate = items.find((item) => item.label === 'DingTalk Cache');

    assert.ok(wechatCandidate);
    assert.ok(altWechatCandidate);
    assert.ok(qqCandidate);
    assert.ok(larkCandidate);
    assert.ok(dingTalkCandidate);

    assert.equal(wechatCandidate?.fileCount, 1);
    assert.equal(altWechatCandidate?.fileCount, 1);
    assert.equal(qqCandidate?.fileCount, 1);
    assert.equal(larkCandidate?.fileCount, 1);
    assert.equal(dingTalkCandidate?.fileCount, 1);
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (typeof value === 'undefined') {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
