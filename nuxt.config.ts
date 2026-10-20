export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  // 全局样式
  css: ['~/assets/css/main.css'],

  // runtimeConfig 可以在运行时用 NUXT_ 开头的环境变量覆盖，
  // 这样 Docker 部署时不用重新构建。
  runtimeConfig: {
    deepseek: {
      apiKey: '', // NUXT_DEEPSEEK_API_KEY
      baseUrl: 'https://api.deepseek.com', // NUXT_DEEPSEEK_BASE_URL
      model: 'deepseek-chat' // NUXT_DEEPSEEK_MODEL
    }
  },

  app: {
    head: {
      title: 'AI Agent Lab',
      htmlAttrs: { lang: 'zh-CN' },
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1.0, viewport-fit=cover' },
        { name: 'description', content: '基于 Nuxt + Vue 3 + DeepSeek 的流式 AI 对话应用' }
      ]
    }
  }
})
