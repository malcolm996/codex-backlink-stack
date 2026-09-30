# 给另一台 Codex 的安装提示词

将下面整段复制给另一台电脑的 Codex：

```text
请从这个 GitHub 仓库安装并配置我的外链工作流：https://github.com/malcolm996/codex-backlink-stack

需要安装的 Codex skills：
1. skills/backlink-copywriter
2. skills/submit-backlinks
3. skills/web-access

还需要配置本地插件：plugins/backlink-browser-agent。请先阅读仓库根目录 README.md 和插件 README.md，再执行：

1. 将三个 skill 安装到当前 Codex 的 skills 目录，不要修改 skill 名称。
2. 在 plugins/backlink-browser-agent 中运行 scripts/setup-local.ps1，生成本机 bridge/config.local.json 和 extension/generated_config.js。
3. 不要复制旧电脑的 Chrome profile、Cookie、token、抓包、Feishu Secret 或任何登录状态。
4. 启动本地 bridge，确认 GET http://127.0.0.1:17831/health 返回 ok=true。
5. 按 README 加载 Chrome 未打包扩展；先使用本地 demo 验证，再配置实际的第三方工具入口和选择器。
6. 如果需要 Feishu，只在本机 config.local.json 填写我提供的 App ID/Secret，不要写入 Git 或回复内容。

使用边界：
- 写评论或论坛回复时使用 $backlink-copywriter。
- 筛选、提交、公开页面验证和回访记录使用 $submit-backlinks。
- 读取动态网页、验证网页状态或需要浏览器交互时使用 $web-access。
- 不要让 Codex 直接操作 sem.3ue.co；Semrush/3UE 只通过本地 backlink-browser-agent 和 Chrome 扩展处理。
- 不要把点击提交按钮当作公开发布成功。
- 每个 Web 产品的已发布记录使用产品完整 URL命名的独立飞书电子表格，工作表为“外链发布记录”，回访是否发布成功默认“待回访”。

安装完成后，请报告：三个 skill 是否可用、bridge 健康检查结果、Chrome 扩展是否加载，以及 Feishu 是否仍待配置。不要执行真实外链提交，除非我另行明确授权。
```
