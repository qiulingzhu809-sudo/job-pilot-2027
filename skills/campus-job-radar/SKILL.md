---
name: campus-job-radar
description: 维护秋招雷达工作台、岗位数据、网申资料或本地 Browser Harness；未知招聘网站需要接管时读取本地交接并控制浏览器。
---

# 秋招雷达

工作台管理岗位、标准资料和投递进度；本地 Browser Harness 对已支持招聘系统执行确定性填写，Codex、Claude Code 等外部 Agent 只接管未知网站。

## 本地运行

1. 首次运行 `npm run setup`，安装 Harness 依赖和 Chromium。
2. 运行 `npm run dev:all`，确认网页和 `http://127.0.0.1:8765/health` 可访问。
3. 用户点击“智能填写”后，Harness 打开官网；登录或验证码由用户完成，再点击“我已登录，继续填写”。
4. Harness 返回 `unsupported` 时，读取 [Agent 网申交接](references/agent-handoff.md) 接管。

完成标准：浏览器停在提交前，页面填写内容已经复核，缺项和用户仍需完成的动作已列出。

## 岗位数据

仓库不以实时 Agent 搜索作为岗位数据源。刷新岗位时运行已配置的定时采集或导入任务；数据源尚未实现时明确说明，不退回无边界的搜索引擎穷举。写入前读取 [结果数据契约](references/result-schema.md)。

## Agent 网申

修改 Harness、投递按钮或安全闸门时，读取 [Browser Harness](references/browser-harness.md) 和 [安全网申流程](references/application-workflow.md)；接管未知网站时再读取 [Agent 网申交接](references/agent-handoff.md)。保持这些不变量：

- 当前岗位与标准资料只保存在当前浏览器；
- Harness 或 Agent 只打开当前岗位的官方 URL；
- 未确认的问题留空，不推测事实；
- 默认停在附件上传和最终提交之前；
- 登录、OTP、MFA 和验证码由用户接管；
- 完成后保持招聘页面打开，供用户检查。
