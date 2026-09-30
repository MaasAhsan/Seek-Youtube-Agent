/* Seek — toolbar popup: provider, key, model, appearance. */
(async () => {
  'use strict';
  const api = globalThis.browser ?? globalThis.chrome;
  const { AsciiField, PROVIDERS, DEFAULT_PROVIDER } = globalThis.YTA;
  const $ = (id) => document.getElementById(id);

  const dark = matchMedia('(prefers-color-scheme: dark)');
  let s = { provider: DEFAULT_PROVIDER, apiKeys: {}, models: {}, baseUrl: '', theme: 'auto', ascii: true, autoRun: true };

  const field = new AsciiField(
    $('ascii'),
    () => (document.documentElement.dataset.theme === 'dark' ? '255,255,255' : '0,0,0'),
    { maxAlpha: 0.09, speed: 1.5 }
  );
  function applyTheme() {
    document.documentElement.dataset.theme = s.theme === 'auto' ? (dark.matches ? 'dark' : 'light') : s.theme;
    field.draw();
  }
  function applyAscii() {
    $('ascii').style.display = s.ascii ? '' : 'none';
    if (s.ascii) field.start();
    else {
      field.stop();
      field.clear();
    }
  }
  dark.addEventListener('change', applyTheme);

  /* ── load (with migration from the v0.1 Anthropic-only settings) ── */
  try {
    const st = await api.storage.local.get(['provider', 'apiKeys', 'models', 'baseUrl', 'theme', 'ascii', 'autoRun', 'apiKey', 'model']);
    s.apiKeys = { ...(st.apiKeys || {}) };
    s.models = { ...(st.models || {}) };
    if (st.apiKey && !s.apiKeys.anthropic) s.apiKeys.anthropic = st.apiKey;
    if (st.model && !s.models.anthropic) s.models.anthropic = st.model;
    s.provider = PROVIDERS[st.provider] ? st.provider : st.apiKey ? 'anthropic' : DEFAULT_PROVIDER;
    s.baseUrl = st.baseUrl || '';
    s.theme = ['auto', 'light', 'dark'].includes(st.theme) ? st.theme : 'auto';
    s.ascii = st.ascii !== false;
    s.autoRun = st.autoRun !== false;
  } catch {
    /* defaults */
  }

  /* ── provider UI ── */
  for (const [id, p] of Object.entries(PROVIDERS)) {
    const o = document.createElement('option');
    o.value = id;
    o.textContent = `${p.label} · ${p.tag}`;
    $('provider').append(o);
  }

  function renderProvider() {
    const p = PROVIDERS[s.provider];
    $('provider').value = s.provider;
    $('apiKey').value = s.apiKeys[s.provider] || '';
    $('apiKey').placeholder = p.keyHint || '';
    $('model').value = s.models[s.provider] || '';
    $('model').placeholder = p.model || 'model name';
    $('baseRow').hidden = s.provider !== 'custom';
    $('baseUrl').value = s.baseUrl;
    const link = $('keyLink');
    link.hidden = !p.keyUrl;
    if (p.keyUrl) {
      link.href = p.keyUrl;
      link.textContent = p.tag === 'paid' ? 'Get a key ↗' : 'Get a free key ↗';
    }
    $('note').textContent = p.note || '';
    $('models').textContent = '';
    $('testResult').textContent = '';
  }

  /* ── saving ── */
  let savedTimer = 0;
  let saveTimer = 0;
  const pending = {};
  function flashSaved(text = 'Saved') {
    const n = $('saved');
    n.textContent = text;
    n.classList.add('on');
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => n.classList.remove('on'), 1200);
  }
  function save(patch) {
    Object.assign(pending, patch);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const out = { ...pending };
      for (const k of Object.keys(pending)) delete pending[k];
      try {
        await api.storage.local.set(out);
        flashSaved();
      } catch {
        flashSaved('Could not save');
      }
    }, 250);
  }

  $('provider').addEventListener('change', (e) => {
    s.provider = e.target.value;
    save({ provider: s.provider });
    renderProvider();
  });
  $('apiKey').addEventListener('input', (e) => {
    s.apiKeys[s.provider] = e.target.value.trim();
    save({ apiKeys: s.apiKeys });
  });
  $('model').addEventListener('input', (e) => {
    s.models[s.provider] = e.target.value.trim();
    save({ models: s.models });
  });
  $('baseUrl').addEventListener('input', (e) => {
    s.baseUrl = e.target.value.trim();
    save({ baseUrl: s.baseUrl });
  });
  $('asciiToggle').addEventListener('change', (e) => {
    s.ascii = e.target.checked;
    save({ ascii: s.ascii });
    applyAscii();
  });
  $('autoRun').addEventListener('change', (e) => {
    s.autoRun = e.target.checked;
    save({ autoRun: s.autoRun });
  });
  for (const r of document.querySelectorAll('input[name="theme"]')) {
    r.addEventListener('change', () => {
      if (!r.checked) return;
      s.theme = r.value;
      save({ theme: r.value });
      applyTheme();
    });
  }
  $('reveal').addEventListener('click', () => {
    const i = $('apiKey');
    const show = i.type === 'password';
    i.type = show ? 'text' : 'password';
    $('reveal').textContent = show ? 'Hide' : 'Show';
  });

  /* ── actions ── */
  // Custom endpoints aren't in the manifest's fixed host list, so ask for that one origin.
  async function ensureHost() {
    if (s.provider !== 'custom') return null;
    let origin;
    try {
      origin = `${new URL(s.baseUrl).origin}/*`;
    } catch {
      return 'Enter a valid base URL first (for example http://localhost:11434/v1).';
    }
    try {
      if (await api.permissions.contains({ origins: [origin] })) return null;
      return (await api.permissions.request({ origins: [origin] })) ? null : 'Permission to reach that address was not granted.';
    } catch {
      return 'Could not request permission for that address.';
    }
  }
  const overrides = () => ({
    provider: s.provider,
    apiKey: $('apiKey').value.trim(),
    model: $('model').value.trim(),
    baseUrl: $('baseUrl').value.trim(),
  });

  $('test').addEventListener('click', async () => {
    const btn = $('test');
    const out = $('testResult');
    btn.disabled = true;
    out.textContent = 'Testing…';
    try {
      const denied = await ensureHost();
      if (denied) return void (out.textContent = denied);
      const res = await api.runtime.sendMessage({ type: 'test', ...overrides() });
      out.textContent = res?.ok ? `Connected ✓ ${res.model || ''}`.trim() : res?.error || 'Could not connect.';
    } catch {
      out.textContent = 'Could not reach the extension worker. Try again.';
    } finally {
      btn.disabled = false;
    }
  });

  $('loadModels').addEventListener('click', async () => {
    const btn = $('loadModels');
    const out = $('testResult');
    btn.disabled = true;
    out.textContent = 'Loading models…';
    try {
      const denied = await ensureHost();
      if (denied) return void (out.textContent = denied);
      const res = await api.runtime.sendMessage({ type: 'models', ...overrides() });
      if (!res?.ok) return void (out.textContent = res?.error || 'Could not load models.');
      const list = $('models');
      list.textContent = '';
      for (const m of res.models) {
        const o = document.createElement('option');
        o.value = m.id;
        if (m.free) o.label = `${m.id} (free)`;
        list.append(o);
      }
      const free = res.models.filter((m) => m.free).length;
      out.textContent = `${res.models.length} models loaded${free ? `, ${free} free` : ''}. Click the model field to pick one.`;
    } catch {
      out.textContent = 'Could not reach the extension worker. Try again.';
    } finally {
      btn.disabled = false;
    }
  });

  /* ── init ── */
  renderProvider();
  $('asciiToggle').checked = s.ascii;
  $('autoRun').checked = s.autoRun;
  for (const r of document.querySelectorAll('input[name="theme"]')) r.checked = r.value === s.theme;
  applyTheme();
  applyAscii();
})();
