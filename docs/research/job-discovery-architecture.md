# 求职雷达岗位检索架构调研

> 调研日期：2026-09-07
> 范围：只采用项目 README、GitHub Actions、配置和采集源码等一手资料。Star 数仅是调研当天快照，不作为代码质量结论。

## 结论先行

当前一次“运行秋招雷达”需要约 30 分钟，主要不是 Agent 推理速度，而是流程结构问题：公司发现、二级来源浏览、官网核验、字段抽取、去重、写库和打开网页全被串在同一次交互里，并且 Browser Use 被当成默认采集器。

调研项目的共同做法恰好相反：

1. **采集与使用解耦**：GitHub Actions 或后台任务持续刷新，用户打开页面时只查询已有数据。
2. **API/结构化数据优先**：优先调用 ATS、招聘平台公开接口、SSR JSON 或上游结构化数据；浏览器自动化只是少量慢源的兜底。
3. **快慢源分层**：稳定 API/HTML 高频跑，Playwright、登录墙、社区网页低频跑，某一慢源失败不阻塞主链路。
4. **增量状态持久化**：保存 `external_id/url`、`first_seen`、`last_seen`、来源健康度和通知状态，下一轮不从零开始。
5. **失效判断必须带来源成功条件**：只有某个来源本轮成功完成扫描，而旧岗位没有再次出现，才能标记下线；抓取失败或数量异常时保留旧数据。
6. **公司发现不应依赖无限名单**：招聘聚合平台、国家/高校就业平台、VC/产业生态岗位板、ATS 租户目录等“系统级入口”一次能暴露大量长尾公司。

因此，Job Pilot 应从“每次让 Agent 现场搜索岗位”转成 **后台岗位索引器 + 即时工作台 + 按需官网复核/投递助手**。Browser Use 可以保留，但不应该在主采集链路中逐家公司跑。

## 项目对比

| 项目 | 调研日 Star | 岗位发现方式 | 获取方式 | 增量/去重 | 失效处理 | 调度 | 浏览器自动化 |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| [xixicc186/xixicc2027](https://github.com/xixicc186/xixicc2027) | 53 | 上游过程未开源；仓库发布聚合后的 `jobs.json` | Skill 下载 JSON 和 HTML 模板 | 前端仅筛选已有快照 | README 提醒可能滞后，无可审计失效逻辑 | 仓库声称每日更新，但无 Actions | 否；Skill 只打开生成的本地 HTML |
| [Jasmine-Liu-min/job-radar](https://github.com/Jasmine-Liu-min/job-radar) | 15 | 官网、国家平台、高校、国聘、ATS、牛客/实习僧等信源注册表 | API、HTML 与少量 Playwright adapter | 官方 URL + 公司/职位/城市键；`first_seen/last_seen` | 成功源快照替换、下线归档、数量骤降告警、连续失败降级 | API/HTML 每日；浏览器慢源每周 2 次 | 仅慢源 |
| [SimplifyJobs/New-Grad-Positions](https://github.com/SimplifyJobs/New-Grad-Positions) | 17,909 | Simplify 自有数据流 + 社区 Issue 投稿 | 仓库接收结构化 `listings.json`，不在此仓库爬网页 | URL 定位编辑；审核后写入统一 JSON | 人工编辑/批量下线；非 Simplify 数据超过阈值标 inactive | 数据文件变化或 Issue 审核触发 | 否 |
| [SpeedyApply/JobSpy](https://github.com/SpeedyApply/JobSpy) | 4,240 | 对多个通用招聘站执行关键词与地点查询 | `requests/tls-client` + HTML/JSON 解析，多站点并发 | 只负责一次调用结果，不负责长期状态 | 调用方负责 | 无产品级调度 | 否 |
| [Agnikulu/Job-Postings](https://github.com/Agnikulu/Job-Postings) | 1 | `companies.yaml` 注册企业及其 ATS | 20 类公开 ATS/官网 API；详情按需抓取 | URL 状态表和历史归档 | 仅成功扫描的公司可把未出现 URL 标 closed | 每小时 | 否；“browser headers”不是启动浏览器 |
| [ScottCoffin/Job_Scraper](https://github.com/ScottCoffin/Job_Scraper) | 9（25 forks） | LinkedIn/Indeed/Google Jobs 等宽入口 + 公共部门平台 + 可选企业白名单 | 公共 guest endpoint、JobSpy、SSR/HTML 表单 | 平台 ID/规范 URL强去重，再做公司/标题/城市/描述跨源合并 | 0 结果保护；主库只保留最近 30 天 | 不同来源独立小时/每日 workflow | 否；Google Jobs 路径明确优先无浏览器方案 |
| [sohan-shingade/jobslop](https://github.com/sohan-shingade/jobslop) | 0 | 35+ VC 投资组合岗位板 + Simplify + 若干 ATS | Consider API、Getro `__NEXT_DATA__`、上游 JSON、ATS API | 已知 URL 跳过；公司内精确+模糊两阶段去重 | 按发布时间删除超过 30 天记录 | 每小时 | 源码未使用；workflow 安装 Playwright 属冗余依赖 |

## 一手源码观察

### 1. xixicc2027：它是数据产品，不是可复用的采集引擎

README 声称“公开渠道自动聚合 + LLM 提取 + 多渠道交叉校验”，并展示每日更新的数百条结果，但仓库根目录没有 GitHub Actions 或采集器；公开代码主要是 `jobs.json`、静态页面和 Skill。[README 的数据声明](https://github.com/xixicc186/xixicc2027/blob/main/README.md#L1-L15) [数据来源说明](https://github.com/xixicc186/xixicc2027/blob/main/README.md#L557-L559)

它的 Skill 并不现场搜索职位，而是直接下载仓库中已经生成好的 `jobs.json` 和模板，在本地过滤后渲染 HTML。[fetch_render.py](https://github.com/xixicc186/xixicc2027/blob/main/skill/qiuzhao-feed/scripts/fetch_render.py#L22-L66)

可借鉴的是“一句话打开最新结果”的体验；不能从公开仓库证明或复用其岗位发现、增量抓取和失效校验能力。它也说明了一个关键产品原则：**Agent 交互层应该消费现成数据，而不是在用户等待时重新生产数据。**

### 2. Jasmine job-radar：与中国校招场景最接近

该项目把来源配置为 adapter 注册表，涵盖国内官网接口、Workday/Greenhouse/Ashby/Lever/北森、国家大学生就业服务平台、国聘、高校就业网、牛客和实习僧等。[sources.csv](https://github.com/Jasmine-Liu-min/job-radar/blob/main/config/sources.csv)

最关键的设计是快慢分层：日常 `fast` 明确排除 Playwright 和社区慢源，只跑优先级高的 API/HTML；`slow` 才补扫浏览器渲染、社区和低优先级来源。[sync_plan.py](https://github.com/Jasmine-Liu-min/job-radar/blob/main/scripts/sync_plan.py#L51-L85) 对应 Actions 是每日快扫和每周三、周日慢扫，[sync.yml](https://github.com/Jasmine-Liu-min/job-radar/blob/main/.github/workflows/sync.yml#L1-L51) [slow.yml](https://github.com/Jasmine-Liu-min/job-radar/blob/main/.github/workflows/slow.yml#L1-L54)。

增量合并保留已有岗位的 `first_seen` 和用户状态，只刷新本轮成功扫描的来源；成功源中不再出现的岗位移出主库并写入归档。[sync.py 增量合并](https://github.com/Jasmine-Liu-min/job-radar/blob/main/job_radar/sync.py#L106-L196)

项目还监控“静默失效”：当前抓取量跌到 0 或低于历史峰值 20% 时告警，并拒绝用异常空快照清掉旧岗位；异常会累计为 `unstable/blocked`。[sync.py 健康检查](https://github.com/Jasmine-Liu-min/job-radar/blob/main/job_radar/sync.py#L230-L330)

去重先匹配官方 URL，再匹配归一化后的公司、职位和城市，并合并来源字段、最早发布时间和出现次数。[dedup.py](https://github.com/Jasmine-Liu-min/job-radar/blob/main/job_radar/dedup.py#L1-L70)

这是当前项目最值得直接借鉴的基线，不过其岗位数据仍提交到 Git；Job Pilot 已有 D1，更适合将相同状态模型放进数据库，而不是把个人岗位和投递记录重新写回仓库。

### 3. Simplify New-Grad-Positions：覆盖来自“维护系统”，不是一次爬虫

该项目的巨大覆盖不是公开仓库里某个万能爬虫产生的。社区通过 GitHub Issue 提交或编辑岗位，要求正式 ATS 链接且不得重复，维护者审核通过后，Action 自动把 Issue 转成 `listings.json` 并重建 README。[CONTRIBUTING.md](https://github.com/SimplifyJobs/New-Grad-Positions/blob/dev/CONTRIBUTING.md#L1-L40) [contribution_approved.yml](https://github.com/SimplifyJobs/New-Grad-Positions/blob/dev/.github/workflows/contribution_approved.yml#L1-L62)

README 更新 workflow 只监听 `listings.json` 变化，不负责网页发现。[update_readmes.yml](https://github.com/SimplifyJobs/New-Grad-Positions/blob/dev/.github/workflows/update_readmes.yml#L1-L47) 非 Simplify 来源超过四个月会被规则标为 inactive，人工编辑和批量 issue 也承担下线维护。[util.py](https://github.com/SimplifyJobs/New-Grad-Positions/blob/dev/.github/scripts/util.py#L105-L124)

可借鉴点是：

- 将高覆盖上游 JSON 当“候选线索源”，无需自己重复抓全部公司。
- 设计人工审核入口，解决公众号、内推群、需登录页面等不可稳定自动化来源。
- “发现”与“官网有效性”分开：上游发现公司和岗位，官网 adapter 再做可信度升级。

### 4. JobSpy：用 HTTP 并发替代大部分 Browser Use

JobSpy 是采集库，不是完整雷达。它并发调用 LinkedIn、Indeed、Glassdoor、Google、ZipRecruiter 等多个站点，并统一输出 DataFrame。[入口实现](https://github.com/SpeedyApply/JobSpy/blob/main/jobspy/__init__.py#L1-L115) 底层使用 `requests`、`tls-client` 和 BeautifulSoup，而不是 Selenium/Playwright。[HTTP session](https://github.com/SpeedyApply/JobSpy/blob/main/jobspy/util.py#L1-L125)

其 README 明确承认 LinkedIn 等站点会限流，并建议代理、降低请求速率或减少结果规模。[README 限制说明](https://github.com/SpeedyApply/JobSpy/blob/main/README.md#L176-L215)

所以它适合成为通用招聘站的一个 adapter，但不能直接替代 Job Pilot 的状态层：它不提供跨轮次去重、来源健康、失效确认和定时任务。此外，它主要覆盖海外招聘站，中国校招仍需要国聘、国家平台、高校和国内 ATS adapter。

### 5. Job-Postings：公共 ATS 全量拉取，比搜索引擎稳定

该项目每小时从 `companies.yaml` 读取企业及 ATS 信息，使用 Greenhouse、Ashby、Lever、Workday、Gem、SmartRecruiters、Microsoft、Amazon 等公开接口抓取，不要求登录，也不启动浏览器。[技术架构](https://github.com/Agnikulu/Job-Postings/blob/main/README_TECH.md#L1-L68) [adapter 清单](https://github.com/Agnikulu/Job-Postings/blob/main/README_TECH.md#L75-L110)

它没有解决“无限公司名单”的根问题，企业注册表仍需维护；但注册的是 **ATS 租户/平台入口**，不是每次拼接“公司名 + 前端 + 2027”搜索。一次企业 API 拉取可拿全量岗位，再在本地按届别、职级和技术方向分类。

性能优化也值得采用：标题明显匹配或明显排除时不请求详情，只有不确定的岗位才懒加载 JD。[README_TECH 分类流程](https://github.com/Agnikulu/Job-Postings/blob/main/README_TECH.md#L112-L133) 多公司并行，但容易限流的 LinkedIn 单独串行限速。定时 workflow 有并发锁，避免上次任务未完又开一轮。[scraper.yml](https://github.com/Agnikulu/Job-Postings/blob/main/.github/workflows/scraper.yml#L1-L37)

失效逻辑很严谨：归档只会将“本轮成功观察到的公司”中消失的 URL 标记 closed，某个 adapter 失败不会误关其它岗位。[jobs_archive.py](https://github.com/Agnikulu/Job-Postings/blob/main/jobs_archive.py#L65-L123)

### 6. Job_Scraper：宽入口、独立调度和跨源合并

该项目不是逐家公司查官网，而是分别跑 LinkedIn guest endpoint、Indeed/Glassdoor/ZipRecruiter/Google Jobs（JobSpy）、HiringCafe 以及公共部门招聘入口；每个来源有独立 workflow 和不同回溯窗口。[README 来源说明](https://github.com/ScottCoffin/Job_Scraper/blob/main/README.md#L160-L204) [LinkedIn watcher](https://github.com/ScottCoffin/Job_Scraper/blob/main/.github/workflows/linkedin_watch.yml#L1-L80)

这仍然需要有限的岗位关键词，但它和搜索引擎穷举不同：一次查询命中一个招聘站的结构化结果集，分页、时间窗口和地点都可控；公司来自结果数据，而不是预设排名。

其稳定身份优先提取 LinkedIn job ID、Indeed `jk`、ZipRecruiter ID、Greenhouse ID，否则使用去参数 URL；跨来源再以归一化公司、标题、地点和描述相似度合并，并保留 `duplicate_urls`。[scrape_jobs.py 身份与合并](https://github.com/ScottCoffin/Job_Scraper/blob/main/scrape_jobs.py#L2538-L2771) 累积主库只保留最近 30 天，并在导入时做二次去重。[30 天主库](https://github.com/ScottCoffin/Job_Scraper/blob/main/scrape_jobs.py#L2798-L2860)

它对来源空结果做保护，例如 HiringCafe 全部查询返回 0 时复用旧快照，避免错误清空。[HiringCafe guard](https://github.com/ScottCoffin/Job_Scraper/blob/main/scrape_jobs.py#L1824-L1864)

### 7. jobslop：用生态岗位板自动发现长尾公司

这个项目最能回答“无限公司名单一定遗漏”的质疑。它不先枚举每家公司，而是抓 Sequoia、a16z、Greylock、Accel 等 VC 的投资组合岗位板；一个 Consider/Getro board 会暴露整个生态的公司和岗位。[vc_boards.yaml](https://github.com/sohan-shingade/jobslop/blob/main/config/vc_boards.yaml) 这类“上游集合”在中国可以对应产业园/投资机构企业库、高校双选会单位目录、专精特新名单、国聘专题、行业协会和 ATS 租户入口。

Consider adapter 通过无需登录的 POST API 做游标分页；增量模式发现连续两页已有 URL 比例超过 80% 就提前停止，避免每轮全翻。[consider.py](https://github.com/sohan-shingade/jobslop/blob/main/scrapers/consider.py#L1-L155) 主流程并发抓多个 board，从 D1 先读取已知 URL，只 upsert 新岗位，最后清理超过 30 天的记录。[aggregate.py](https://github.com/sohan-shingade/jobslop/blob/main/scripts/aggregate.py#L109-L194) [增量编排](https://github.com/sohan-shingade/jobslop/blob/main/scripts/aggregate.py#L202-L278)

去重是公司/标题/城市精确键加公司桶内模糊匹配，并合并多个 VC 来源。[deduplicate.py](https://github.com/sohan-shingade/jobslop/blob/main/scripts/deduplicate.py#L1-L151)

需要注意两个缺点：它按照发布时间直接删除 30 天前岗位，不能证明岗位真的关闭；其 workflow 安装 Playwright，但采集源码没有使用 Playwright。因此应借鉴“生态入口发现”和“已知页提前停止”，不照搬失效逻辑或冗余浏览器安装。

## 对当前 Job Pilot 的诊断

当前 Skill 的正确点是：岗位不跟源码提交、D1 按官方网址 upsert、二级来源只做线索、最终以官网为准。慢的原因在于执行时机和工具优先级：

```text
用户命令
  -> 现场轮换信息源
  -> 现场建立公司池
  -> Browser Use 逐页打开
  -> 每个候选再进官网核验
  -> 整批完成后才写 D1 和打开工作台
```

这个流程把离线批处理放进了同步用户请求。只要候选公司增加，耗时近似按页面数量线性增长；浏览器启动、渲染、等待和页面理解又远慢于 HTTP/API，所以“想海投、尽量多返回”必然和“几分钟内完成”冲突。

另外，现有 `/api/jobs` 一次最多接收 25 条记录，适合 Agent 小批量写回，但不适合后台索引器的大规模增量；数据模型也还缺来源运行状态、外部岗位 ID、最后观察时间和关闭证据，因此每次 Agent 很难可靠地续跑。

## 建议目标架构

```text
发现层（定时）
  聚合 JSON / 国家与高校平台 / 生态岗位板 / ATS 租户目录
                 |
                 v
采集层（adapter）
  API/JSON -> SSR JSON -> HTML -> Browser slow lane
                 |
                 v
标准化与状态层（D1）
  identity -> 去重 -> observations -> health -> active/closed
                 |
          +------+------+
          |             |
          v             v
      工作台即时查询    Agent 按需官网复核/投递
```

### 数据表建议

- `sources`：来源类型、adapter、endpoint、频率、游标、健康状态、连续失败次数、历史峰值。
- `crawl_runs`：每轮开始/结束、成功、原始数量、匹配数量、错误和耗时。
- `jobs`：规范岗位实体、官网 URL、外部 ID、公司、方向、Base、批次、有效状态。
- `job_observations`：某来源何时看到该岗位、原始 URL、首次/最后观察、原始摘要。
- `job_aliases`：跨来源 URL/ID 到规范岗位的映射。
- `applications`：个人关注、投递、测评、面试、Offer 和备注；与采集状态分离。

强身份键按优先级使用：`source + external_job_id`、规范化官网 URL、ATS requisition ID。只有没有强 ID 时，才用“公司 + 标题 + Base”归一化键和模糊相似度。不要仅用 URL，因为同一岗位可能有官网、牛客、LinkedIn 和内推链接；也不要只用模糊标题，以免合并不同城市或职级。

### 快慢通道

**Fast lane（目标 2–5 分钟，后台每日或每 4–6 小时）：**

- 上游结构化 JSON：xixicc2027、可信 GitHub 校招聚合、可用公开 feed。
- 官方/国家聚合：国聘、国家大学生就业服务平台、公开招聘公告。
- 常见 ATS/API：北森、Moka、Workday、Greenhouse、Lever、Ashby、国内大厂已发现接口。
- 高校就业网的公开 JSON 或服务端 HTML。
- 并发 5–10 个来源，按来源限速；单源失败隔离。

**Slow lane（每周 2 次或手动，后台运行）：**

- 牛客、实习僧、飞书招聘、SPA 高校。
- 需要登录态、验证码、WAF 或必须执行 JavaScript 的官网。
- Browser Use/Playwright 只获取 API 无法提供的字段或验证少量高分候选。
- 设置每源页面数、时间和候选数预算；超时后保存游标，下轮续跑。

**用户现场命令（目标 5 秒内返回）：**

- 立即打开工作台并读取 D1 最近结果。
- 后台没有在跑时触发 fast refresh，但不阻塞页面。
- 显示“上次更新、正在刷新、来源健康、新增数量”。
- 用户选中某岗位后，Agent 才用 Browser Use 打开官方详情核验或填写申请。

### 公司池如何避免无穷枚举

采用“系统入口 -> 公司实体 -> ATS 入口”的图，而不是维护一张永远不全的公司名单：

1. 从国聘专题、高校双选会/招聘会单位列表、专精特新/产业园/投资机构企业目录等批量发现公司。
2. 从聚合岗位和官网链接反向识别 ATS 域名、tenant、board token 和外部岗位 ID。
3. 同一个 ATS adapter 服务成百上千家公司；新公司只增加配置或自动发现 tenant，不新增浏览器提示词。
4. 记录覆盖率：行业、城市、公司规模、发现系统、最近扫描时间。下一轮选择覆盖缺口，而不是搜索排名靠前的公司。
5. 聚合/社区来源只创建低置信度 observation；命中官方 ATS 后升级为官网已核验。

### 失效与真实性规则

- 来源请求失败、登录失效、返回 0 或数量骤降时，不关闭岗位，只降低来源健康度。
- 只有来源成功完成足够深度扫描，岗位连续 2 次未出现，或官方详情明确 404/closed，才标 `closed`。
- 聚合来源消失但官方仍可投，岗位保持 active。
- 官方 URL 每 24–72 小时按优先级复核；投递截止临近和用户收藏岗位优先。
- 保存关闭理由与证据时间，允许重新开放，避免“清理即丢失”。

## 推荐实施顺序

### 第 1 阶段：先把 30 分钟变成“即时打开 + 后台刷新”

1. 新增 `sources/crawl_runs/job_observations` 状态模型。
2. 把“运行秋招雷达”改为先打开工作台，再触发非阻塞 refresh。
3. 将现有聚合项目、国家平台和高校公开页改为 HTTP adapter；Browser Use 退出默认路径。
4. 实现来源成功保护、`first_seen/last_seen` 和连续缺失关闭。
5. 工作台显示刷新进度与单源错误，不让用户盯着 Agent 等整轮结束。

### 第 2 阶段：扩大长尾覆盖

1. 增加国聘专题、高校招聘会单位目录、GitHub 聚合 JSON 等“系统级入口”。
2. 建 ATS adapter 注册机制和 tenant 自动识别，优先北森/Moka/Workday/Greenhouse/Lever/Ashby。
3. 按行业、Base、规模和来源计算覆盖缺口，调度器优先补缺，不按公司知名度排序。
4. 接入 JobSpy 作为通用站补充源，但对中国覆盖不足要有明确标签。

### 第 3 阶段：保留浏览器的高价值环节

1. 慢源独立定时任务，带页数、时间、重试和游标预算。
2. 对登录后才能看到的来源，允许用户一次登录后复用本机会话，但不上传 Cookie。
3. 只对高匹配、信息缺失或即将投递岗位做官网详情复核。
4. 网申填写继续用 Browser Use，但必须和岗位发现任务分离，并保留提交前确认。

## 最终建议

不用完全删除 Browser Use；应把它从“全网检索主引擎”降级为 **慢源 adapter + 官网复核 + 网申执行器**。岗位雷达的主引擎应是可调度、可续跑、可观测的 HTTP/API 索引器。

如果只选一个项目作为直接工程参考，优先采用 Jasmine job-radar 的快慢源、增量合并和来源健康模型；再吸收 jobslop 的生态岗位板发现与已知页提前停止、Job-Postings 的成功扫描后才关闭、Job_Scraper 的跨源身份归一化。xixicc2027 和 Simplify 更适合作为候选数据源或产品体验参考，不应被误认为公开了完整采集引擎。
