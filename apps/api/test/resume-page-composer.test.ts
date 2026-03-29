import test from 'node:test';
import assert from 'node:assert/strict';
import type { ParsedDocument } from '../src/lib/document-parser.js';
import {
  runResumePageComposer,
  runResumePageComposerDetailed,
} from '../src/lib/resume-page-composer.js';
import type { ResumeDisplayProfile } from '../src/lib/resume-display-profile-provider.js';

test('runResumePageComposer should return null and expose debug detail when gateway is not configured', async () => {
  const previousUrl = process.env.OPENCLAW_GATEWAY_URL;
  const previousToken = process.env.OPENCLAW_GATEWAY_TOKEN;
  delete process.env.OPENCLAW_GATEWAY_URL;
  delete process.env.OPENCLAW_GATEWAY_TOKEN;

  const documents: ParsedDocument[] = [
    {
      path: 'storage/files/uploads/resume-a.docx',
      name: 'resume-a.docx',
      ext: '.docx',
      title: '\u5019\u9009\u4ebaA\u7b80\u5386',
      category: 'resume',
      bizCategory: 'general',
      parseStatus: 'parsed',
      summary: '\u5019\u9009\u4ebaA\u66fe\u53c2\u4e0e\u667a\u80fd\u56ed\u533a\u4ea7\u54c1\u4ea4\u4ed8\u3002',
      excerpt: '\u5019\u9009\u4ebaA\u4ea7\u54c1\u7ecf\u9a8c\u7a33\u5b9a\u3002',
      extractedChars: 2048,
      schemaType: 'resume',
      structuredProfile: {
        candidateName: '\u5019\u9009\u4ebaA',
        latestCompany: '\u5e7f\u5dde\u963f\u51e1\u63d0\u7535\u5b50\u79d1\u6280\u6709\u9650\u516c\u53f8',
        projectHighlights: ['\u667a\u80fd\u56ed\u533a\u7ba1\u7406\u5e73\u53f0'],
        skills: ['\u4ea7\u54c1\u8bbe\u8ba1'],
      },
    },
  ];

  const displayProfiles: ResumeDisplayProfile[] = [
    {
      sourcePath: 'storage/files/uploads/resume-a.docx',
      sourceName: 'resume-a.docx',
      displayName: '\u5019\u9009\u4ebaA',
      displayCompany: '\u5e7f\u5dde\u963f\u51e1\u63d0\u7535\u5b50\u79d1\u6280\u6709\u9650\u516c\u53f8',
      displayProjects: ['\u667a\u80fd\u56ed\u533a\u7ba1\u7406\u5e73\u53f0'],
      displaySkills: ['\u4ea7\u54c1\u8bbe\u8ba1'],
      displaySummary: '\u9002\u5408\u7528\u4e8e\u5ba2\u6237\u6c47\u62a5\u578b\u4eba\u624d\u5c55\u793a\u3002',
    },
  ];

  try {
    const composerInput = {
      requestText: '\u8bf7\u751f\u6210\u4e00\u9875\u7b80\u5386\u5ba2\u6237\u6c47\u62a5\u9759\u6001\u9875',
      documents,
      displayProfiles,
      envelope: {
        title: '\u7b80\u5386\u5ba2\u6237\u6c47\u62a5\u9759\u6001\u9875',
        fixedStructure: [],
        variableZones: [],
        outputHint: '\u751f\u6210\u9002\u5408\u5ba2\u6237\u6c47\u62a5\u7684\u53ef\u89c6\u5316\u9875\u9762',
        pageSections: [
          '\u5ba2\u6237\u6982\u89c8',
          '\u4ee3\u8868\u5019\u9009\u4eba',
          '\u4ee3\u8868\u9879\u76ee',
          '\u6280\u80fd\u8986\u76d6',
          '\u5339\u914d\u5efa\u8bae',
          'AI\u7efc\u5408\u5206\u6790',
        ],
      },
      reportPlan: null,
    };

    const result = await runResumePageComposer(composerInput);
    assert.equal(result, null);

    const detailed = await runResumePageComposerDetailed(composerInput);
    assert.equal(detailed.content, null);
    assert.equal(detailed.attemptMode, '');
    assert.deepEqual(detailed.attemptedModes, []);
    assert.match(detailed.error, /gateway/i);
  } finally {
    if (previousUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
    else process.env.OPENCLAW_GATEWAY_URL = previousUrl;

    if (previousToken === undefined) delete process.env.OPENCLAW_GATEWAY_TOKEN;
    else process.env.OPENCLAW_GATEWAY_TOKEN = previousToken;
  }
});
