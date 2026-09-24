# GitHub 开源求职 Agent：岗位搜索实现研究

> 调研时间：2026-09-03。只引用项目仓库源码、仓库说明与仓库内配置等一手资料。这里的“活跃”按 2026 年仍有提交判断；项目成熟度差异很大，不等于生产可用。

## 先说结论

开源项目里真正可落地的岗位发现，并不是让大模型直接“搜索互联网”，而是一个确定性数据管道：

1. 用用户查询、维护的公司清单或招聘聚合站确定搜索空间；
2. 优先调用 Greenhouse、Lever、Ashby、Workday 等 ATS 的 JSON 接口；
3. 对没有稳定接口的网站才使用 JobSpy、普通 HTML/JSON-LD、Playwright 网络响应拦截和 CSS 提取；
4. 把不同来源统一成内部 Job 模型，分页、限流、失败隔离；
5. 以 URL/ATS ID 为强标识，再用“公司 + 职位 + 地点”做跨来源语义去重；
6. 将官方 ATS 详情页或接口作为最终链接与详情真源，入库后再评分、展示或投递。

对秋招雷达最值得借鉴的不是某一个“全自动 Agent”，而是 **SimplyApply 的连接器与失败隔离 + Malik job-agent 的 ATS 范围和安全边界 + ApplyPilot 的多层发现/详情补全 + JobScanner 的公司宇宙扫描**。

## 项目对照

| 项目 | 主要发现方式 | 分页/查询 | 去重与存储 | 投递与验证 | 调度 |
|---|---|---|---|---|---|
| [Pickle-Pixel/ApplyPilot](https://github.com/Pickle-Pixel/ApplyPilot) | JobSpy 聚合 5 个站；Workday CXS API；配置化直招站；Playwright 智能提取 | Workday `limit/offset`，单公司最多 25 页；查询与地点来自 YAML | SQLite；岗位 URL 唯一冲突即视为已存在 | Claude Code + Playwright MCP；可读取邮件验证码，也包含第三方 CAPTCHA 解法 | apply 阶段支持 continuous polling；CLI 可并发 worker |
| [Malik1942/job-agent](https://github.com/Malik1942/job-agent) | 6 类公开 ATS API + Adzuna；来源在配置中显式列举 | SmartRecruiters `limit/offset`；其他 board 多为全量数组 | SQLite `uid PRIMARY KEY`，另有 URL 终态去重；CSV 仅作人类日志 | Playwright；两阶段审批；IMAP 验证码三道信任门；CAPTCHA 立即交还人工 | cron/launchd 日跑脚本与 plist |
| [artbyjazi/simply-apply](https://github.com/artbyjazi/simply-apply) | Greenhouse 公司列表 + Arbeitnow 公共 API，连接器自动发现 | Greenhouse 公司并发；Arbeitnow 最多 3 页，达到 limit 提前停止 | SQLite 缓存/Upsert；公司+标题+地点跨源去重，优先官方 ATS | 不自动填表，只跳到官方 apply URL | 请求时搜索，TTL 缓存；无后台调度 |
| [jainary4/JobScanner](https://github.com/jainary4/JobScanner) | 大型 `COMPANIES` slug 清单，依次探测 Greenhouse→Lever→Ashby；可选 Adzuna | ATS board 多为一次全量；Adzuna 只取第 1 页 | 内存按公司+标题去重；输出每岗位文件夹，不是长期数据库 | 只生成材料和联系草稿，不自动提交 | 命令式单次运行，无调度 |

## 1. ApplyPilot：多层发现，再补全详情

### 数据源和发现公司

ApplyPilot 把搜索拆成三类：

- [JobSpy 发现器](https://github.com/Pickle-Pixel/ApplyPilot/blob/main/src/applypilot/discovery/jobspy.py) 调用 `python-jobspy` 的 `scrape_jobs`，覆盖 Indeed、LinkedIn、Glassdoor、ZipRecruiter、Google Jobs；搜索词、地点与过滤规则来自用户的 `searches.yaml`，而不是写死在 Agent prompt。
- [Workday 发现器](https://github.com/Pickle-Pixel/ApplyPilot/blob/main/src/applypilot/discovery/workday.py) 从 [employers.yaml](https://github.com/Pickle-Pixel/ApplyPilot/blob/main/src/applypilot/config/employers.yaml) 读取雇主 `base_url / tenant / site_id`，POST 到 Workday CXS `/wday/cxs/{tenant}/{site_id}/jobs`。这是一种“公司注册表”模型：先知道公司，再查该公司的 ATS。
- [SmartExtract](https://github.com/Pickle-Pixel/ApplyPilot/blob/main/src/applypilot/discovery/smartextract.py) 面向没有现成连接器的直招站。它用 Playwright 收集 JSON-LD、`__NEXT_DATA__`、DOM 候选卡片，并监听包含 JSON、`/api/`、Algolia 或 GraphQL 的网络响应；然后让 LLM 选择 `json_ld`、`api_response` 或 CSS selector 策略。站点入口来自 [sites.yaml](https://github.com/Pickle-Pixel/ApplyPilot/blob/main/src/applypilot/config/sites.yaml)。

这说明“发现公司”本身通常不是实时生成的：维护者先积累 Workday 雇主注册表和直招站注册表，再让程序定期遍历。对于秋招雷达，应把公司/ATS slug 当数据库资产维护，不应跟页面代码耦合。

### 查询、分页与失败处理

[workday.py](https://github.com/Pickle-Pixel/ApplyPilot/blob/main/src/applypilot/discovery/workday.py) 每页 20 条，递增 `offset`，以接口 `total` 判断结束，并设置 25 页/500 条上限；可对多个雇主并发。JobSpy 调用带瞬时错误重试，对 timeout、429、proxy、connection reset/refused 线性退避。

### 去重、官网核验与存储

[jobspy.py](https://github.com/Pickle-Pixel/ApplyPilot/blob/main/src/applypilot/discovery/jobspy.py) 优先保存 JobSpy 返回的 `job_url_direct`；[workday.py](https://github.com/Pickle-Pixel/ApplyPilot/blob/main/src/applypilot/discovery/workday.py) 则对列表中的 `externalPath` 再请求官方 Workday detail API，取完整 JD、`externalUrl`、req id 和远程类型。因此它的“官网核验”是从列表候选回到 ATS 详情接口，而不是仅相信聚合站摘要。

[database.py](https://github.com/Pickle-Pixel/ApplyPilot/blob/main/src/applypilot/database.py) 使用 SQLite。写入发现结果时 URL 是核心标识，重复插入触发 `IntegrityError` 后计为 existing；详情、评分、定制和投递状态都继续写回同一数据库。缺点是只靠 URL 会漏掉同岗位在多个来源上的重复记录，也会受跟踪参数影响。

### 投递、登录、验证码和调度

[launcher.py](https://github.com/Pickle-Pixel/ApplyPilot/blob/main/src/applypilot/apply/launcher.py) 为每个岗位启动 Claude Code 驱动浏览器，可多 worker 并发，`limit=0` 时进入 continuous 模式轮询数据库。浏览器提示编排在 [prompt.py](https://github.com/Pickle-Pixel/ApplyPilot/blob/main/src/applypilot/apply/prompt.py)：处理新标签页、普通账号登录、邮件验证码、SSO 失败、提交后确认，并支持 dry-run。

该项目还在 prompt 中接入 CapSolver 并注入 CAPTCHA token。这种做法风险高、易违反招聘平台条款，不适合秋招雷达默认实现。更稳妥的状态机是 `needs_login / needs_captcha / needs_verification / ready_for_review`，让用户接管。

## 2. Malik job-agent：公开 ATS API + 明确安全边界

### 数据源、查询和分页

该项目为每种 ATS 建一个很小的 adapter：

- [Greenhouse](https://github.com/Malik1942/job-agent/blob/main/jobagent/sources/greenhouse.py)：`boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true`
- [Lever](https://github.com/Malik1942/job-agent/blob/main/jobagent/sources/lever.py)：`api.lever.co/v0/postings/{token}?mode=json`
- [Ashby](https://github.com/Malik1942/job-agent/blob/main/jobagent/sources/ashby.py)：`api.ashbyhq.com/posting-api/job-board/{token}`
- [Workable](https://github.com/Malik1942/job-agent/blob/main/jobagent/sources/workable.py)、[Recruitee](https://github.com/Malik1942/job-agent/blob/main/jobagent/sources/recruitee.py)、[SmartRecruiters](https://github.com/Malik1942/job-agent/blob/main/jobagent/sources/smartrecruiters.py)
- [Adzuna](https://github.com/Malik1942/job-agent/blob/main/jobagent/sources/adzuna.py) 作为聚合发现源，需要 app id/key。

来源 token 由用户配置；它不做全网公司发现。SmartRecruiters adapter 是这里较完整的分页范例：`limit=100&offset=N`，累计到 `totalFound` 或 500 条上限；列表后再逐岗位请求 detail 以取得描述和 apply URL。

### 去重和存储

[pipeline.py](https://github.com/Malik1942/job-agent/blob/main/jobagent/pipeline.py) 先扫描和评分，再用 tracker 的 `seen(job.uid)` 跳过历史岗位。[tracker.py](https://github.com/Malik1942/job-agent/blob/main/jobagent/tracker.py) 建立 `applications(uid TEXT PRIMARY KEY, ...)`；同时用终态 URL 集合弥补老数据缺少 external id 导致 UID 不一致的问题。SQLite 是事实源，CSV 只是 append-only 的人类可读投递日志。

这比“每次覆盖一个 JSON”可靠：唯一键、状态迁移、历史查询和并发写入都更清楚。

### 官网核验、自动投递和验证码

候选本身直接来自公司 ATS board，因此 apply URL 已接近官网真源。投递前，[apply.py](https://github.com/Malik1942/job-agent/blob/main/jobagent/apply.py) 仍会根据来源、最低分、manual-only 公司、自动化模式和 `live_submit` 做门控；Playwright 填表代码在 [browser.py](https://github.com/Malik1942/job-agent/blob/main/jobagent/browser.py)。项目对 Ashby 明确采用 manual submit，对 LinkedIn/Indeed/Workday 等只 scan-and-rank。

[email_verify.py](https://github.com/Malik1942/job-agent/blob/main/jobagent/email_verify.py) 通过 IMAP 轮询用户自己的邮箱，但不是看到数字就填：要求 ATS 对应 sender allowlist、主题/正文 anchor、邮件时间落在本次提交窗口，调用方还会校验验证码用途；未校准就 hold。CAPTCHA 不破解，直接抛出/交还人工。

项目还实现“两阶段审批”：第一次只填表和截图，第二次用户确认后才提交，相关逻辑在 [slack_approval.py](https://github.com/Malik1942/job-agent/blob/main/jobagent/slack_approval.py)。这是秋招雷达自动投递更合理的默认交互。

### 调度

[run_daily.sh](https://github.com/Malik1942/job-agent/blob/main/scripts/run_daily.sh) 是适配 cron/launchd 的日跑入口，加载 gitignored secrets，执行 pipeline 并追加日志；[launchd plist 模板](https://github.com/Malik1942/job-agent/blob/main/scripts/templates/com.jobagent.daily.plist.template) 默认本地时间 09:00。调度和网页展示完全分离。

## 3. SimplyApply：最清晰的搜索后端骨架

### 连接器与公司发现

[Greenhouse connector](https://github.com/artbyjazi/simply-apply/blob/main/backend/app/connectors/greenhouse.py) 明确承认 Greenhouse 没有全局搜索，只能对配置中的公司 slug fan-out，并用 semaphore 限制并发。另一个 [Arbeitnow connector](https://github.com/artbyjazi/simply-apply/blob/main/backend/app/connectors/arbeitnow.py) 使用无需 key 的聚合 API。

[registry.py](https://github.com/artbyjazi/simply-apply/blob/main/backend/app/connectors/registry.py) 自动发现 connector 子类，使新增来源只需放一个文件，不必修改中央 if/else。这个边界非常适合秋招雷达：`source adapter -> normalized JobRecord`。

### 查询、分页、失败隔离与缓存

[search.py](https://github.com/artbyjazi/simply-apply/blob/main/backend/app/services/search.py) 用 `asyncio.gather(..., return_exceptions=True)` 并发所有过期连接器；单源失败写入 `sources_failed`，继续返回其他来源，并退回该源的陈旧缓存。查询维度建立 TTL cache，未过期时直接从 SQLite 按 query/location/remote 条件过滤。

Arbeitnow 没有服务端关键词过滤，因此客户端最多走 3 页，达到用户 limit 提前结束。这是一种很实用的“有界抓取”，避免每次搜索扫完整站。

### 跨来源去重和官网优先

[dedupe.py](https://github.com/artbyjazi/simply-apply/blob/main/backend/app/services/dedupe.py) 将 Unicode、公司后缀、标题括号限定词和地点归一化，以 `company + title + location` 去重。发生冲突时优先级更低数值的连接器胜出；Greenhouse 官方 ATS priority=10，聚合站 Arbeitnow priority=40，因此最终保留官方申请链接。相同优先级时保留描述更丰富的记录。

[search.py](https://github.com/artbyjazi/simply-apply/blob/main/backend/app/services/search.py) 把结果 Upsert 到数据库，再供 `/apply` 根据 job id 查找。项目不做自动填表，只把用户送到 `apply_url`，风险最低。

## 4. JobScanner：用公司清单探测 ATS

### 如何找公司和岗位

[job_sources.py](https://github.com/jainary4/JobScanner/blob/main/job_sources.py) 维护按 AI、加拿大科技、大厂、金融科技等分类的 `COMPANIES` slug 清单。对每个 slug 按 Greenhouse → Lever → Ashby 顺序试探，第一种返回岗位的 ATS 即认定成功；再追加可选 Adzuna 搜索。

这是一种便宜、容易启动的“公司宇宙”方法，但 slug 是 best guess：同名 slug 误判、公司换 ATS、多个 ATS 并存都会漏数。生产实现应把公司与已验证 ATS board 映射存库，并记录 `last_verified_at / last_success_at / failure_count`，而不是每次盲探三遍。

### 查询、过滤、去重和官网核验

它按职位关键词、职级和地点同义词过滤；ATS board 接口通常一次拿全量，Adzuna 固定取 search 第 1 页。内存去重键只是小写的 `(company, title)`，可能误合并不同城市岗位；最后最多保留 `max_candidates`。

对于用户给定的单条链接，同一文件会解析 Greenhouse/Lever/Ashby URL 中的 slug 与 job id，再调用对应官方 detail API；未知网站才退化为普通 GET + HTML 清洗。该“已知 ATS 用 API、未知页面才抓 HTML”的优先级值得保留。

### 存储、投递和调度

该项目没有长期岗位数据库；[apply.py](https://github.com/jainary4/JobScanner/blob/main/apply.py) 将 shortlist 送入便宜预筛与昂贵定制流程，每岗位写一个输出目录，包括简历、求职信、联系人草稿和事实审计报告。它不自动发送 recruiter 邮件，也不浏览器提交，没有登录/验证码/调度实现。

## 对秋招雷达的建议实现

### 推荐数据流

```text
公司目录 / 搜索任务
  -> Source adapters（官方 ATS 优先，聚合站补充）
  -> 标准化 JobCandidate
  -> 官方详情核验 / URL canonicalize
  -> 双层去重
  -> jobs 数据库 upsert
  -> 匹配评分
  -> 网页 API 查询并展示
```

Agent 负责创建搜索任务、决定扩充哪些公司、解释匹配结果；确定性的 worker 负责 HTTP、分页、重试、去重和写库。网页只从 API 读数据库。岗位数据不写进源码、不提交 JSON。

### 最小数据库模型

- `companies`：规范公司名、官网域名、行业、校招标签。
- `career_sources`：company_id、ATS kind、board slug/tenant/site、base URL、验证时间、连续失败数。
- `search_runs`：查询条件、开始/结束时间、各源状态、抓取数量、错误摘要。
- `jobs`：内部 id、company_id、title、location、description、canonical_apply_url、posted_at、status、首次/最近发现时间。
- `job_source_records`：source、external_id、raw URL、raw payload/hash、fetched_at；唯一约束 `(source, external_id)`，URL 另建唯一/规范化索引。
- `applications`：job_id、阶段、材料、人工审批、投递证据、失败原因。

### 去重顺序

1. 同源强去重：`source + external_id`；
2. URL 去跟踪参数、统一 host/path 后去重；
3. 跨源软去重：规范公司域名 + 规范标题 + 城市/remote；
4. 冲突时优先保存官方 ATS 记录，但保留所有 source record 作为来源证据；
5. 不应像 JobScanner 那样仅用公司+标题，也不应像 ApplyPilot 那样只依赖原始 URL。

### 官网核验

- 聚合站候选必须解析 redirect，尽量落到公司 ATS/官网 URL；
- 已知 ATS 必须用 detail API 再取一次，校验 external id、公司/标题、是否仍公开；
- 保存 `verification_status`、`verified_at`、HTTP 状态和内容 hash；
- 每次准备投递前重新核验，关闭岗位改为 `closed`，不要直接删除历史记录。

### 自动投递边界

第一阶段建议只实现“打开官网 + 自动填充 + 截图 + 用户确认”，不要默认自动提交，更不要尝试绕过 CAPTCHA。登录态使用用户本机持久浏览器 profile；出现 SSO、验证码、CAPTCHA、隐私同意或未知必填问题就暂停并请求接管。若后续读取邮件验证码，应采用 Malik 项目的 sender allowlist + 内容 anchor + 本次操作时间窗三道门。

### 调度

搜索 worker 可按来源设置频率，而非让浏览器常驻：公开 ATS 每 4–12 小时，聚合源按 API 配额，失败源指数退避。每个 run 写入独立状态，页面通过 API 看到 `running / partial / completed / failed` 和每源错误；一个来源失败不应让整个搜索失败。

## 项目成熟度与注意事项

- 四个项目都较新；“代码存在”不能证明对所有网站稳定有效。
- Workday CXS、网页 CSS 和第三方聚合抓取都可能变化，应为 connector 建契约测试和线上健康检查。
- “官方 ATS 公共接口”通常是按公司 board 提供，不等于拥有全局岗位搜索，因此公司目录是核心资产。
- LinkedIn 等站的自动抓取/投递有账号与条款风险；秋招雷达应优先官方 ATS 与用户可见的人工接管流程。
- ApplyPilot 的 CAPTCHA 外部解法不建议照搬；SimplyApply 和 Malik 项目体现的失败透明、安全 hold 更适合产品化。
