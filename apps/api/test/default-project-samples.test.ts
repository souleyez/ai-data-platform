import test from 'node:test';
import assert from 'node:assert/strict';
import { getDefaultProjectSampleOutputs } from '../src/lib/default-project-samples.js';

test('default project samples should keep three premium order cockpit pages', () => {
  const outputs = getDefaultProjectSampleOutputs();
  const orderPages = outputs.filter((item) => (
    item.groupLabel === '订单分析' && item.kind === 'page'
  ));

  const titles = orderPages.map((item) => item.title);
  assert.ok(titles.includes('[系统样例] 订单经营静态页'));
  assert.ok(titles.includes('[系统样例] 库存与补货驾驶舱'));
  assert.ok(titles.includes('[系统样例] SKU与品类结构页'));

  for (const item of orderPages) {
    assert.ok((item.page?.cards || []).length >= 5, `${item.title} should keep a premium card shell`);
    assert.ok((item.page?.charts || []).length >= 4, `${item.title} should keep a premium chart shell`);
    assert.ok((item.page?.sections || []).length >= 6, `${item.title} should keep a structured section shell`);
  }
});
