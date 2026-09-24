# Agent 网申交接

## 读取任务

用户说“投递当前岗位”时，定位已打开的秋招雷达本地页面。读取该页面 localStorage 中的 `job-pilot.agent-handoff.v1`，校验 `version`、`createdAt`、`job.company`、`job.role`、`job.officialUrl` 和 `profile`。交接不存在或岗位不符时，让用户回到工作台选择岗位并点击“准备 Agent 接管”。

只把交接用于这一次申请。岗位 URL 必须为 HTTPS，打开后域名变化时检查是否属于该公司的官方招聘系统或正常登录跳转。

## 浏览器接管

使用当前 Agent 环境提供的浏览器控制能力；不要求 `BROWSER_USE_API_KEY`。先打开岗位 URL、检查岗位仍可申请并读取表单，再按 [安全网申流程](application-workflow.md) 建立字段映射。

遇到登录、OTP、MFA、验证码或浏览器权限提示时交给用户。页面要求上传文件或最终提交时停下并单独确认。

## 完成

填写后重新读取关键字段，向用户列出已填、留空、需要选择和需要上传的项目。保持页面打开。用户确认最终提交且页面显示成功后，才把工作台进度更新为“已投递”。
