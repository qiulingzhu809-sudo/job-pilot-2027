# AI 对话中的意图分析：秋招雷达落地调研

> 2026-09-22。资料依据为官方文档与一手研究论文；下文的工程选型是基于这些资料给秋招雷达的建议，并非各平台的官方推荐。

## 一句话结论

对话意图分析不是单独训练一个“句子分类器”就够了。可用的任务型助手至少需要 **意图识别 → 参数/实体提取 → 多轮状态管理 → 澄清与确认 → 工具执行 → 效果评估**。例如“帮我找上海的前端实习，别投游戏公司”同时包含 `search_jobs` 意图、城市/方向/行业排除条件，以及“查找不等于提交申请”的权限边界。[Dialogflow CX 的 intent 与 parameters](https://docs.cloud.google.com/dialogflow/cx/docs/basics)和[页面状态模型](https://docs.cloud.google.com/dialogflow/cx/docs/concept/page)展示了这几个部分如何分开。

## 需要区分的 6 层

| 层 | 回答的问题 | 秋招雷达例子 |
|---|---|---|
| 意图（intent） | 用户此轮要做什么？ | `search_jobs`、`compare_jobs`、`prepare_application`、`check_status` |
| 槽位/实体（slots/entities） | 这件事有哪些具体参数？ | 城市=上海，方向=前端，批次=2027 届，排除行业=游戏 |
| 对话状态（dialogue state） | 已经知道什么、还缺什么？ | 上轮选择了岗位 A，本轮“这家公司”指岗位 A 的公司 |
| 对话行为（dialogue act） | 下一步该问、答、确认还是执行？ | 缺职位链接时追问；登录后继续填表；提交前停下 |
| 工具路由（tool routing） | 哪个系统可执行？ | 查询岗位 JSON、读取本地资料库、打开招聘页 |
| 安全门控 | 是否获授权执行有后果的动作？ | 可以预填；上传附件与最终投递仍由用户确认 |

Dialogflow CX 将 intent 定义为**单轮**用户意图，训练短语可标注参数；参数有实体类型，可进入会话或表单，表单可跨轮补齐必填项。[Intent](https://docs.cloud.google.com/dialogflow/cx/docs/concept/intent) · [Parameter / form filling](https://docs.cloud.google.com/dialogflow/cx/docs/concept/parameter)。它还将当前 page 视为会话状态机中的状态。[Pages](https://docs.cloud.google.com/dialogflow/cx/docs/concept/page)。因此，“意图标签”不应承担整个流程状态。

## 三条实现路线

1. **规则/状态机**：少量高风险、强结构命令优先，例如“取消申请”“最终提交”。优点是可审计、低成本；缺点是自由表达覆盖差。
2. **传统 NLU 分类 + 实体抽取**：定义 intent、训练短语、实体和槽位，用分类模型/序列标注模型预测。适合稳定且封闭的意图集合，需标注数据与持续维护。Dialogflow CX 是此路线与状态机组合的典型示例。[官方说明](https://docs.cloud.google.com/dialogflow/cx/docs/concept/intent)。
3. **LLM 结构化解析 + 确定性编排**：把当前话语、必要的历史摘要、允许的意图和槽位传入模型，要求输出受约束的 JSON；应用代码校验输出，再选择工具与下一步。Structured Outputs 能约束输出遵循支持的 JSON Schema，但**结构正确不代表语义判断一定正确**。[OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)。函数调用由模型提出工具名与参数，真正的工具执行由应用完成。[OpenAI Function Calling](https://developers.openai.com/api/docs/guides/function-calling)。

**推荐给当前项目的是混合路线**：用代码维护会话状态和权限边界，用 LLM/TypeSafe/Jev 做自然语言到有限意图与槽位的映射；高风险动作单独确认。它比给每个自然表达编写关键词规则更能覆盖口语，同时避免模型直接决定浏览器提交。

## 最小架构

```text
用户消息 + 当前会话状态
        ↓
意图/槽位解析器（受约束 JSON）
        ↓
Schema 校验 + 值域校验 + 指代消解
        ↓
状态机：澄清 / 只读查询 / 准备填写 / 等待登录 / 等待复核
        ↓
工具适配层：岗位 JSON、个人资料库、Browser Harness/Jev
        ↓
执行结果写回会话状态与审计日志
```

一个最小输出契约可设计为：

```json
{
  "intent": "search_jobs",
  "slots": {
    "graduation_year": 2027,
    "directions": ["frontend", "fullstack"],
    "cities": [],
    "excluded_industries": []
  },
  "referenced_job_id": null,
  "missing_required_slots": [],
  "needs_clarification": false
}
```

`intent` 应是有限枚举，但不要把所有招聘站字段都塞进一个巨大 schema。第一层只判任务和主要条件；进入“填写申请”状态后，再按目标网站抽取页面字段。`unknown/other`、`cancel`、`correct_previous` 必须是合法路径；不要在模型输出不匹配时强行归类。后一设计是本项目的工程建议。

## 重点知识点与技术栈

- **语言理解**：文本分类、多标签分类、实体抽取、槽位填充、否定/排除、指代消解。注意“上海也可以”是补充，而“不要上海了”是修改旧槽位。
- **对话管理**：有限状态机、session state、跨轮参数传播、澄清问题、取消/回退/恢复。官方示例中 page、form、session 参数承担不同职责。[Dialogflow CX pages](https://docs.cloud.google.com/dialogflow/cx/docs/concept/page) · [parameters](https://docs.cloud.google.com/dialogflow/cx/docs/concept/parameter)。
- **LLM 接口**：JSON Schema、结构化输出、function calling/tool calling、运行时校验。模型输出不能绕过代码侧校验与授权。[OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) · [Function Calling](https://developers.openai.com/api/docs/guides/function-calling)。
- **后端**：TypeScript/Node 或 Python 均可；当前项目可沿用现有栈。用 Zod/JSON Schema（或 Python Pydantic）定义输入输出契约；用持久化会话对象保存 `active_job_id`、筛选条件和申请阶段。此处是实现建议，不要求引入完整对话平台。
- **工具与数据**：岗位查询 API/本地 JSON、资料库读取、Browser Harness/Jev、事件日志。按最小权限给工具，仅允许模型选择白名单动作，最终提交不暴露给自动执行路径。
- **隐私**：个人资料和聊天记录分开存，最少发送给模型；身份证号等敏感字段应按用途读取，并考虑日志脱敏。Dialogflow CX 的参数也提供日志脱敏配置。[Parameter redaction](https://docs.cloud.google.com/dialogflow/cx/docs/concept/parameter#parameter_redaction)。

## 怎么评估，而非凭“感觉懂了”

准备按真实用户表达标注的测试集，包含正常、含糊、否定、纠错、多意图、跨轮指代、越权请求。建议逐层统计：

- **意图**：每类 precision/recall/F1、总体准确率、混淆矩阵；不要只看平均值。Rasa 的评估接口列出 intent 的 precision、recall、F1 和 support。[Rasa API](https://rasa.com/docs/reference/api/pro/http-api/)。
- **槽位**：字段级准确率/F1、否定与覆盖旧值是否正确；研究中也常区分 intent accuracy、slot F1 与联合准确率。[一手论文](https://aclanthology.org/2021.findings-acl.282.pdf)。
- **端到端任务**：是否找到对的岗位、是否问了必要澄清、有没有误触发填表/提交、完成率和平均轮次。保存对话作为回归用例，更新后重跑；Dialogflow CX 官方测试用例覆盖意图匹配、流程、页面与参数断言。[Test cases](https://docs.cloud.google.com/dialogflow/cx/docs/concept/test-case)。
- **线上观测**：`unknown/no-match` 比率、用户改口频率、人工接管率、误操作数、延迟与调用成本。Dialogflow CX 的分析面板也关注 no-match 和 webhook 失败。[Analytics](https://docs.cloud.google.com/dialogflow/cx/docs/concept/analytics)。

## 秋招雷达的最小可行版本

先实现 5 个一级意图：`search_jobs`、`inspect_job`、`prepare_application`、`check_application`、`other`；另把 `cancel` 与 `correct_previous` 作为全局控制行为。保存 `active_job_id` 和筛选槽位；每轮结构化解析后由状态机决定下一步。若用户说“投这个”，却没有唯一岗位，先澄清；若有岗位且已登录，只进入预填与复核，不执行最终提交。用约 50–100 条匿名真实表达做初始回归集，按错例扩充，而不是先穷举全部说法。

这能先解决当前最直接的问题：用户可以自然地说“找 2027 届软件岗”“这个也看看”“换成不限城市”“帮我填这家公司”，系统不会把它们当四次独立关键词搜索，也不会把“帮我填”误解成“替我提交”。
