# 秋招雷达 Agent 入口

当用户要求初始化、运行、更新岗位或开始秋招雷达时，读取并使用 `skills/campus-job-radar/SKILL.md`。

首次运行先执行 `npm run setup:agent`，确认 Browser Use Skill 与 Browser Harness CLI 可用；CLI 不在 PATH 时使用 `uv tool run browser-harness`。再由 Skill 询问届别、岗位方向、Base、行业偏好和排除项。搜索完成后把通过官网核验的数据写入 `data/agent-jobs.json`，运行 `npm run dev`，并明确告诉用户本地网页地址。不要要求用户复制提示词或手工搬运 JSON。

用户选择岗位并要求投递时，由 Skill 使用 Browser Use 读取官方申请页；填写个人信息、上传文件和最终提交分别确认。
