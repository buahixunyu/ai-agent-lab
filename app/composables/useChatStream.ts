export type Role = 'system' | 'user' | 'assistant'

export interface ChatMessage {
  role: Role
  content: string
}

export interface TokenUsage {
  prompt: number
  completion: number
  total: number
}

/**
 * 把异常翻译成「给用户看的文案」。
 *
 * 纯函数、无副作用，方便单测。三类错误来源不同，处理策略也不同：
 * - AbortError：用户主动点停止，属于正常操作，不展示错误（返回空串）
 * - TypeError：fetch 在网络层失败（断网、DNS、CORS 等），提示检查网络
 * - 其他：服务端已经归一化好的中文文案（auth/余额/限流/5xx），直接透传
 */
export function toErrorMessage(err: Error): string {
  if (err.name === 'AbortError') return ''
  if (err instanceof TypeError) return '网络已断开，恢复网络后请重试'
  return err.message || '请求失败，请稍后重试'
}

/**
 * 流式对话的核心逻辑（全项目最值得读的一段代码）。
 *
 * 浏览器 fetch 拿到的不是完整 JSON，而是一个「流」：
 * 需要用 reader 一段段读，按 SSE 格式（data: {...}）切分，
 * 把 delta 拼起来 —— 这就是「打字机效果」的全部秘密。
 *
 * Nuxt 会自动导入 app/composables 下的函数，所以页面里直接调用 useChatStream() 即可。
 */
export function useChatStream() {
  const messages = ref<ChatMessage[]>([])
  const streaming = ref(false)
  const error = ref('')

  // 本次调用的 token 用量（来自上游最后一个 chunk 的 usage 字段）
  const usage = ref<TokenUsage | null>(null)
  // 本次调用耗时（秒）
  const elapsed = ref(0)

  let controller: AbortController | null = null

  async function send(text: string) {
    const input = text.trim()
    if (!input || streaming.value) return

    error.value = ''
    usage.value = null
    elapsed.value = 0
    const startedAt = performance.now()

    messages.value.push({ role: 'user', content: input })

    // 先插一条空的 assistant 占位，边收边填
    // 注意：必须用 reactive 包一层。messages 是响应式数组，push 进去的若是普通对象，
    // 模板渲染时拿到的是它的响应式代理，而下面 assistant.content += delta 改的是原始对象，
    // Vue 追踪不到 → 流式期间页面不刷新，只在流结束时一次性显示（打字机失效）。
    const assistant = reactive<ChatMessage>({ role: 'assistant', content: '' })
    messages.value.push(assistant)

    streaming.value = true
    controller = new AbortController()

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: messages.value.slice(0, -1) }),
        signal: controller.signal
      })

      if (!res.ok) {
        // 服务端返回的是 JSON（h3 的 error 结构），解析后只取人话部分
        const data = (await res.json().catch(() => null)) as {
          statusMessage?: string
          message?: string
        } | null
        throw new Error(data?.statusMessage || data?.message || `请求失败 ${res.status}`)
      }
      if (!res.body) throw new Error('响应体为空')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? '' // 最后一段可能是半行，留到下一轮

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue

          const data = trimmed.slice(5).trim()
          if (data === '[DONE]') continue

          try {
            const json = JSON.parse(data)

            // 开了 stream_options.include_usage 后，最后一个 chunk 的 choices 是空数组，
            // 但会带 usage —— 所以这里和下面取 delta 是两个独立的判断
            if (json?.usage) {
              usage.value = {
                prompt: json.usage.prompt_tokens ?? 0,
                completion: json.usage.completion_tokens ?? 0,
                total: json.usage.total_tokens ?? 0
              }
            }

            const delta: string | undefined = json?.choices?.[0]?.delta?.content
            if (delta) assistant.content += delta
          } catch {
            // 分片不完整时先跳过，下一轮会补齐
          }
        }
      }
    } catch (e: unknown) {
      const err = e as Error
      // 用户主动停止不显示错误（toErrorMessage 返回空串）；其余错误统一翻译成中文
      error.value = toErrorMessage(err)
      // 一个字都没生成就把空的占位气泡删掉，避免页面上留空气泡
      if (!assistant.content) messages.value.pop()
    } finally {
      elapsed.value = (performance.now() - startedAt) / 1000
      streaming.value = false
      controller = null
    }
  }

  function stop() {
    controller?.abort()
  }

  function reset() {
    if (streaming.value) controller?.abort()
    messages.value = []
    error.value = ''
    usage.value = null
    elapsed.value = 0
  }

  return { messages, streaming, error, usage, elapsed, send, stop, reset }
}
