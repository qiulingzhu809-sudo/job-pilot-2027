# 秋招雷达本地文件检索方案

> 状态：方案讨论稿 v0.2
>
> 日期：2026-09-07
> 目标：岗位量多、范围广、检索快，并让 clone 项目的普通用户无需配置数据库即可查看结果。

## 1. 产品结论

默认形态改为 **本地文件优先的岗位索引器**：

```text
结构化来源 / ATS / 聚合数据
              ↓
       并发采集与标准化
              ↓
     runtime/jobs.jsonl     完整事实记录
     runtime/jobs.json      网页读取快照
     runtime/report.txt     人类可读简报
              ↓
        本地秋招雷达网页
```

数据库不再是运行前提。首版使用 JSONL 保存长期记录、JSON 保存当前快照、Text 保存本轮摘要；后续需要多人、复杂查询或云端定时任务时，再换成 SQLite/D1 Adapter。

所有 `runtime/` 文件默认加入 `.gitignore`。仓库只提交采集器、网页、Skill、配置示例和数据 Schema，不提交用户岗位、偏好、简历或投递记录。

## 2. 参考项目中要吸收的做法

- Jasmine job-radar：快源/慢源分层、来源健康、异常空结果保护。
- JobSpy：HTTP 并发获取多个招聘平台，不启动浏览器。
- Job-Postings：ATS Adapter、按外部岗位 ID 增量更新、只有成功扫描后才判断下线。
- jobslop：从 VC/生态招聘板发现长尾公司，旧岗位占比过高时提前停止分页。
- Simplify / xixicc2027：Agent 消费预生成数据并立即打开页面，而不是让用户等待现场全量生产。

## 3. 用户体验

用户只需要：

```bash
git clone <repo>
cd job-pilot-2027
npm install
npm run radar
```

`npm run radar` 的可见行为：

1. 1–3 秒内启动网页并展示上一次结果；首次运行显示采集进度。
2. 后台启动 Fast Scan，逐批把结果原子写入本地文件。
3. 网页通过轮询或 SSE 显示新增数量、来源状态和更新时间。
4. Fast Scan 到达 2–5 分钟预算后结束；没有完成的来源保存游标。
5. Slow Scan 由 `npm run radar:deep` 或定时任务执行，不阻塞正常使用。
6. 用户选中岗位准备申请时，才调用 Browser Use 重新打开官网并协助填写。

Agent 场景仍支持一句话“运行秋招雷达”，但 Agent 只调用确定性的 CLI 并解释结果，不亲自逐页采集。

## 4. 来源策略：数量与长尾覆盖

### 4.1 Fast Lane

目标 2–5 分钟，默认并发 8 个来源：

1. 可信 GitHub 校招聚合 JSON。
2. 国家大学生就业服务平台、国聘公开专题。
3. 高校就业网公开 JSON/SSR HTML。
4. Moka、北森、飞书、Workday、Greenhouse、Lever、Ashby 等已识别 ATS 接口。
5. 可用的行业、产业园、投资机构生态招聘板。
6. JobSpy 作为通用招聘站补充来源，并明确中国校招覆盖有限。

### 4.2 Slow Lane

每天低频或手动执行：

- 牛客、实习僧等动态或限流来源；
- 必须执行 JavaScript 的 SPA；
- 需要用户登录的官网；
- 公众号独占线索；
- Fast Lane 无法确认的高分候选。

每个慢源都有页数、候选数和时间预算，超时就保存游标，不拖慢整轮。

### 4.3 避免无限公司名单

公司池从系统级目录增量生长：

```text
高校招聘会 / 国聘专题 / 专精特新目录 / 投资机构生态板
                         ↓
                       公司实体
                         ↓
                官网域名与 ATS tenant
                         ↓
                    后续直接扫描 ATS
```

只维护公司与 ATS 的映射资产，不维护“应该搜索哪些大厂”的人工排名。调度器按行业、城市、规模和来源覆盖缺口选择下一批来源。

## 5. 深模块与 Interface

### 5.1 Radar Module

唯一面向 CLI、Agent 和网页的主 Interface：

```ts
type RadarMode = 'quick' | 'deep' | 'verify';

interface Radar {
  run(input: SearchProfile, mode: RadarMode): Promise<RunSummary>;
  readSnapshot(): Promise<JobSnapshot>;
}
```

调用者不需要知道分页、来源限速、ATS 差异、缓存或文件锁。

### 5.2 Source Adapter Seam

```ts
interface SourceAdapter {
  collect(context: CollectContext): Promise<CollectResult>;
}
```

所有 Adapter 统一返回候选岗位、下一游标、来源状态和耗时。单源异常只进入 `errors`，不终止其他来源。

### 5.3 Store Adapter Seam

```ts
interface JobStore {
  loadIndex(): Promise<JobIndex>;
  commit(batch: NormalizedBatch): Promise<CommitResult>;
  writeRun(run: RunSummary): Promise<void>;
}
```

首个 Adapter 是 `LocalFileJobStore`；未来可增加 `SQLiteJobStore`、`D1JobStore`，Radar Module 不需要修改。

## 6. 本地文件设计

```text
runtime/
├── jobs.jsonl             # 每行一个规范岗位，适合追加、流处理和恢复
├── jobs.json              # 当前 active 快照，网页一次读取
├── report.txt             # 本轮人类可读摘要
├── applications.json      # 个人投递进度
├── sources.json           # 来源、游标、健康度和最近成功时间
├── runs/
│   └── 2026-09-07T...json # 每轮统计与错误
└── .lock                  # 防止两个采集进程同时提交
```

### 6.1 `jobs.jsonl`

保存规范事实记录，推荐字段：

```json
{"id":"moka:ztgame:d5a88","company":"巨人网络","role":"游戏客户端开发工程师","base":["上海"],"track":"客户端开发","graduationYear":2027,"officialUrl":"https://...","source":"moka","externalId":"d5a88","status":"open","firstSeenAt":"2026-09-07T10:00:00+08:00","lastSeenAt":"2026-09-07T10:00:00+08:00","verifiedAt":"2026-09-07T10:00:00+08:00","tags":["C++","C#","Unity3D"]}
```

### 6.2 `jobs.json`

由索引器生成，不作为人工编辑源：

```json
{
  "generatedAt": "2026-09-07T10:05:00+08:00",
  "total": 386,
  "jobs": [],
  "facets": {"industry": {}, "base": {}, "track": {}, "companyType": {}},
  "sourceHealth": []
}
```

网页只读这个快照即可完成搜索、筛选和统计，不需要数据库查询。

### 6.3 `report.txt`

用于终端、Agent 和不想打开网页的用户：

```text
秋招雷达 · 2026-09-07 10:05
扫描来源 12：成功 10，部分成功 1，失败 1
新增 84，更新 31，疑似关闭 5，当前可投 386
覆盖公司 217：互联网 61，AI/工具 38，游戏 22，硬件 41……
高匹配新增：中新赛克/全栈开发、万兴科技/AI应用开发……
详细结果：http://localhost:3000
```

## 7. 去重、增量与失效

强身份顺序：

1. `source + externalId`；
2. ATS requisition ID；
3. 规范化官方 URL；
4. `公司 + 规范岗位名 + Base + 批次`。

采集前加载现有 ID/URL 为内存 Set。新页面连续两页超过 80% 是已知记录时提前结束。详情采用懒加载：标题、届别和地点明显不匹配时不请求详情。

来源失败、返回 0 或数量跌到历史峰值 20% 以下时，不关闭旧岗位。只有来源成功扫描且岗位连续两轮消失，或官方详情明确返回关闭/404，才标记 `closed`。

## 8. 性能预算

| 阶段 | 预算 | 策略 |
| --- | ---: | --- |
| 打开工作台 | 1–3 秒 | 读取上次 `jobs.json` |
| Fast Scan | 2–5 分钟 | HTTP 并发 8，来源失败隔离 |
| 单个 Fast 来源 | 30 秒 | 超时保存错误和游标 |
| Slow Scan | 最多 15 分钟 | 后台运行，Browser Use 有界使用 |
| 投递前核验 | 单岗位 10–60 秒 | 只打开用户选择的官网 |

一次 Fast Scan 的目标不是“遍历互联网”，而是在固定预算内返回数百条结构化候选，并可在后续轮次继续扩展。

## 9. 网页读取方式

推荐保留现有 Next/Vite 页面，但移除 D1 强依赖：

- 开发服务器提供 `GET /api/snapshot`，内部读取 `runtime/jobs.json`。
- `GET /api/runs/latest` 读取最近一次运行状态。
- `POST /api/applications` 原子更新 `runtime/applications.json`。
- 所有写入先落临时文件，再 `rename` 替换，避免网页读到半截 JSON。
- 纯静态模式可直接生成 `runtime/index.html`，双击打开；但正常模式使用本地服务器，避免浏览器 `file://` 跨域限制。

## 10. CLI

```text
npm run radar                 # 启动网页 + 后台 quick scan
npm run radar:quick           # 仅快速扫描
npm run radar:deep            # 慢源补全
npm run radar:verify -- <id>  # 投递前官网核验
npm run radar:report          # 重新生成 JSON 快照和 Text 报告
```

建议底层实现一个稳定命令：

```text
job-pilot scan --mode quick --profile runtime/profile.json --budget 180s
```

Skill 只负责收集偏好、调用命令、打开网页和处理需要人工接管的浏览器任务。

## 11. 分阶段落地

### Phase 1：本地文件 MVP

- 增加 `LocalFileJobStore`、JSON Schema、原子写入和 `.gitignore`。
- 将现有 D1 数据导出为 `runtime/jobs.jsonl`；D1 保留为可选 Adapter。
- 页面改读 `/api/snapshot`，投递状态写 `applications.json`。
- 增加 `npm run radar`，首先打开旧快照，再启动扫描。

### Phase 2：快速结构化采集

- 实现 GitHub 聚合 JSON、高校服务端页面和 2–3 种 ATS Adapter。
- 并发、超时、游标、来源健康和增量提前停止。
- 输出 `jobs.json`、`report.txt` 和运行报告。

### Phase 3：长尾与慢源

- 接入系统级公司目录、产业/投资生态招聘板。
- Slow Lane 加入动态招聘平台与登录后来源。
- Browser Use 只处理失败队列、高分复核和申请表。

## 12. 验收标准

- 全新 clone 不配置数据库即可运行。
- 有历史快照时 3 秒内看到岗位；首次运行 30 秒内看到第一批结果。
- Quick Scan 在 5 分钟内结束或保存游标，单源失败不阻塞。
- 同一批输入重复执行不会产生重复岗位。
- 断电或中断不会破坏 `jobs.json/jsonl`。
- 岗位与投递数据不会出现在 `git status`。
- Browser Use 不出现在 Fast Lane，只用于明确的慢源或投递动作。

## 13. 推荐决策

正式采用 **Local-first + File-first + Adapter-based**：

- 默认存储：JSONL + JSON + Text。
- 默认采集：HTTP/API 并发与增量。
- 默认体验：先开网页、后台刷新、流式展示。
- 可选存储：SQLite/D1。
- Browser Use：慢源兜底、投递前核验、网申填写。

这个方案对个人用户最轻，对开源用户最容易复现，也为后续托管版保留了清晰的 Store Adapter seam。
