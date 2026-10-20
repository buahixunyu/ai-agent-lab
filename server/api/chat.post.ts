/**
 * POST /api/chat
 *
 * 职责：把浏览器的对话请求转发给 DeepSeek，并把上游的 SSE 流原样透传给前端。
 *
 * 为什么不直接在浏览器里调 DeepSeek？
 * —— API Key 会暴露在浏览器网络面板和打包产物里，等于公开泄露。
 *    服务端做代理是唯一正确做法。
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ messages?: { role: string; content: string }[] }>(event)
  const messages = Array.isArray(body?.messages) ? body.messages : []

  if (messages.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'messages 不能为空' })
  }

  const config = useRuntimeConfig(event)
  const apiKey = config.deepseek.apiKey
  if (!apiKey) {
    throw createError({
      statusCode: 500,
      statusMessage: '缺少 NUXT_DEEPSEEK_API_KEY，请复制 .env.example 为 .env 并填入 Key'
    })
  }

  const upstream = await fetch(`${config.deepseek.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: config.deepseek.model,
      messages,
      stream: true,
      temperature: 0.7,
      stream_options: { include_usage: true }
    })
  })

  if (!upstream.ok || !upstream.body) {
    // 原始错误只写进服务端日志，不要把上游的 JSON（可能带 Key 提示）透给前端
    const detail = await upstream.text().catch(() => '')
    console.error('[api] DeepSeek 调用失败:', upstream.status, detail.slice(0, 300))

    const friendly: Record<number, string> = {
      400: '请求格式有误，请检查消息内容',
      401: 'API Key 无效，请检查 .env 中的 NUXT_DEEPSEEK_API_KEY',
      402: '账户余额不足，请前往 DeepSeek 控制台充值',
      429: '请求太频繁，请稍后再试',
      500: '模型服务异常，请稍后重试',
      503: '模型服务繁忙，请稍后重试'
    }

    throw createError({
      statusCode: upstream.status === 401 ? 401 : 502,
      statusMessage: friendly[upstream.status] ?? `模型服务返回 ${upstream.status}，请稍后重试`
    })
  }

  // 关键响应头：
  // - text/event-stream：告诉浏览器这是 SSE
  // - no-cache / no-transform：防止中间层（Nginx、CDN）缓冲，否则就「不流式」了
  // - X-Accel-Buffering: no：专门针对 Nginx
  setResponseHeaders(event, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  })

  return upstream.body
})
