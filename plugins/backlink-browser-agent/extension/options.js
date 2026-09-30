import { INSTALL_CONFIG } from './generated_config.js';

const defaults = {
  bridgeUrl: INSTALL_CONFIG.bridgeUrl || 'http://127.0.0.1:17831',
  token: INSTALL_CONFIG.token || '',
  providerEntryUrl: 'http://127.0.0.1:17831/demo/',
  inputSelector: '#domain',
  submitSelector: '#search',
  nextSelector: '#next',
  settleMs: 1200,
  maxPages: 2,
  captureUrlPatterns: ['/demo/api/backlinks'],
  recordsPath: 'data.records',
  quietMode: true,
  dedicatedWindow: true,
  captureMode: 'matched-body',
  inspectCandidates: true,
  maxCandidatePages: 20
};
const ids = ['bridgeUrl','token','providerEntryUrl','inputSelector','submitSelector','nextSelector','settleMs','maxPages','captureUrlPatterns','recordsPath','quietMode','dedicatedWindow','inspectCandidates','maxCandidatePages'];
const element = function(id) { return document.getElementById(id); };

async function load() {
  const values = Object.assign({}, defaults, await chrome.storage.local.get(defaults));
  for (const id of ids) {
    if (id === 'captureUrlPatterns') element(id).value = (values[id] || []).join('\n');
    else if (element(id).type === 'checkbox') element(id).checked = Boolean(values[id]);
    else element(id).value = values[id] == null ? '' : values[id];
  }
}

async function save() {
  const values = {};
  for (const id of ids) {
    if (id === 'captureUrlPatterns') values[id] = element(id).value.split(/\r?\n/).map(function(value) { return value.trim(); }).filter(Boolean);
    else if (element(id).type === 'checkbox') values[id] = element(id).checked;
    else if (element(id).type === 'number') values[id] = Number(element(id).value);
    else values[id] = element(id).value.trim();
  }
  values.captureMode = values.captureUrlPatterns.length ? 'matched-body' : 'metadata';
  await chrome.storage.local.set(values);
  element('status').textContent = '已保存';
}

element('save').addEventListener('click', save);
element('testBridge').addEventListener('click', async function() {
  try {
    const response = await fetch(element('bridgeUrl').value.trim() + '/health');
    const data = await response.json();
    element('status').textContent = data.ok ? '桥接服务正常' : '桥接服务响应异常';
  } catch (error) { element('status').textContent = '连接失败：' + error.message; }
});
element('grant').addEventListener('click', async function() {
  try {
    const origin = new URL(element('providerEntryUrl').value.trim()).origin;
    if (origin.startsWith('http://127.0.0.1') || origin.startsWith('http://localhost')) {
      element('status').textContent = '本地演示站已具备权限';
      return;
    }
    const granted = await chrome.permissions.request({ origins: [origin + '/*'] });
    element('status').textContent = granted ? '已授权 ' + origin : '未授权';
  } catch (error) { element('status').textContent = 'URL 无效：' + error.message; }
});
element('grantCandidates').addEventListener('click', async function() {
  try {
    const granted = await chrome.permissions.request({ origins: ['https://*/*'] });
    element('status').textContent = granted ? '已授权候选页检测' : '未授权候选页检测';
  } catch (error) { element('status').textContent = '授权失败：' + error.message; }
});
load();
