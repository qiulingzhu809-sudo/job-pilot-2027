<div align="center">

# 秋招雷达 2027

**导入岗位、管理网申资料，并启动本地浏览器辅助填写。**

把散落在企业招聘官网的岗位整理成可筛选、可核验、可继续行动的投递清单。

[快速开始](#-快速开始) · [完整流程](#-完整流程) · [功能介绍](#-核心功能)

</div>

![秋招雷达 2027：通用校招岗位工作台](public/job-pilot-cover-v2.png)

> 当前在线站点采用私有访问。仓库本身不包含个人简历、账号凭据或真实投递记录。

> 当前为开发预览版：尚未提供内置采集器和定时调度；Moka 与中新赛克已有初步适配，完整真实网申流程仍需人工检查。测试通过不代表所有招聘网站或字段都能自动填写。

## 🧭 什么是秋招雷达？

秋招雷达不是一张写死的公司名单，也不是一次性的搜索结果。它把岗位数据、个人网申资料与浏览器执行拆成三层：定时任务负责采集和更新，工作台负责筛选与记录，本地 Browser Harness 负责已支持网站的一键填写，Codex 负责未知网站兜底。

当前岗位导入接口仅接受 2027 届、状态为“可投递”的记录；其他届别和关闭状态更新尚未开放。

它不做未经确认的“自动海投”。涉及登录招聘网站、填写个人资料、上传简历和最终提交时，始终由使用者确认。

仓库不内置真实岗位，也不把用户的岗位或投递记录保存在源码中。采集任务或外部数据源通过工作台 API 写入当前用户的数据层，打开工作台即可查看。岗位状态可能随时变化，请始终以企业招聘官网为准。

## 🚀 快速开始

环境要求：Node.js 22.13 或更高版本、Python 3.12 和 [uv](https://docs.astral.sh/uv/)。未知网站需要具备浏览器控制能力的 Codex 或其他 Agent。

```bash
git clone https://github.com/qiulingzhu809-sudo/job-pilot-2027.git
cd job-pilot-2027
npm install
npm run setup
npm run dev:all
```

打开终端显示的本地网址（通常为 `http://localhost:3000`），确认 `http://127.0.0.1:8765/health` 返回 `status: ok`。首次启动没有岗位时，先按下方说明导入自己的岗位源。

1. 在“网申资料库”保存已确认的个人、联系方式和教育资料，可选择本地 PDF 简历。
2. 选择岗位，点击“智能填写”，在页面确认框中点击“确认并打开浏览器”。
3. 在 Harness 打开的 Chromium 中完成登录、验证码和岗位选择；不要在另一个普通浏览器窗口中操作。
4. 回到工作台点击“我已登录，继续填写”，确认后会读取最新保存的资料。满帮官网跳转到其 Moka 页面、新标签页的恢复已有专门处理。
5. 检查字段和未映射项，最终提交由你完成。当前实现会在已确认提供简历且发现文件控件时尝试上传，启动前请核对目标与附件。

每个任务使用独立浏览器目录，可以同时打开多个任务；登录态不跨任务共享，新任务可能需要重新登录。重启 Harness 会关闭其管理的窗口并清空内存中的任务，重启后需刷新工作台并重新启动。

## 🔁 完整流程

1. 外部采集器或人工核验从聚合平台、高校就业网、企业招聘源等渠道获取岗位线索（采集器和调度需自行配置）。
2. 数据任务清洗、去重并核验官方地址，把结果写入 `/api/jobs`。
3. 工作台读取岗位数据，用户按新鲜度、匹配度、Base 和方向筛选。
4. 用户在“网申资料库”维护通用个人、教育和求职资料。
5. 用户选择岗位并点击“智能填写”。
6. Browser Harness 对已支持网站执行规则填写；其他网站尝试通用识别，失败或缺项时由用户或外部 Agent 接管，尚无自动接管闭环。
7. 登录、验证码、附件和最终提交分别由用户确认，成功后更新投递进度。

### 从私有岗位源同步

采集器应放在独立的私有仓库，工作台只消费标准 JSON。启动工作台后，可读取本地文件：

```bash
JOB_RADAR_URL=http://localhost:3000 JOB_FEED_URL=/绝对路径/jobs.json npm run feed:sync
```

也可读取带 Bearer Token 的 HTTPS 地址：

```bash
export JOB_FEED_URL="https://你的私有存储/jobs.json"
export JOB_FEED_TOKEN="只读访问令牌"
npm run feed:sync
```

`JOB_RADAR_URL` 默认为 `http://127.0.0.1:3000`。部分环境的开发服务器只监听 IPv6 localhost，请按终端实际地址设置为 `http://localhost:3000`。令牌和数据地址只放在本机环境变量中，不提交到仓库。

## ✨ 核心功能

### 📡 持续机会雷达

界面集中展示导入数据中的最近核验、高匹配和正在推进的机会。来源轮换、定时采集和失效复核仍在规划中。

### 🏢 补全公司与行业信息

除职位名称外，同时展示公司类型、行业方向、工作地点和关键技术标签，方便比较不同机会。

### ✅ 官网证据与去重

二级渠道只提供线索，导入者需先回到官方详情页核验；API 校验字段格式，不会自动验证官网真实性。当前按用户、公司、岗位名及官方 URL 的组合去重更新。

### 🧭 投递驾驶舱

选中岗位即可查看建议流程：核验最新 JD、匹配简历材料、协助填写与提交前检查，并可直接打开官方投递页面。

### 🧭 本地 Browser Harness

项目不要求模型 API Key。Harness 只监听 `127.0.0.1`，为每个任务建立独立 Chromium Profile，并提供 Moka、中新赛克的初步适配。入口选择会跳过不可点击的重复按钮；填写支持部分基础字段、标签映射及文本写后校验。复杂教育经历、联动下拉框和站点自定义问题仍需人工处理。

点击启动后有页面内确认和加载提示；本地简历库打开超时或启动请求超时会显示错误。若页面显示“未定位到可填写控件”，不代表该字段已完成。

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
uv run --project browser-worker python -m unittest discover -s browser-worker/tests -v
```

浏览器测试需先执行 `npm run setup`，其中多任务测试会短暂打开两个 Chromium 窗口。测试覆盖基础表单、重复按钮、iframe、满帮标签页恢复和任务隔离，不等同于真实网站端到端验收。

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
scripts/sync-job-feed.mjs   # 从私有 JSON 源增量导入岗位
browser-worker/             # 无模型 API Key 的本地 Browser Harness
scripts/setup-local.mjs     # 安装 Harness 与 Chromium
scripts/start-local.mjs     # 同时启动网页与 Harness
AGENTS.md / CLAUDE.md       # Agent 自动发现的仓库入口
```

## 🗺 路线图

- [x] 支持外部采集结果导入 D1 岗位库
- [x] 在页面中保存关注、准备材料、已投递、测评、面试、Offer 等状态
- [x] 支持本地标准网申资料、完整度检查与 JSON 导入导出
- [ ] 支持多份简历版本和站点特有答案管理
- [x] 提供工作台一键启动的本地 Browser Harness
- [x] 为未知招聘网站保留 Codex / Claude Code 接管
- [x] 按公司、岗位名、官方 URL 组合去重并展示最近核验时间
- [ ] 增加定时增量扫描与失效链接复核
- [x] Moka 与中新赛克初步适配、多任务浏览器隔离
- [ ] 完善 Moka 真实表单覆盖，为 Hotjob、飞书招聘和北森增加适配器
- [ ] 支持 CSV / Excel 导入导出
- [ ] 增加职位匹配分析与针对性简历建议

## 🔐 隐私与安全

- 仓库不包含真实岗位数据、候选人的个人资料或投递记录。
- 请勿把招聘网站 Cookie、API Token、简历或其他敏感信息提交到 Git。
- 标准资料保存在当前浏览器 localStorage，PDF 保存在 IndexedDB；两者均不属于加密保险库。Harness 的上传文件和浏览器登录状态位于 `browser-worker/.runtime/`，不应提交或分享。
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
