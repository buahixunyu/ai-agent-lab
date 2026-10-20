<script setup lang="ts">
import { marked } from 'marked'

const { messages, streaming, error, send, stop, reset } = useChatStream()

const draft = ref('')
const listEl = ref<HTMLElement | null>(null)
const inputEl = ref<HTMLTextAreaElement | null>(null)

const examples = [
  '用一句话解释什么是 RAG，举一个实际例子',
  '我有一个 PDF 白皮书，想做成问答系统，技术方案怎么选？',
  '写一个 Vue 3 的防抖组合式函数，带注释'
]

/**
 * 极简 XSS 兜底：模型输出会走 v-html，理论上存在注入风险。
 * 这里只做最小过滤，生产环境请换成 DOMPurify。
 * （这一条本身就可以写进 README 的「已知问题」）
 */
function sanitize(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:/gi, '')
}

function render(text: string) {
  if (!text) return ''
  return sanitize(marked.parse(text, { async: false }) as string)
}

function scrollToBottom() {
  nextTick(() => {
    if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight
  })
}

// 内容增长时自动滚到底部
watch(
  () => messages.value.length + ':' + (messages.value.at(-1)?.content.length ?? 0),
  scrollToBottom
)

async function submit() {
  const text = draft.value
  if (!text.trim() || streaming.value) return
  draft.value = ''
  await send(text)
  scrollToBottom()
}

function onKeydown(event: KeyboardEvent) {
  // Shift + Enter 换行，Enter 发送；输入法组合中不触发
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    submit()
  }
}

function fillExample(text: string) {
  draft.value = text
  inputEl.value?.focus()
}
</script>

<template>
  <div class="app">
    <header class="header">
      <div class="brand">
        <span class="logo">◍</span>
        <div>
          <h1>AI Agent Lab</h1>
          <p>Nuxt · Vue 3 · DeepSeek · SSE 流式</p>
        </div>
      </div>
      <div class="actions">
        <span class="status" :class="{ live: streaming }">
          {{ streaming ? '生成中' : '就绪' }}
        </span>
        <button class="ghost" :disabled="messages.length === 0" @click="reset">清空</button>
      </div>
    </header>

    <main ref="listEl" class="messages">
      <div v-if="messages.length === 0" class="empty">
        <h2>从一个问题开始 👋</h2>
        <p>这个项目只做一件事：把大模型的输出，一个字一个字地流到页面上。</p>
        <div class="examples">
          <button v-for="item in examples" :key="item" class="example" @click="fillExample(item)">
            {{ item }}
          </button>
        </div>
      </div>

      <div
        v-for="(msg, index) in messages"
        :key="index"
        class="row"
        :class="msg.role === 'user' ? 'row-user' : 'row-assistant'"
      >
        <div class="bubble" :class="msg.role">
          <div v-if="msg.role === 'user'" class="plain">{{ msg.content }}</div>
          <div v-else class="markdown" v-html="render(msg.content)" />
          <span v-if="streaming && index === messages.length - 1" class="caret" />
        </div>
      </div>

      <div v-if="error" class="error">⚠️ {{ error }}</div>
    </main>

    <footer class="composer">
      <div class="input-wrap">
        <textarea
          ref="inputEl"
          v-model="draft"
          rows="1"
          placeholder="问点什么…（Enter 发送，Shift + Enter 换行）"
          @keydown="onKeydown"
        />
        <button v-if="!streaming" class="send" :disabled="!draft.trim()" @click="submit">
          发送
        </button>
        <button v-else class="send stop" @click="stop">停止</button>
      </div>
      <p class="hint">回答由 AI 生成，请自行判断准确性。</p>
    </footer>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  max-width: 860px;
  margin: 0 auto;
  background: var(--panel);
  border-left: 1px solid var(--line);
  border-right: 1px solid var(--line);
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--line);
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo {
  font-size: 22px;
  color: var(--brand);
}

.brand h1 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.brand p {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--muted);
}

.actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.status {
  font-size: 12px;
  color: var(--muted);
  padding: 3px 8px;
  border-radius: 999px;
  background: #f3f4f6;
}

.status.live {
  color: var(--brand);
  background: var(--brand-soft);
}

.ghost {
  border: 1px solid var(--line);
  background: #fff;
  color: var(--muted);
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 12px;
  cursor: pointer;
}

.ghost:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 24px 20px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.empty {
  margin: auto;
  text-align: center;
  max-width: 520px;
}

.empty h2 {
  font-size: 20px;
  margin: 0 0 8px;
}

.empty p {
  color: var(--muted);
  font-size: 14px;
  margin: 0 0 22px;
}

.examples {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.example {
  text-align: left;
  border: 1px solid var(--line);
  background: #fff;
  padding: 12px 14px;
  border-radius: 10px;
  font-size: 13px;
  color: var(--text);
  cursor: pointer;
  transition:
    border-color 0.15s,
    background 0.15s;
}

.example:hover {
  border-color: var(--brand);
  background: var(--brand-soft);
}

.row {
  display: flex;
}

.row-user {
  justify-content: flex-end;
}

.row-assistant {
  justify-content: flex-start;
}

.bubble {
  max-width: 85%;
  padding: 12px 16px;
  border-radius: 14px;
  font-size: 14.5px;
  line-height: 1.7;
  word-break: break-word;
}

.bubble.user {
  background: var(--brand);
  color: #fff;
  border-bottom-right-radius: 4px;
}

.bubble.assistant {
  background: #f9fafb;
  border: 1px solid var(--line);
  border-bottom-left-radius: 4px;
}

.plain {
  white-space: pre-wrap;
}

.caret {
  display: inline-block;
  width: 7px;
  height: 15px;
  margin-left: 2px;
  background: var(--brand);
  vertical-align: -2px;
  animation: blink 1s steps(2, start) infinite;
}

@keyframes blink {
  to {
    visibility: hidden;
  }
}

.markdown :deep(p) {
  margin: 0 0 10px;
}

.markdown :deep(p:last-child) {
  margin-bottom: 0;
}

.markdown :deep(pre) {
  background: #111827;
  color: #e5e7eb;
  padding: 12px 14px;
  border-radius: 8px;
  overflow-x: auto;
  font-size: 13px;
}

.markdown :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.markdown :deep(ul),
.markdown :deep(ol) {
  padding-left: 20px;
  margin: 0 0 10px;
}

.markdown :deep(a) {
  color: var(--brand);
}

.error {
  color: var(--danger);
  font-size: 13px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  padding: 10px 14px;
  border-radius: 8px;
}

.composer {
  border-top: 1px solid var(--line);
  padding: 14px 20px 12px;
}

.input-wrap {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 8px 8px 8px 14px;
  transition: border-color 0.15s;
}

.input-wrap:focus-within {
  border-color: var(--brand);
}

textarea {
  flex: 1;
  border: none;
  outline: none;
  resize: none;
  max-height: 160px;
  font-size: 14.5px;
  line-height: 1.6;
  font-family: inherit;
  background: transparent;
  color: var(--text);
}

.send {
  border: none;
  background: var(--brand);
  color: #fff;
  padding: 9px 18px;
  border-radius: 9px;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}

.send:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.send.stop {
  background: #111827;
}

.hint {
  margin: 8px 2px 0;
  font-size: 11.5px;
  color: var(--muted);
}
</style>
