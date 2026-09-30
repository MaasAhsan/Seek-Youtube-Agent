/* Seek — provider registry, shared by the popup and the background worker.
 * Every provider except Anthropic speaks the OpenAI "chat/completions" dialect.
 * Default models are starting points: free catalogs rotate, so the popup can
 * fetch the live model list ("Load models"). */
(() => {
  const NS = (globalThis.YTA = globalThis.YTA || {});

  NS.PROVIDERS = {
    openrouter: {
      label: 'OpenRouter',
      tag: 'free models',
      type: 'openai',
      base: 'https://openrouter.ai/api/v1',
      model: 'openrouter/free', // router that picks any currently-free model
      keyUrl: 'https://openrouter.ai/keys',
      keyHint: 'sk-or-…',
      note: 'Free models (ids ending in :free) are capped at 20 requests/min, and 50 requests/day until you buy $10+ of credits (then 1,000/day). Seek uses one request per search.',
    },
    nvidia: {
      label: 'NVIDIA NIM',
      tag: 'free',
      type: 'openai',
      base: 'https://integrate.api.nvidia.com/v1',
      model: 'meta/llama-3.3-70b-instruct',
      keyUrl: 'https://build.nvidia.com/settings/api-keys',
      keyHint: 'nvapi-…',
      note: 'Free with an NVIDIA developer account (about 40 requests/min). Use “Load models” to see what your key can call.',
    },
    groq: {
      label: 'Groq',
      tag: 'free tier',
      type: 'openai',
      base: 'https://api.groq.com/openai/v1',
      model: 'llama-3.3-70b-versatile',
      keyUrl: 'https://console.groq.com/keys',
      keyHint: 'gsk_…',
      note: 'Free tier with per-model request and token limits. Very fast.',
    },
    gemini: {
      label: 'Google Gemini',
      tag: 'free tier',
      type: 'openai',
      base: 'https://generativelanguage.googleapis.com/v1beta/openai',
      model: 'gemini-2.5-flash',
      keyUrl: 'https://aistudio.google.com/apikey',
      keyHint: 'AIza…',
      note: 'Free tier from Google AI Studio. Limits depend on your project; check AI Studio.',
    },
    custom: {
      label: 'Custom / local',
      tag: 'OpenAI-compatible',
      type: 'openai',
      base: '',
      model: '',
      keyOptional: true,
      keyHint: 'optional',
      note: 'Any OpenAI-compatible endpoint, for example Ollama at http://localhost:11434/v1 (free, runs on your machine). The browser will ask permission to reach the address.',
    },
    anthropic: {
      label: 'Anthropic',
      tag: 'paid',
      type: 'anthropic',
      base: 'https://api.anthropic.com/v1',
      model: 'claude-sonnet-5-5',
      keyUrl: 'https://console.anthropic.com/',
      keyHint: 'sk-ant-…',
      note: 'Paid API. Best answer quality.',
    },
  };
  NS.DEFAULT_PROVIDER = 'openrouter';
})();
