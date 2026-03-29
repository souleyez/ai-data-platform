import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalizeResumeFields,
  isWeakResumeCandidateName,
  mergeResumeFields,
} from '../src/lib/resume-canonicalizer.js';

test('canonicalizeResumeFields should clean noisy resume slots into stable page-friendly fields', () => {
  const result = canonicalizeResumeFields({
    candidateName: '建立同比',
    yearsOfExperience: '1年工作经验',
    education: '本科（计算机相关）',
    latestCompany: '广州云岚数码有限公司，运营经理，主导耳机与智能穿戴品类从0到1搭建',
    skills: [' Java ', 'MySQL / Redis', '求职意向'],
    projectHighlights: [
      '系统搭建与上线: 领导团队成功从零开始搭建并准时上线复杂的广告投放系统',
      '负责项目的全面管理，包括技术研发、市场推广和客户服务',
    ],
    highlights: ['求职意向'],
  }, {
    title: '夏天宇简历',
    sourceName: '夏天宇简历.docx',
    summary: '候选人夏天宇，求职方向产品经理，1年工作经验。',
  });

  assert.equal(result?.candidateName, '夏天宇');
  assert.equal(result?.yearsOfExperience, '1年');
  assert.equal(result?.education, '本科');
  assert.equal(result?.latestCompany, '广州云岚数码有限公司');
  assert.ok(result?.skills?.includes('Java'));
  assert.ok(result?.skills?.includes('MySQL'));
  assert.ok(result?.skills?.includes('Redis'));
  assert.ok(result?.projectHighlights?.includes('系统搭建与上线'));
  assert.ok(!(result?.projectHighlights || []).some((entry) => /负责项目的全面管理/.test(entry)));
});

test('mergeResumeFields should prefer supported deep-parse slots and keep canonical arrays', () => {
  const merged = mergeResumeFields([
    {
      candidateName: '谢泽强',
      latestCompany: '深圳达实智能股份有限公司',
      yearsOfExperience: '10年以上工作经验',
      education: '硕士研究生',
      companies: ['深圳达实智能股份有限公司'],
      projectHighlights: ['AIGC内容生成平台'],
      skills: ['Java', 'Spring Boot'],
    },
    {
      candidateName: 'RESUME',
      latestCompany: 'AIGC智能',
      companies: ['AIGC智能'],
      projectHighlights: ['负责项目的全面管理，包括技术研发和市场推广'],
      skills: ['Java', '求职意向'],
    },
  ], {
    sourceName: '谢泽强简历.pdf',
    title: '谢泽强简历',
  });

  assert.equal(merged?.candidateName, '谢泽强');
  assert.equal(merged?.latestCompany, '深圳达实智能股份有限公司');
  assert.equal(merged?.yearsOfExperience, '10+年');
  assert.equal(merged?.education, '硕士');
  assert.deepEqual(merged?.companies, ['深圳达实智能股份有限公司']);
  assert.deepEqual(merged?.projectHighlights, ['AIGC内容生成平台']);
  assert.ok(merged?.skills?.includes('Java'));
  assert.ok(merged?.skills?.includes('Spring Boot'));
  assert.ok(!(merged?.skills || []).includes('求职意向'));
});

test('canonicalizeResumeFields should reject role labels and list fragments as names, companies, projects and skills', () => {
  const result = canonicalizeResumeFields({
    candidateName: '高级运营经理',
    latestCompany: '擅长物联网平台',
    companies: ['基本信息', '中国建设银行', '三维可视化及BIM运维等信息'],
    projectHighlights: [
      '1.领导开发了物联网云平台',
      '铁 related_to 算法工程师',
      '核心能力：多平台电商经营分析、商品运营、库存管理',
      '负责医院智能化与零售信息化项目',
    ],
    skills: ['我的', '铁', '项目跟进', '需求分析'],
  }, {
    title: '曹伟煊简历',
    sourceName: '曹伟煊简历.pdf',
    summary: '曹伟煊，16年经验，中国建设银行架构师，负责物联网云平台建设。',
  });

  assert.equal(result?.candidateName, '曹伟煊');
  assert.equal(result?.latestCompany, '中国建设银行');
  assert.deepEqual(result?.companies, ['中国建设银行']);
  assert.ok((result?.projectHighlights || []).includes('物联网云平台'));
  assert.ok(!(result?.projectHighlights || []).some((entry) => /related_to|核心能力|医院智能化与零售信息化项目/.test(entry)));
  assert.ok((result?.skills || []).includes('需求分析'));
  assert.ok(!(result?.skills || []).includes('我的'));
  assert.ok(!(result?.skills || []).includes('铁'));
});
test('isWeakResumeCandidateName should treat masked honorifics and gender-only labels as weak names', () => {
  assert.equal(isWeakResumeCandidateName('\u66fe\u5148\u751f'), true);
  assert.equal(isWeakResumeCandidateName('\u7537\u6027'), true);
  assert.equal(isWeakResumeCandidateName('\u5973'), true);
  assert.equal(isWeakResumeCandidateName('\u6c42\u804c\u610f\u5411'), true);
  assert.equal(isWeakResumeCandidateName('\u5e74\u5de5\u4f5c\u7ecf'), true);
  assert.equal(isWeakResumeCandidateName('\u66fe\u6d77\u5cf0'), false);
});
