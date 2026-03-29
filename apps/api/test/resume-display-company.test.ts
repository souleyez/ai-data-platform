import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractResumeDisplayCompaniesFromText,
  sanitizeResumeDisplayCompany,
  selectResumeDisplayCompany,
} from '../src/lib/resume-display-company.js';

test('sanitizeResumeDisplayCompany should reject noisy fragments and keep enterprise labels', () => {
  assert.equal(sanitizeResumeDisplayCompany('至今深圳达实智能股份有限公司'), '深圳达实智能股份有限公司');
  assert.equal(sanitizeResumeDisplayCompany('广州汇聚智能科技'), '广州汇聚智能科技');
  assert.equal(sanitizeResumeDisplayCompany('创立了一个集成人工智能'), '');
  assert.equal(sanitizeResumeDisplayCompany('MySQL/Redis数据'), '');
  assert.equal(sanitizeResumeDisplayCompany('三维可视化及BIM运维等信息'), '');
});

test('extractResumeDisplayCompaniesFromText should recover enterprise labels from noisy summaries', () => {
  const companies = extractResumeDisplayCompaniesFromText(
    '王磊，10年经验，先后服务于川渝MBA企业家联合会及西南校友经济研究院、广州汇聚智能科技，后加入深圳达实智能股份有限公司。',
  );

  assert.deepEqual(companies, ['广州汇聚智能科技', '深圳达实智能股份有限公司']);
});

test('selectResumeDisplayCompany should prefer direct enterprise label before extracted fallback', () => {
  assert.equal(
    selectResumeDisplayCompany([
      '川渝MBA企业家联合会及西南校友经济研究院',
      '王磊，10年经验，后加入广州汇聚智能科技，负责智慧园区管理平台。',
    ]),
    '广州汇聚智能科技',
  );
});
