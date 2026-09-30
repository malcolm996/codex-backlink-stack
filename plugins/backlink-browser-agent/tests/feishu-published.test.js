import test from 'node:test';
import assert from 'node:assert/strict';
import { syncPublishedBacklinksFeishu } from '../bridge/server.js';

function fakeFeishu() {
  const state = { files: new Map(), values: [] };
  return {
    state,
    async ensureFolder(name) { return { folder: { name, token: 'folder-token' }, created: false }; },
    async findFileByName(name) { return state.files.get(name) || null; },
    async createSpreadsheet({ title }) {
      const file = { name: title, token: 'spreadsheet-token', spreadsheet_token: 'spreadsheet-token', url: 'https://feishu.local/' + encodeURIComponent(title) };
      state.files.set(title, file);
      return file;
    },
    async listSheets() { return { sheets: [{ sheet_id: 'sheet-id', title: 'Sheet1' }] }; },
    async updateSheet(_token, _id, { title }) { return { sheet_id: 'sheet-id', title }; },
    async createSheet(_token, { title }) { return { sheet_id: 'sheet-id', title }; },
    async readValues() { return { valueRange: { values: state.values } }; },
    async updateValues(_token, range, values) {
      if (range.includes('!A1:Z')) return {};
      state.values = values;
      return {};
    }
  };
}

test('published sync creates a product-url spreadsheet and updates rows idempotently', async function() {
  const feishu = fakeFeishu();
  const first = await syncPublishedBacklinksFeishu({
    feishu,
    productUrl: 'https://example.com',
    records: [{ sourceUrl: 'https://source.example/post', targetUrl: 'https://example.com/tool', submittedAt: '2026-09-30T10:00:00Z', status: 'pending_review' }]
  });
  assert.equal(first.spreadsheet.name, 'https://example.com/');
  assert.equal(first.created, 1);
  assert.equal(first.updated, 0);
  assert.equal(first.rows, 1);
  assert.equal(feishu.state.values[0][10], '回访是否发布成功');
  assert.equal(feishu.state.values[1][10], '待回访');

  const second = await syncPublishedBacklinksFeishu({
    feishu,
    productUrl: 'https://example.com/',
    records: [{ sourceUrl: 'https://SOURCE.example/post/#reply', revisitAt: '2026-10-01T10:00:00Z', revisitPublishedSuccess: true, revisitEvidenceUrl: 'https://source.example/post#reply' }]
  });
  assert.equal(second.spreadsheet.reused, true);
  assert.equal(second.created, 0);
  assert.equal(second.updated, 1);
  assert.equal(second.rows, 1);
  assert.equal(feishu.state.values.length, 2);
  assert.equal(feishu.state.values[1][10], '是');
  assert.equal(feishu.state.values[1][11], 'https://source.example/post#reply');
});
