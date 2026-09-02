<div align="center">

# 秋招雷达 2027

**面向 2027 届毕业生的通用秋招岗位发现与投递工作台。**

把散落在企业招聘官网的岗位整理成可筛选、可核验、可继续行动的投递清单。

[快速开始](#-快速开始) · [完整流程](#-完整流程) · [功能介绍](#-核心功能)

</div>

![秋招雷达 2027：通用校招岗位工作台](public/job-pilot-cover-v2.png)

> 当前在线站点采用私有访问。仓库本身不包含个人简历、账号凭据或真实投递记录。

## 🧭 什么是秋招雷达？

秋招雷达是一个轻量的通用校招岗位工作台，把岗位名称、公司类型、所属行业、工作地点（Base）、任职要求和官方投递地址放到统一界面中。项目不限制岗位方向；当前示例数据以**前端开发与全栈开发**为主，是因为维护者个人主要关注这两个方向，后续会逐步扩展产品、设计、测试、数据、算法、后端和其他校招岗位。

它不做未经确认的“自动海投”。涉及登录招聘网站、填写个人资料、上传简历和最终提交时，始终由使用者确认。

仓库不内置真实岗位，也不把用户的岗位或投递记录保存在源码中。Agent 核验后的结果通过工作台 API 写入当前用户的数据库，打开工作台即可查看。岗位状态可能随时变化，请始终以企业招聘官网为准。

## 🚀 快速开始

环境要求：Node.js 22.13 或更高版本，以及 Codex、Claude Code 等支持 Agent Skills 的编程 Agent。

```bash
git clone https://github.com/qiulingzhu809-sudo/job-pilot-2027.git
cd job-pilot-2027
npm install
npm run setup:agent
```

`setup:agent` 会把秋招雷达 Skill 安装到当前项目，并安装 Browser Use 官方 Skill 与实际控制 Chrome 所需的 Browser Harness CLI。完成后回到 Agent 对话，直接说：

```text
运行秋招雷达
```

不需要先打开网页，也不需要复制提示词或粘贴 JSON。Agent 会继续完成后面的步骤。

## 🔁 完整流程

1. Agent 询问毕业届别、重点岗位方向、期望 Base、行业偏好和排除项。
2. Agent 使用 Browser Use 先建立公司池，再逐家公司核验招聘官网。
3. Agent 启动本地工作台，将通过核验的岗位提交到 `/api/jobs`，由数据库按官方网址去重。
4. Agent 确认页面已经读到结果并打开本地工作台；若当前环境不能代为打开，会明确给出完整地址。
5. 用户在工作台筛选岗位、查看评分并打开官方岗位页。
6. 决定申请后，在 Agent 对话里说“帮我投递当前选择的岗位”。Agent 会读取官网表单，先展示字段映射，再逐级确认填写、上传和最终提交。

## ✨ 核心功能

### 🔎 聚合岗位检索

按公司、岗位名称或技术栈搜索，并按 Base 和开发方向快速筛选，减少在多个招聘网站之间来回切换。

### 🏢 补全公司与行业信息

除职位名称外，同时展示公司类型、行业方向、工作地点和关键技术标签，方便比较不同机会。

### 🧭 投递行动台

选中岗位即可查看建议流程：核验最新 JD、匹配简历材料、协助填写与提交前检查，并可直接打开官方投递页面。

### 🤖 Browser Use 协作入口

仓库附带 [`campus-job-radar`](skills/campus-job-radar/SKILL.md)、`AGENTS.md` 和 `CLAUDE.md`。Agent 进入仓库后能够发现完整流程，并调用由安装脚本加入的 [Browser Use 官方 Skill](https://www.skills.sh/browser-use/browser-use/browser-use)。用户只需表达目标，Agent 负责询问、检索、写回和打开工作台。

### 💾 可扩展的数据层

项目已经接入 Cloudflare D1，提供 Agent 岗位导入、去重更新和投递进度 API。

## 🧱 技术栈

- React 19 + TypeScript
- Next.js App Router 兼容开发体验
- vinext + Vite
- Cloudflare Workers / D1
- Drizzle ORM
- Tailwind CSS 4
- ChatGPT Sites 身份认证与托管

## 🧰 只运行网页

环境要求：Node.js 22.13 或更高版本。

```bash
git clone https://github.com/qiulingzhu809-sudo/job-pilot-2027.git
cd job-pilot-2027
npm install
npm run dev
```

打开 `http://localhost:3000`。本地 Sites 登录用户默认为 `seedy@sites.test`。

### 数据库迁移

修改 `db/schema.ts` 后生成迁移：

```bash
npm run db:generate
```

迁移文件会写入 `drizzle/`，应与代码一并提交。

### 构建与检查

```bash
npm run lint
npm run build
```

## 📁 项目结构

```text
app/
├── api/jobs/route.ts       # Agent 岗位导入与查询 API
├── api/progress/route.ts   # 投递进度 API
├── chatgpt-auth.ts         # ChatGPT 登录辅助函数
├── globals.css             # 全局视觉样式
├── layout.tsx              # 元数据与页面布局
└── page.tsx                # 岗位库与投递行动台
db/
├── index.ts                # D1 / Drizzle 客户端
└── schema.ts               # 投递进度与搜索请求模型
drizzle/                    # SQL 迁移
public/                     # 图标与社交分享图
skills/campus-job-radar/    # Codex / Claude Code 可复用 Skill
scripts/setup-agent.mjs     # 安装项目 Skill 与 Browser Use Skill
AGENTS.md / CLAUDE.md       # Agent 自动发现的仓库入口
```

## 🗺 路线图

- [x] 支持 Agent 核验结果导入 D1 岗位库
- [x] 在页面中保存关注、准备材料、已投递、面试中等状态
- [ ] 支持简历版本和常见网申答案管理
- [x] 提供 Browser Use 发现、核验、导入与协助投递 Skill
- [ ] 增加岗位去重、失效链接检测和核验时间
- [ ] 支持 CSV / Excel 导入导出
- [ ] 增加职位匹配分析与针对性简历建议

## 🔐 隐私与安全

- 仓库不包含真实岗位数据、候选人的个人资料或投递记录。
- 请勿把招聘网站 Cookie、API Token、简历或其他敏感信息提交到 Git。
- 自动化只能协助浏览和填写；上传简历、发送消息及最终提交必须由使用者确认。
- 企业名称和商标归各自权利人所有；收录岗位不代表与相关企业存在合作或背书。

## 🤝 参与贡献

欢迎通过 Issue 补充真实可投的 2027 届岗位、报告失效链接、提出功能建议或改进界面。提交岗位时请附上企业招聘官网链接、Base、岗位方向和最近核验日期。

## 📄 License

建议以 MIT License 开源。正式公开前，请由仓库所有者确认并添加 `LICENSE` 文件。

---

<div align="center">

如果它让你的秋招少开几个标签页，就已经完成了第一阶段使命。

</div>
