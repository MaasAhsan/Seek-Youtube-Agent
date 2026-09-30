# Seek: an AI agent for YouTube search

Search on YouTube and a panel opens beside the results. It works with **free API keys** (OpenRouter, NVIDIA NIM, Groq, Google Gemini), a local model (Ollama), or paid Anthropic. Seek reads your query, rewrites it into a clear request,
reads the results on the page, then streams an answer and picks videos **from those real results**. You can reply
to it with follow-ups. The panel has an animated, monochrome ASCII background and follows YouTube's light/dark theme.

## Install (no build needed, `dist/` is pre-built)

**Chrome / Edge / Brave / Opera**
1. Open `chrome://extensions` (or `edge://extensions`), turn on *Developer mode*.
2. *Load unpacked* and choose `dist/chromium`.

**Firefox** (128+)
1. Open `about:debugging#/runtime/this-firefox` and choose *Load Temporary Add-on*.
2. Select `dist/firefox/manifest.json`.
3. If nothing appears on YouTube, open `about:addons` > Seek > *Permissions* and allow access to youtube.com.

**Safari** (untested here): needs macOS + Xcode.
`xcrun safari-web-extension-converter dist/chromium`, then build and enable it in Safari settings.

## Use
1. Click the Seek toolbar icon and pick a provider. Use *Get a free key* to open its key page, paste the key, press *Test connection*.
2. Search anything on youtube.com.

| Provider | Cost | Key from | Notes (from provider docs, Sep 2026; limits change) |
|---|---|---|---|
| OpenRouter | free `:free` models | openrouter.ai/keys | Default model `openrouter/free` picks any free model. 20 req/min; **50 req/day** until you buy $10+ credits (then 1,000/day). |
| NVIDIA NIM | free dev account | build.nvidia.com/settings/api-keys | About 40 req/min. Key starts `nvapi-`. |
| Groq | free tier | console.groq.com/keys | Per-model request and token limits. |
| Google Gemini | free tier | aistudio.google.com/apikey | Limits depend on your project. |
| Custom / local | free | none | Any OpenAI-compatible URL, e.g. Ollama `http://localhost:11434/v1`. The browser asks permission for that one address. |
| Anthropic | paid | console.anthropic.com | Highest answer quality. |

Free model catalogs rotate. If a default model stops working, press **Load models** in the popup to list what your key can call
(OpenRouter's free ones are sorted first) and pick one.

Other settings: theme (auto/light/dark), ASCII background on/off, run automatically on/off.
If auto-run is off, a floating button appears and the agent runs when you open it.

## How it works
- `content/content.js` detects YouTube search pages (it handles YouTube's single-page navigation), scrapes titles,
  channels and metadata, and renders the panel in a shadow root.
- `background/background.js` holds the API keys and makes every model call, **one request per search** (important for free
  daily limits). The model's first line restates your search (`INTERPRETED: …`, shown in the panel's trace), then it streams
  the answer and a JSON list of picks (indices into the real result list). Picks are validated against the scraped list, so it
  cannot surface a video that wasn't on the page. Reasoning tokens (`reasoning` fields and inline `<think>` blocks) are stripped.
- `shared/providers.js` is the provider registry (base URLs, default models, notes).
- `shared/ascii.js` draws the animated background (respects the OS "reduce motion" setting by drawing a still frame).

## Build
`node build.mjs` produces `dist/chromium` (MV3 service worker) and `dist/firefox` (MV3 background script).

## Known limits (read these)
- **The model can't watch videos.** It judges only titles, channels and metadata. Picks are relevance guesses.
- **YouTube's markup changes.** The scraper anchors on watch links and degrades gracefully, but it was tested
  against a simulated page, not the live site. If results aren't detected, the answer still works without picks.
- **Free tiers are small and shaky.** OpenRouter's unfunded free tier is 50 requests/day; free models can be busy or vanish. Turn off auto-run to save requests. Small free models may ignore the reply format; the panel still shows their answer, just without picks.
- **Privacy:** the query and visible result titles are sent to the provider you choose (free providers may log or train on prompts; check their terms). Keys live in local extension storage.
- Firefox store submission may require extra manifest fields (e.g. data-collection declarations). Check current AMO rules.
- Chrome Web Store: needs a privacy policy and permission justifications before publishing.

- Custom endpoints rely on `optional_host_permissions`; Firefox support for that key and Ollama's CORS/origin rules were not verified here.

## Tests
`cd test && npm i && node logic.test.mjs && node content.test.mjs`
