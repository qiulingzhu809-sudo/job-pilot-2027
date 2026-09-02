# 结果数据契约

Discover 模式最终把一个 JSON 数组写入 `data/agent-jobs.json`。每一项结构如下：

```json
{
  "company": "影石 Insta360",
  "role": "前端工程师-2027校招",
  "companyType": "智能硬件科技企业",
  "industry": "智能影像 · 消费电子 · AI",
  "base": ["深圳"],
  "track": "前端",
  "tags": ["React", "工程化", "性能优化"],
  "batch": "2027届秋季校园招聘",
  "graduationYear": 2027,
  "officialUrl": "https://company.example/campus/position/123/detail",
  "applyStatus": "可投递",
  "remoteInterview": "官网未说明",
  "verifiedAt": "2026-09-02",
  "duplicateCheck": "未发现重复",
  "score": 8.4,
  "scoreReason": "方向匹配，技术场景完整；Base按中性7分计算",
  "notes": ""
}
```

约束：

- `officialUrl` 必须为 HTTPS 企业招聘官网岗位页或企业官方 ATS 页面，不能是搜索结果、公众号转载、聚合站或高校公告。
- `applyStatus` 只能为 `可投递`、`疑似可投递`、`已关闭`；平台导入只接受 `可投递`。
- `verifiedAt` 使用执行当天的 `YYYY-MM-DD`。
- `score` 为 0–10 的一位小数。
- `tags` 最多 6 个；`base` 至少一个元素，未知时写 `未知`。
- 届别、状态或官方 URL 任一无法确认时，不得写入结果文件，在完成报告中列为待核验候选。
