import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractResumeDisplayCompaniesFromText,
  sanitizeResumeDisplayCompany,
  selectResumeDisplayCompany,
} from '../src/lib/resume-display-company.js';

test('sanitizeResumeDisplayCompany should reject noisy fragments and keep enterprise labels', () => {
  assert.equal(
    sanitizeResumeDisplayCompany('\u5e7f\u5dde\u6c47\u805a\u667a\u80fd\u79d1\u6280'),
    '\u5e7f\u5dde\u6c47\u805a\u667a\u80fd\u79d1\u6280',
  );
  assert.equal(
    sanitizeResumeDisplayCompany('\u5e7f\u5dde\u963f\u51e1\u63d0\u7535\u5b50\u79d1\u6280\u6709\u9650\u516c\u53f8'),
    '\u5e7f\u5dde\u963f\u51e1\u63d0\u7535\u5b50\u79d1\u6280\u6709\u9650\u516c\u53f8',
  );
  assert.equal(sanitizeResumeDisplayCompany('\u521b\u7acb\u4e86\u4e00\u4e2a\u96c6\u6210\u4eba\u5de5\u667a\u80fd'), '');
  assert.equal(sanitizeResumeDisplayCompany('MySQL/Redis\u6570\u636e'), '');
  assert.equal(sanitizeResumeDisplayCompany('\u4e09\u7ef4\u53ef\u89c6\u5316\u53caBIM\u8fd0\u7ef4\u7b49\u4fe1\u606f'), '');
  assert.equal(sanitizeResumeDisplayCompany('\u5e26\u9886\u516c\u53f8'), '');
});

test('extractResumeDisplayCompaniesFromText should recover enterprise labels from noisy summaries', () => {
  const companies = extractResumeDisplayCompaniesFromText(
    '\u540e\u52a0\u5165\u5e7f\u5dde\u6c47\u805a\u667a\u80fd\u79d1\u6280\u8d1f\u8d23\u5e73\u53f0\u5efa\u8bbe\uff0c\u968f\u540e\u4efb\u804c\u4e8e\u5e7f\u5dde\u963f\u51e1\u63d0\u7535\u5b50\u79d1\u6280\u6709\u9650\u516c\u53f8\uff0c\u4e0d\u5305\u62ec\u5ddd\u6e1dMBA\u4f01\u4e1a\u5bb6\u8054\u5408\u4f1a\u53ca\u897f\u5357\u6821\u53cb\u7ecf\u6d4e\u7814\u7a76\u9662\u3002',
  );

  assert.deepEqual(companies, [
    '\u5e7f\u5dde\u6c47\u805a\u667a\u80fd\u79d1\u6280',
    '\u5e7f\u5dde\u963f\u51e1\u63d0\u7535\u5b50\u79d1\u6280\u6709\u9650\u516c\u53f8',
  ]);
});

test('selectResumeDisplayCompany should prefer direct enterprise label before extracted fallback', () => {
  assert.equal(
    selectResumeDisplayCompany([
      '\u5e7f\u5dde\u5353\u52e4\u4fe1\u606f\u6280\u672f\u6709\u9650\u516c\u53f8',
      '\u540e\u52a0\u5165\u963f\u91cc\u5df4\u5df4\u96c6\u56e2\u8d1f\u8d23\u5e73\u53f0\u5efa\u8bbe',
    ]),
    '\u5e7f\u5dde\u5353\u52e4\u4fe1\u606f\u6280\u672f\u6709\u9650\u516c\u53f8',
  );
});
