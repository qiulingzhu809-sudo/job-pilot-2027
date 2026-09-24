# Browser Harness

Harness 是工作台按钮与本地浏览器之间的确定性执行层，不运行 LLM，也不需要模型 API Key。

## 状态机

`POST /applications` 创建任务；前端轮询 `GET /applications/{id}`。任务依次进入 `running`、`waiting_user`、`review`，不支持的域名进入 `unsupported`。用户完成登录或验证码后，`POST /applications/{id}/resume` 继续；`DELETE /applications/{id}` 关闭浏览器。

完成标准：`review` 表示已支持适配器完成可确认字段填写并停在提交前；`unsupported` 表示页面已打开且本地 Agent 交接可供 Codex 接管。两者不能混用。

## 适配器边界

每个招聘域名单独实现适配器，使用可见标签、占位符和结构定位字段，写入后读取值复核。适配器只使用标准资料库中的已有值；登录、验证码、选择题、附件和最终提交保留给用户。

新增域名时同时增加来源页面的冒烟测试和状态断言。页面结构变化时返回明确失败，不使用猜测选择器继续写入。
