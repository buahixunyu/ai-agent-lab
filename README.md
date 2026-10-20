# AI Agent Lab

[![CI](https://github.com/buahixunyu/ai-agent-lab/actions/workflows/ci.yml/badge.svg)](https://github.com/buahixunyu/ai-agent-lab/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

一个基于 **Nuxt 4 + Vue 3 + TypeScript** 的流式 AI 对话应用，接入 DeepSeek（OpenAI 兼容接口）。

从「输入框 → 服务端路由 → 大模型 SSE 流 → 浏览器逐字渲染」的最小可运行闭环，
后续在这个骨架上继续扩展 **RAG 知识库**、**工具调用 Agent**、**评测体系**。

> 这是我的 AI 应用学习主线，每次迭代都会记录动机、指标和踩坑。

---

## 功能

- [x] 流式输出（SSE），打字机效果
- [x] 多轮对话上下文
- [x] 中途停止生成
- [x] Markdown 渲染（代码块、列表、链接）
- [x] 错误提示与空状态引导
- [x] 响应式布局，移动端可用
- [x] 显示每次回复的耗时与 token 用量
- [x] Docker 一键部署
- [ ] RAG 知识库 + 引用溯源（计划中）
- [ ] 工具调用（Function Calling）（计划中）
- [ ] 评测集与指标看板（计划中）

---

## 架构

```
浏览器 (Vue 3, app/)
   │  POST /api/chat  { messages }
   ▼
Nuxt Server Route (server/api/chat.post.ts)
   │  · 注入 API Key（不能放前端）
   │  · fetch 上游 stream: true
   │  · 原样透传 SSE
   ▼
DeepSeek Chat Completions
   data: {"choices":[{"delta":{"content":"你"}}]}
```

**为什么 Key 必须放在服务端？**
浏览器的请求是公开的，Key 一旦出现在前端代码或网络请求里就等于泄露。服务端代理是唯一正确做法。

**为什么流式要透传而不是解析后重组？**
解析再重组会引入额外延迟和缓冲风险；透传最简单，也最能看清「流」的完整路径。

---

## 快速开始

环境要求：**Node >= 22.12**、pnpm >= 9

```bash
# 1. 装依赖
pnpm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，填入 NUXT_DEEPSEEK_API_KEY

# 3. 启动
pnpm dev
# 打开 http://localhost:3000
```

### 生产构建

```bash
pnpm build
node .output/server/index.mjs   # 默认 :3000
```

### Docker

```bash
docker build -t ai-agent-lab .
docker run -p 3000:3000 -e NUXT_DEEPSEEK_API_KEY=sk-xxx ai-agent-lab
```

---

## 目录结构

```
.
├── app/
│   ├── app.vue                    # 单页 UI（对话界面）
│   ├── assets/css/main.css        # 全局样式
│   └── composables/
│       └── useChatStream.ts       # 流式对话核心逻辑（SSE 解析）
├── server/
│   └── api/
│       └── chat.post.ts           # 服务端代理，转发 DeepSeek
├── nuxt.config.ts                 # runtimeConfig（Key 从环境变量读取）
├── docs/改造清单.md                # 下一阶段任务
└── Dockerfile
```

---

## 关键实现说明

### 1. 流是怎么一段段读出来的

```ts
const reader = res.body.getReader()
const decoder = new TextDecoder()
let buffer = ''

while (true) {
  const { done, value } = await reader.read()
  if (done) break
  buffer += decoder.decode(value, { stream: true })
  const lines = buffer.split('\n')
  buffer = lines.pop() ?? '' // 最后一行可能不完整，留到下一轮
  // 逐行解析 "data: {...}"
}
```

要处理三个坑：

1. **分片边界**：一次 `read()` 拿到的可能是半行，必须留 buffer
2. **`[DONE]`**：结束标记不是 JSON，直接跳过
3. **DOM 重渲染**：Vue 响应式会合并更新，观感上是「一段段出现」而不是严格逐字

### 2. 停止生成

用 `AbortController`：`fetch(..., { signal })`，用户点停止时调 `controller.abort()`，
服务端连接会随之断开（Node 会自动 destroy upstream）。

### 3. 上线时容易踩的坑

- Nginx 默认会缓冲响应 → 必须加 `proxy_buffering off`，并返回响应头 `X-Accel-Buffering: no`
- Serverless 平台对流式支持不一，且有函数超时限制
- 生产环境记得加限流和鉴权，否则接口会被刷

---

## 已知问题 / TODO

- [ ] Markdown 用简易正则过滤 XSS，生产应换 `DOMPurify`
- [ ] 没有对话持久化（刷新即丢），后续接 SQLite / PostgreSQL
- [x] token 用量统计已实现（`stream_options.include_usage`），成本估算待补
- [ ] 没有移动端输入法兼容性测试
- [ ] 没有单元测试

---

## 文档

- [学习笔记 01 · 基础篇：一次请求是怎么跑起来的](docs/学习笔记-01-基础篇.md) —— 架构数据流、Key 安全、SSE/chunk/token、面试话术
- [改造清单](docs/改造清单.md) —— 下一阶段任务，做完项目才算自己的

---

## Roadmap

| 阶段 | 内容 | 状态 |
|---|---|---|
| v0.1 | 流式对话骨架 | ✅ |
| v0.2 | 产品级交互 + 结构化输出 | ⬜ |
| v0.3 | RAG 知识库 + 引用溯源 | ⬜ |
| v0.4 | 工具调用 Agent | ⬜ |
| v0.5 | 评测集 + 指标对比 | ⬜ |
| v1.0 | Docker 部署 + 完整文档 | ⬜ |

---

## License

MIT
