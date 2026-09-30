const DEFAULT_BASE_URL = 'https://open.feishu.cn/open-apis';

function safeText(value) {
  return String(value || '').replace(/[\r\n]/g, ' ').trim();
}

export class FeishuApiError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'FeishuApiError';
    this.code = details.code ?? null;
    this.httpStatus = details.httpStatus ?? null;
    this.response = details.response ?? null;
  }
}

export class FeishuClient {
  constructor({ appId, appSecret, baseUrl = DEFAULT_BASE_URL, fetchImpl = fetch } = {}) {
    this.appId = safeText(appId);
    this.appSecret = safeText(appSecret);
    this.baseUrl = String(baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
    this.fetchImpl = fetchImpl;
    this.cachedToken = null;
  }

  configured() {
    return Boolean(this.appId && this.appSecret);
  }

  maskedAppId() {
    if (!this.appId) return null;
    return this.appId.length <= 8 ? '***' : this.appId.slice(0, 5) + '…' + this.appId.slice(-3);
  }

  async getTenantAccessToken() {
    if (!this.configured()) throw new FeishuApiError('feishu_credentials_missing');
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now() + 60_000) return this.cachedToken.value;
    const response = await this.fetchImpl(this.baseUrl + '/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ app_id: this.appId, app_secret: this.appSecret })
    });
    const payload = await this.readPayload(response);
    if (!response.ok || payload.code !== 0 || !payload.tenant_access_token) {
      throw new FeishuApiError('feishu_auth_failed:' + safeText(payload.msg || response.statusText), {
        code: payload.code,
        httpStatus: response.status,
        response: payload
      });
    }
    const expires = Math.max(60, Number(payload.expire) || 7200);
    this.cachedToken = { value: payload.tenant_access_token, expiresAt: Date.now() + expires * 1000 };
    return this.cachedToken.value;
  }

  async readPayload(response) {
    const text = await response.text();
    try { return text ? JSON.parse(text) : {}; } catch { return { msg: text.slice(0, 500) }; }
  }

  async request(path, { method = 'GET', body, headers = {} } = {}) {
    const token = await this.getTenantAccessToken();
    const response = await this.fetchImpl(this.baseUrl + path, {
      method,
      headers: Object.assign({
        authorization: 'Bearer ' + token,
        'content-type': 'application/json; charset=utf-8'
      }, headers),
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const payload = await this.readPayload(response);
    if (!response.ok || (payload.code !== undefined && payload.code !== 0)) {
      throw new FeishuApiError('feishu_api_failed:' + safeText(payload.msg || response.statusText), {
        code: payload.code,
        httpStatus: response.status,
        response: payload
      });
    }
    return payload.data || payload;
  }

  async createSpreadsheet({ title = 'Backlink Research Queue', folderToken = null } = {}) {
    const body = { title: safeText(title).slice(0, 255) || 'Backlink Research Queue' };
    if (folderToken) body.folder_token = safeText(folderToken);
    const data = await this.request('/sheets/v3/spreadsheets', { method: 'POST', body });
    return data.spreadsheet || data;
  }

  async listFiles({ folderToken = '', pageSize = 200 } = {}) {
    const params = new URLSearchParams({ page_size: String(Math.min(200, Math.max(1, Number(pageSize) || 200))) });
    if (folderToken) params.set('folder_token', safeText(folderToken));
    return this.request('/drive/v1/files?' + params.toString());
  }

  async findFileByName(name, { folderToken = '' } = {}) {
    const data = await this.listFiles({ folderToken });
    const files = Array.isArray(data.files) ? data.files : [];
    return files.find(file => file && file.name === name) || null;
  }

  async createFolder({ name, folderToken = '' } = {}) {
    const body = { name: safeText(name).slice(0, 255), folder_token: safeText(folderToken) };
    return this.request('/drive/v1/files/create_folder', { method: 'POST', body });
  }

  async ensureFolder(name, { parentToken = '' } = {}) {
    const existing = await this.findFileByName(name, { folderToken: parentToken });
    if (existing) return { folder: existing, created: false };
    const created = await this.createFolder({ name, folderToken: parentToken });
    return { folder: created.file || created, created: true };
  }

  async listSheets(spreadsheetToken) {
    if (!spreadsheetToken) throw new FeishuApiError('spreadsheet_token_required');
    return this.request('/sheets/v3/spreadsheets/' + encodeURIComponent(spreadsheetToken) + '/sheets/query');
  }

  async createSheet(spreadsheetToken, { title, index = null } = {}) {
    if (!spreadsheetToken) throw new FeishuApiError('spreadsheet_token_required');
    const properties = { title: safeText(title).slice(0, 100) || 'Sheet' };
    if (index !== null && index !== undefined) properties.index = Math.max(0, Number(index) || 0);
    const data = await this.request('/sheets/v3/spreadsheets/' + encodeURIComponent(spreadsheetToken) + '/sheets', {
      method: 'POST',
      body: properties
    });
    return data.sheet || data;
  }

  async updateSheet(spreadsheetToken, sheetId, { title } = {}) {
    if (!spreadsheetToken) throw new FeishuApiError('spreadsheet_token_required');
    if (!sheetId) throw new FeishuApiError('sheet_id_required');
    const body = {};
    if (title !== undefined) body.title = safeText(title).slice(0, 100);
    return this.request('/sheets/v3/spreadsheets/' + encodeURIComponent(spreadsheetToken) + '/sheets/' + encodeURIComponent(sheetId), {
      method: 'PATCH',
      body
    });
  }

  async deleteSheet(spreadsheetToken, sheetId) {
    if (!spreadsheetToken) throw new FeishuApiError('spreadsheet_token_required');
    if (!sheetId) throw new FeishuApiError('sheet_id_required');
    return this.request('/sheets/v3/spreadsheets/' + encodeURIComponent(spreadsheetToken) + '/sheets/' + encodeURIComponent(sheetId), {
      method: 'DELETE'
    });
  }

  async appendValues(spreadsheetToken, range, values) {
    if (!spreadsheetToken) throw new FeishuApiError('spreadsheet_token_required');
    if (!range) throw new FeishuApiError('spreadsheet_range_required');
    if (!Array.isArray(values)) throw new FeishuApiError('spreadsheet_values_required');
    return this.request('/sheets/v2/spreadsheets/' + encodeURIComponent(spreadsheetToken) + '/values_append', {
      method: 'POST',
      body: { valueRange: { range, values } }
    });
  }

  async updateValues(spreadsheetToken, range, values) {
    if (!spreadsheetToken) throw new FeishuApiError('spreadsheet_token_required');
    if (!range) throw new FeishuApiError('spreadsheet_range_required');
    if (!Array.isArray(values)) throw new FeishuApiError('spreadsheet_values_required');
    return this.request('/sheets/v2/spreadsheets/' + encodeURIComponent(spreadsheetToken) + '/values', {
      method: 'PUT',
      body: { valueRange: { range, values } }
    });
  }

  async readValues(spreadsheetToken, range) {
    if (!spreadsheetToken) throw new FeishuApiError('spreadsheet_token_required');
    if (!range) throw new FeishuApiError('spreadsheet_range_required');
    return this.request('/sheets/v2/spreadsheets/' + encodeURIComponent(spreadsheetToken) + '/values/' + encodeURIComponent(range), {
      method: 'GET'
    });
  }

  async clearValues(spreadsheetToken, ranges) {
    if (!spreadsheetToken) throw new FeishuApiError('spreadsheet_token_required');
    const list = Array.isArray(ranges) ? ranges : [ranges];
    if (!list.length || list.some(range => !range)) throw new FeishuApiError('spreadsheet_ranges_required');
    return this.request('/sheets/v2/spreadsheets/' + encodeURIComponent(spreadsheetToken) + '/values_batch_clear', {
      method: 'POST',
      body: { ranges: list }
    });
  }

  async createBitable({ name = 'Backlink Research Queue', folderToken = null, timeZone = null } = {}) {
    const body = { name: safeText(name).slice(0, 255) || 'Backlink Research Queue' };
    if (folderToken) body.folder_token = safeText(folderToken);
    if (timeZone) body.time_zone = safeText(timeZone);
    const data = await this.request('/bitable/v1/apps', { method: 'POST', body });
    return data.app || data;
  }

  async createBitableTable(appToken, { name = 'Backlinks' } = {}) {
    if (!appToken) throw new FeishuApiError('bitable_app_token_required');
    const data = await this.request('/bitable/v1/apps/' + encodeURIComponent(appToken) + '/tables', {
      method: 'POST',
      body: { table: { name: safeText(name).slice(0, 255) || 'Backlinks' } }
    });
    return data.table || data;
  }
}
