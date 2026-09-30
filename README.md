# Codex Backlink Stack

用于在另一台电脑上部署这套外链工作流：

- `skills/backlink-copywriter`：根据来源文章和产品页面写评论/论坛回复，生成锚文本候选并做文案 QA。
- `skills/submit-backlinks`：候选筛选、资格判断、提交边界、公开链接验证、回访记录和飞书发布记录表流程。
- `skills/web-access`：读取和验证网页、处理动态页面、浏览器交互和登录态网页场景。
- `plugins/backlink-browser-agent`：本地 Node bridge + Chrome MV3 扩展，通过浏览器现有登录态采集 Semrush/3UE 数据，不让 Codex 直接操作第三方后台。

## 安装 Skills

在另一台电脑的 Codex 中，让 Codex 使用内置 `skill-installer` 从本仓库安装以下三个目录：

```text
skills/backlink-copywriter
skills/submit-backlinks
skills/web-access
```

也可以把本仓库克隆到本地后，将这三个目录复制到 `$CODEX_HOME/skills/`（Windows 默认通常是 `C:\Users\\<用户名>\\.codex\\skills\\`）。

## 安装本地浏览器插件

要求：Node.js 20+、Google Chrome。进入 `plugins/backlink-browser-agent` 后运行：

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\setup-local.ps1
node bridge/server.js
```

然后打开 `chrome://extensions/`，开启开发者模式，选择 `plugins/backlink-browser-agent/extension` 加载未打包扩展。插件选项中填写登录后的第三方工具入口、页面选择器和响应 URL 特征；只有实际需要时才授权目标站点或候选页检测。

也可以运行 `Start-BacklinkAgent.cmd` 启动本地 bridge 和独立 Chrome 配置。首次使用前仍需运行 `setup-local.ps1`。

## Feishu 配置

初始化脚本只生成本机 bridge token，不生成或上传 Feishu 凭据。复制生成的 `bridge/config.local.json`，在本机填写：

```json
{
  "feishu": {
    "enabled": true,
    "appId": "你的飞书自建应用 App ID",
    "appSecret": "你的飞书自建应用 App Secret"
  }
}
```

不要把 `bridge/config.local.json`、`extension/generated_config.js`、浏览器 profile、Cookie、抓包、任务结果或扩展私钥提交到 GitHub。

## 工作流边界

1. `web-access` 负责网页读取和证据获取。
2. `backlink-copywriter` 负责文案和锚文本候选，不判断站点是否值得投放，也不提交表单。
3. `submit-backlinks` 负责资格判断、授权后的提交流程、公开页面验证和记录。
4. browser-agent 负责本地浏览器采集与 Feishu 同步；不直接让 Codex 打开、点击或抓取 `sem.3ue.co`。
5. 每个 Web 产品的已提交外链记录写入独立 Feishu 电子表格，表名使用完整产品 URL，工作表为 `外链发布记录`；回访字段默认 `待回访`，有证据后更新为 `是` 或 `否`。

## 验证

```powershell
node --test plugins/backlink-browser-agent/tests/*.test.js
python -m unittest discover -s skills/submit-backlinks/tests -p "test_*.py"
```

