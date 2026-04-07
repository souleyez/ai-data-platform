import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDocumentParseFeedbackToFields,
  clearDocumentParseFeedback,
  collectDocumentParseFeedbackValues,
  getDocumentParseFeedbackSnapshot,
  type DocumentParseFeedbackStore,
} from '../src/lib/document-parse-feedback.js';

test('collectDocumentParseFeedbackValues only keeps reusable contract fields', () => {
  const values = collectDocumentParseFeedbackValues('contract', {
    title: '合同摘要',
    partyA: '广州轻工集团',
    partyB: '广州廉明建筑有限公司',
    paymentTerms: '按月结算',
    duration: '12个月',
    signDate: '2026-04-01',
    fieldDetails: {
      partyA: {
        value: '广州轻工集团',
      },
    },
  });

  assert.deepEqual(values, {
    partyA: ['广州轻工集团'],
    partyB: ['广州廉明建筑有限公司'],
    paymentTerms: ['按月结算'],
    duration: ['12个月'],
  });
});

test('applyDocumentParseFeedbackToFields fills empty contract fields only when learned values appear in text', () => {
  const feedback: DocumentParseFeedbackStore = {
    version: 1,
    updatedAt: new Date().toISOString(),
    libraries: {
      contract: {
        schemas: {
          contract: {
            fields: {
              partyA: ['广州轻工集团'],
              partyB: ['广州廉明建筑有限公司'],
              duration: ['12个月'],
            },
          },
        },
      },
    },
  };

  const result = applyDocumentParseFeedbackToFields({
    feedback,
    libraryKeys: ['contract'],
    schemaType: 'contract',
    text: '甲方：广州轻工集团。乙方：广州廉明建筑有限公司。服务期12个月。',
    fields: {
      contractNo: 'HT-2026-018',
      partyA: '',
      partyB: '',
      duration: '',
    },
  });

  assert.deepEqual(result, {
    contractNo: 'HT-2026-018',
    partyA: '广州轻工集团',
    partyB: '广州廉明建筑有限公司',
    duration: '12个月',
  });
});

test('applyDocumentParseFeedbackToFields keeps existing values and only adds matching multi-value resume hints', () => {
  const feedback: DocumentParseFeedbackStore = {
    version: 1,
    updatedAt: new Date().toISOString(),
    libraries: {
      resume: {
        schemas: {
          resume: {
            fields: {
              targetRole: ['前端工程师'],
              latestCompany: ['广州轻工集团'],
              skills: ['React', 'Python', 'Go'],
            },
          },
        },
      },
    },
  };

  const result = applyDocumentParseFeedbackToFields({
    feedback,
    libraryKeys: ['resume'],
    schemaType: 'resume',
    text: '候选人熟悉 React 与 Python，最近任职于广州轻工集团。',
    fields: {
      targetRole: '高级前端工程师',
      latestCompany: '',
      skills: [],
    },
  });

  assert.deepEqual(result, {
    targetRole: '高级前端工程师',
    latestCompany: '广州轻工集团',
    skills: ['React', 'Python'],
  });
});

test('getDocumentParseFeedbackSnapshot should aggregate visible fields and matched values', () => {
  const feedback: DocumentParseFeedbackStore = {
    version: 1,
    updatedAt: '2026-04-06T21:00:00.000Z',
    libraries: {
      contract: {
        schemas: {
          contract: {
            fields: {
              partyA: ['广州轻工集团'],
              paymentTerms: ['签约后7日内付款'],
            },
          },
        },
      },
      archive: {
        schemas: {
          contract: {
            fields: {
              partyA: ['广州轻工集团'],
              duration: ['12个月'],
            },
          },
        },
      },
    },
  };

  const snapshot = getDocumentParseFeedbackSnapshot({
    feedback,
    libraryKeys: ['contract', 'archive'],
    schemaType: 'contract',
    text: '甲方广州轻工集团，签约后7日内付款。',
  });

  assert.ok(snapshot);
  assert.equal(snapshot?.fieldCount, 3);
  assert.equal(snapshot?.matchedFieldCount, 2);
  assert.equal(snapshot?.totalValueCount, 3);
  assert.deepEqual(snapshot?.fields.find((field) => field.name === 'partyA')?.matchedValues, ['广州轻工集团']);
  assert.deepEqual(snapshot?.fields.find((field) => field.name === 'duration')?.matchedValues, []);
});

test('clearDocumentParseFeedback should remove single field and then whole schema', async () => {
  const feedback: DocumentParseFeedbackStore = {
    version: 1,
    updatedAt: new Date().toISOString(),
    libraries: {
      contract: {
        schemas: {
          contract: {
            fields: {
              partyA: ['广州轻工集团'],
              paymentTerms: ['签约后7日内付款'],
            },
          },
        },
      },
    },
  };

  const singleFieldResult = await clearDocumentParseFeedback({
    feedback,
    libraryKeys: ['contract'],
    schemaType: 'contract',
    fieldName: 'partyA',
  });

  assert.equal(singleFieldResult.changed, true);
  assert.equal(singleFieldResult.clearedFieldCount, 1);

  const clearedAllResult = await clearDocumentParseFeedback({
    feedback: {
      ...feedback,
      libraries: {
        contract: {
          schemas: {
            contract: {
              fields: {
                paymentTerms: ['签约后7日内付款'],
              },
            },
          },
        },
      },
    },
    libraryKeys: ['contract'],
    schemaType: 'contract',
  });

  assert.equal(clearedAllResult.changed, true);
});
