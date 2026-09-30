// Builds one codebase into per-browser folders under dist/.
//   node build.mjs   ->  dist/chromium (Chrome, Edge, Brave, Opera)  +  dist/firefox
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(root, 'src');
const dist = path.join(root, 'dist');

const icons = { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' };

const base = {
  manifest_version: 3,
  name: 'Seek: AI for YouTube search',
  short_name: 'Seek',
  version: '0.2.0',
  description: 'An agent for your YouTube searches. It reads the query, answers it, and picks videos from the real results. Works with free API keys (OpenRouter, NVIDIA NIM, Groq, Gemini) or your own endpoint.',
  icons,
  action: { default_title: 'Seek settings', default_popup: 'popup/popup.html', default_icon: icons },
  permissions: ['storage'],
  host_permissions: [
    'https://www.youtube.com/*',
    'https://openrouter.ai/*',
    'https://integrate.api.nvidia.com/*',
    'https://api.groq.com/*',
    'https://generativelanguage.googleapis.com/*',
    'https://api.anthropic.com/*',
  ],
  // Custom / local endpoints (e.g. Ollama): the popup asks for exactly one origin at a time.
  optional_host_permissions: ['http://*/*', 'https://*/*'],
  content_scripts: [
    {
      matches: ['https://www.youtube.com/*'],
      js: ['shared/ascii.js', 'content/text.js', 'content/styles.js', 'content/content.js'],
      run_at: 'document_idle',
    },
  ],
};

const targets = {
  chromium: {
    ...base,
    minimum_chrome_version: '110',
    background: { service_worker: 'background/background.js' },
  },
  firefox: {
    ...base,
    background: { scripts: ['shared/providers.js', 'background/background.js'] },
    browser_specific_settings: { gecko: { id: 'seek@local.dev', strict_min_version: '128.0' } },
  },
};

await rm(dist, { recursive: true, force: true });
for (const [name, manifest] of Object.entries(targets)) {
  const out = path.join(dist, name);
  await mkdir(out, { recursive: true });
  await cp(src, out, { recursive: true });
  await writeFile(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log('built', path.relative(root, out));
}
