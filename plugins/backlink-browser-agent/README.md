# Backlink Browser Agent

本地优先的 Chrome MV3 扩展和 Node.js bridge。它使用用户已有的浏览器登录态采集网页/SEO 工具结果，Codex 只调用本地 bridge，不直接操作第三方后台。

## 安全边界

- bridge 只监听 `127.0.0.1`，安装脚本为每台电脑生成独立本地 token。
- 不导出 Cookie、密码、验证码、2FA、账号标识或完整认证请求。
- 不绕过 CAPTCHA、登录恢复或身份验证；需要人工处理时返回 `manual_required`。
- 扩展只在用户授权的目标站点运行，默认使用专用最小化窗口。
- `sem.3ue.co` 只由 Chrome 扩展在用户现有登录态中访问，Codex 不直接打开、点击或抓取该站点。

## 安装

要求：Node.js 20+、Google Chrome。

在本目录运行：

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\setup-local.ps1
node bridge/server.js
```

确认 `http://127.0.0.1:17831/health` 返回 `ok: true`。然后打开 `chrome://extensions/`，开启开发者模式，选择本目录下的 `extension` 加载未打包扩展。打开扩展选项，测试 bridge，并只授权实际使用的工具站点。

Windows 也可以双击 `Start-BacklinkAgent.cmd`，但首次运行前仍需执行 `setup-local.ps1`。

## 本地演示

bridge 内置演示页：`http://127.0.0.1:17831/demo/`。扩展默认配置为演示页，可用 `examples/task.demo.json` 测试任务队列。桥接 token 位于本地 `bridge/config.local.json`，扩展读取本地 `extension/generated_config.js`；这两个文件已被忽略，不能提交到 GitHub。

## 第三方 SEO 工具

在扩展选项中配置登录后的入口 URL、域名输入框、查询按钮、翻页按钮、响应 URL 特征和记录数组路径。未配置响应 URL 特征时，扩展只记录请求元数据，不读取正文。

Semrush/3UE 任务使用 provider `semrush-via-3ue`，任务模板见 `examples/task.sem3ue.json`。候选评论页可以使用 `candidate.comment.check`，或在 Semrush 任务中开启 `input.inspectCandidates`。扩展只采集页面可见的评论表单和相关公开指标，不执行评论提交。

## Feishu

复制或编辑本地 `bridge/config.local.json`，填写自己的 Feishu 自建应用凭据：

```json
{
  "feishu": {
    "enabled": true,
    "targetType": "spreadsheet",
    "appId": "",
    "appSecret": ""
  }
}
```

不要把 App Secret、token、浏览器 profile、抓包或任务结果提交到 GitHub。已发布记录通过 `POST /v1/feishu/sync-published` 写入：每个 Web 产品拥有一个以完整产品 URL 命名的独立电子表格，工作表为 `外链发布记录`，回访字段默认 `待回访`。

## 目录

- `extension/`：Chrome MV3 扩展。
- `bridge/`：零依赖 Node.js 本地服务。
- `lib/`：标准化、资格判断、Feishu 行映射。
- `schemas/`：任务和结果协议。
- `examples/`：任务模板。
- `scripts/`：本地初始化、启动和数据工具。
- `tests/`：本地自动化测试。

## 验证

```powershell
node --test tests/*.test.js
```

