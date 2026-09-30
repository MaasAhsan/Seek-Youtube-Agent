/* Seek — content script (runs on youtube.com).
 * Watches for search pages, reads the visible results, asks the background
 * worker to run the agent, and renders the conversation in a shadow-DOM panel.
 * The API key never touches this file: all model calls happen in background.js. */
(() => {
  'use strict';
  if (globalThis.__seekBooted) return;
  globalThis.__seekBooted = true;

  const api = globalThis.browser ?? globalThis.chrome;
  const { CSS, renderMarkdown, parseAnswer, parsePicks, AsciiField } = globalThis.YTA;

  const THEMES = ['auto', 'light', 'dark'];
  const CHIPS = ['Explain it simpler', 'Which one is best for a beginner?', 'Give me a shorter version'];

  const state = {
    settings: { theme: 'auto', ascii: true, autoRun: true },
    query: '',
    pending: false, // a query is waiting for the user to open the panel (autoRun off)
    runId: 0,
    busy: false,
    open: false,
    results: [],
    messages: [], // conversation sent to the model (first entry is built by the background worker)
    current: null, // the assistant turn currently streaming
    stick: true, // auto-scroll while the user hasn't scrolled up
    port: null,
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html; // only ever static markup or escaped text
    return n;
  }

  /* ───────────────────────── UI shell ───────────────────────── */

  const ICON = {
    spark: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M12 3l1.9 5.3L19.2 10l-5.3 1.9L12 17.2l-1.9-5.3L4.8 10l5.3-1.7L12 3z"/><path d="M19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7L19 16z"/></svg>',
    theme: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>',
    redo: '<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    up: '<svg class="go" viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
    stop: '<svg class="stop" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
  };

  const host = document.createElement('div');
  host.id = 'seek-host';
  host.style.cssText = 'all:initial;display:none';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>${CSS}</style>
    <div class="root" data-theme="dark">
      <button class="fab" type="button" aria-label="Open Seek" title="Open Seek">${ICON.spark}</button>
      <section class="panel" aria-label="Seek">
        <canvas class="ascii" aria-hidden="true"></canvas>
        <header class="head">
          <div class="brand"><span class="dot"></span><span>Seek</span></div>
          <div class="actions">
            <button class="ibtn" type="button" data-act="theme" title="Theme">${ICON.theme}</button>
            <button class="ibtn" type="button" data-act="rerun" title="Run again">${ICON.redo}</button>
            <button class="ibtn" type="button" data-act="close" title="Close">${ICON.close}</button>
          </div>
        </header>
        <div class="scroll"><div class="thread"></div></div>
        <footer class="foot">
          <div class="chips"></div>
          <div class="composer">
            <textarea rows="1" placeholder="Reply to Seek…" spellcheck="true"></textarea>
            <button class="send" type="button" title="Send">${ICON.up}${ICON.stop}</button>
          </div>
        </footer>
      </section>
    </div>`;

  const $ = (sel) => shadow.querySelector(sel);
  const root = $('.root');
  const fab = $('.fab');
  const panel = $('.panel');
  const scroller = $('.scroll');
  const thread = $('.thread');
  const chips = $('.chips');
  const input = $('textarea');
  const sendBtn = $('.send');
  const canvas = $('.ascii');

  document.documentElement.appendChild(host);

  /* ───────────────────────── theme + background ───────────────────────── */

  function resolvedTheme() {
    const { theme } = state.settings;
    if (theme === 'light' || theme === 'dark') return theme;
    // YouTube marks its own dark mode with a `dark` attribute on <html>.
    return document.documentElement.hasAttribute('dark') ? 'dark' : 'light';
  }
  function applyTheme() {
    root.dataset.theme = resolvedTheme();
    $('[data-act="theme"]').title = `Theme: ${state.settings.theme}`;
  }

  const field = new AsciiField(canvas, () => (root.dataset.theme === 'dark' ? '255,255,255' : '0,0,0'), {
    maxAlpha: 0.1,
    speed: 1.5,
  });
  function syncAscii() {
    canvas.style.display = state.settings.ascii ? '' : 'none';
    if (state.open && state.settings.ascii) field.start();
    else {
      field.stop();
      field.clear();
    }
  }

  new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['dark'] });

  async function loadSettings() {
    try {
      const s = await api.storage.local.get(['theme', 'ascii', 'autoRun']);
      state.settings = {
        theme: THEMES.includes(s.theme) ? s.theme : 'auto',
        ascii: s.ascii !== false,
        autoRun: s.autoRun !== false,
      };
    } catch {
      /* keep defaults */
    }
    applyTheme();
    syncAscii();
  }
  api.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.theme) state.settings.theme = THEMES.includes(changes.theme.newValue) ? changes.theme.newValue : 'auto';
    if (changes.ascii) state.settings.ascii = changes.ascii.newValue !== false;
    if (changes.autoRun) state.settings.autoRun = changes.autoRun.newValue !== false;
    applyTheme();
    syncAscii();
  });

  /* ───────────────────────── open / close ───────────────────────── */

  function setOpen(open, focus = false) {
    state.open = open;
    panel.classList.toggle('open', open);
    fab.hidden = open;
    fab.classList.remove('pulse');
    syncAscii();
    if (open && state.pending) {
      state.pending = false;
      run();
    }
    if (open && focus) setTimeout(() => input.focus({ preventScroll: true }), 380);
  }
  fab.addEventListener('click', () => setOpen(true, true));

  /* ───────────────────────── scraping ───────────────────────── */

  const BOX = 'ytd-video-renderer, yt-lockup-view-model, ytd-compact-video-renderer, ytd-rich-item-renderer, ytd-grid-video-renderer';
  const ADS = 'ytd-ad-slot-renderer, ytd-promoted-sparkles-web-renderer, ytd-display-ad-renderer, ytd-in-feed-ad-layout-renderer';
  const CHANNEL = 'a[href^="/@"], a[href^="/channel/"], a[href^="/c/"], a[href^="/user/"]';

  // Reads the results YouTube has rendered. Layout-agnostic where possible: it
  // anchors on watch links and derives the rest, so a markup tweak degrades
  // gracefully (fewer details) instead of breaking outright.
  function scrapeResults(limit = 20) {
    const scope = document.querySelector('ytd-search') || document.body;
    const byId = new Map();
    for (const a of scope.querySelectorAll('a[href*="/watch?v="]')) {
      const m = /[?&]v=([\w-]{11})/.exec(a.getAttribute('href') || '');
      if (!m) continue;
      const box = a.closest(BOX);
      if (!box || box.closest(ADS)) continue;
      let entry = byId.get(m[1]);
      if (!entry) {
        if (byId.size >= limit) continue;
        entry = { id: m[1], box, anchors: [] };
        byId.set(m[1], entry);
      }
      entry.anchors.push(a);
    }

    const out = [];
    for (const { id, box, anchors } of byId.values()) {
      let title = '';
      for (const a of anchors) {
        const t = clean(a.getAttribute('title'));
        if (t.length > title.length) title = t;
      }
      if (!title) title = clean(box.querySelector('#video-title, h3')?.textContent);
      if (!title) for (const a of anchors) if (clean(a.textContent).length > title.length) title = clean(a.textContent);
      if (!title) continue;

      const channel = clean(box.querySelector(CHANNEL)?.textContent);
      let duration = '';
      const meta = [];
      for (const raw of (box.innerText || '').split('\n')) {
        const ln = clean(raw);
        if (!ln || ln.length > 80 || ln === title || ln === channel || title.includes(ln) || ln.includes(title)) continue;
        if (!duration && /^\d{1,2}(:\d{2}){1,2}$/.test(ln)) {
          duration = ln;
          continue;
        }
        // Views / age lines carry digits in every locale; this drops UI noise like "Add to queue".
        if (/\d/.test(ln) && meta.length < 3 && !meta.includes(ln)) meta.push(ln);
      }
      out.push({
        id,
        title: title.slice(0, 160),
        channel: channel.slice(0, 80),
        meta: meta.join(' · ').slice(0, 120),
        duration,
      });
    }
    return out;
  }

  async function waitForResults(runId) {
    const start = Date.now();
    let last = -1;
    let stableSince = Date.now();
    let res = [];
    while (Date.now() - start < 9000) {
      if (runId !== state.runId) return [];
      res = scrapeResults();
      if (res.length !== last) {
        last = res.length;
        stableSince = Date.now();
      }
      if (res.length >= 3 && Date.now() - stableSince > 700) break;
      await sleep(250);
    }
    return res;
  }

  /* ───────────────────────── rendering ───────────────────────── */

  function nearBottom() {
    return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 90;
  }
  scroller.addEventListener('scroll', () => {
    state.stick = nearBottom();
  });
  function scrollDown() {
    if (state.stick) scroller.scrollTop = scroller.scrollHeight;
  }

  function resetThread(query) {
    thread.textContent = '';
    chips.textContent = '';
    const head = el('div', 'qhead');
    const label = el('div', 'label');
    label.textContent = 'You searched';
    const q = el('div', 'qtext');
    q.textContent = query;
    head.append(label, q);
    thread.append(head);
    state.stick = true;
  }

  function addUserBubble(text) {
    const wrap = el('div', 'msg user');
    const b = el('div', 'bubble');
    b.textContent = text;
    wrap.append(b);
    thread.append(wrap);
    scrollDown();
  }

  const STEP_DEFS = [
    ['scan', 'Reading the results page'],
    ['plan', 'Interpreting your search'],
    ['write', 'Writing the answer'],
  ];

  function addAiBlock(withTrace) {
    const wrap = el('div', 'msg ai');
    const block = { wrap, steps: {}, raw: '', streaming: true, kind: withTrace ? 'first' : 'follow' };
    if (withTrace) {
      const trace = el('div', 'trace');
      for (const [key, label] of STEP_DEFS) {
        const row = el('div', 'step');
        row.append(el('span', 'mark'));
        const txt = el('span', 'txt');
        txt.textContent = label;
        row.append(txt);
        trace.append(row);
        block.steps[key] = { row, txt, label };
      }
      wrap.append(trace);
    }
    block.body = el('div', 'body');
    block.body.append(el('div', 'thinking', '<i></i><i></i><i></i>'));
    block.picks = el('div', 'picks');
    wrap.append(block.body, block.picks);
    thread.append(wrap);
    scrollDown();
    return block;
  }

  function setStep(block, key, status, text) {
    const s = block.steps[key];
    if (!s) return;
    s.row.className = `step ${status}`;
    s.txt.textContent = text || s.label;
  }

  let renderQueued = false;
  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      renderBody(state.current);
    });
  }
  function renderBody(block) {
    if (!block) return;
    const p = parseAnswer(block.raw, block.streaming);
    // The model's first line ("INTERPRETED: …") completes the interpret step.
    if (block.steps.plan && !block.interpDone) {
      if (p.interp) {
        block.interpDone = true;
        setStep(block, 'plan', 'done', `Interpreted as: ${clean(p.interp).slice(0, 140)}`);
        setStep(block, 'write', 'active');
      } else if (!p.pending && block.raw.trim()) {
        block.interpDone = true;
        setStep(block, 'plan', 'done', 'Interpreted your search');
        setStep(block, 'write', 'active');
      }
    }
    let html = renderMarkdown(p.text);
    if (block.streaming && !p.marked) {
      const caret = '<span class="caret"></span>';
      html = /<\/(p|li)>/.test(html)
        ? html.replace(/(<\/(?:p|li)>)(?![\s\S]*<\/(?:p|li)>)/, `${caret}$1`)
        : html + caret;
    }
    if (!p.text.trim() && block.streaming) html = '<div class="thinking"><i></i><i></i><i></i></div>';
    block.body.innerHTML = html;
    if (p.marked && block.streaming && block.steps.write) setStep(block, 'write', 'active', 'Choosing videos from the results');
    scrollDown();
  }

  function pickCard({ item, why }) {
    const a = el('a', 'card');
    a.href = `https://www.youtube.com/watch?v=${item.id}`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    const th = el('div', 'thumb');
    const img = new Image();
    img.loading = 'lazy';
    img.alt = '';
    img.src = `https://i.ytimg.com/vi/${item.id}/mqdefault.jpg`;
    th.append(img);
    if (item.duration) {
      const d = el('span', 'dur');
      d.textContent = item.duration;
      th.append(d);
    }
    const tx = el('div', 'ctext');
    const t = el('div', 'ctitle');
    t.textContent = item.title;
    const m = el('div', 'cmeta');
    m.textContent = [item.channel, item.meta].filter(Boolean).join(' · ');
    tx.append(t, m);
    if (why) {
      const w = el('div', 'cwhy');
      w.textContent = why;
      tx.append(w);
    }
    a.append(th, tx);
    return a;
  }

  function showChips() {
    chips.textContent = '';
    for (const text of CHIPS) {
      const b = el('button', 'chip');
      b.type = 'button';
      b.textContent = text;
      b.addEventListener('click', () => ask(text));
      chips.append(b);
    }
  }

  function setBusy(busy) {
    state.busy = busy;
    root.classList.toggle('busy', busy);
    sendBtn.title = busy ? 'Stop' : 'Send';
    sendBtn.disabled = !busy && !input.value.trim();
    if (busy) chips.textContent = '';
  }

  function showError(block, message, retry) {
    if (block.steps) for (const k in block.steps) if (block.steps[k].row.classList.contains('active')) block.steps[k].row.className = 'step';
    block.streaming = false;
    block.body.textContent = '';
    if (block.raw.trim()) renderBody(block);
    const box = el('div', 'err');
    const p = el('div');
    p.textContent = message;
    box.append(p);
    if (retry) {
      const b = el('button');
      b.type = 'button';
      b.textContent = 'Try again';
      b.addEventListener('click', () => {
        box.remove();
        retry();
      });
      box.append(b);
    }
    block.wrap.append(box);
    setBusy(false);
    scrollDown();
  }

  function showSetup(block) {
    block.streaming = false;
    block.body.innerHTML = '';
    const p = el('div', 'body');
    p.innerHTML =
      '<p><strong>One quick step.</strong> Pick an AI provider and add a free API key so Seek can answer.</p>' +
      '<p>Click the Seek icon in your browser toolbar (it may be under the puzzle-piece menu). OpenRouter and NVIDIA NIM both have free keys. Then run this search again.</p>';
    block.body.replaceWith(p);
    for (const k in block.steps) block.steps[k].row.className = 'step';
    setBusy(false);
  }

  /* ───────────────────────── agent connection ───────────────────────── */

  const STALE = 'Seek was updated or reloaded. Refresh this page to reconnect.';

  function getPort() {
    if (state.port) return state.port;
    const port = api.runtime.connect({ name: 'seek' });
    port.onMessage.addListener(onBgMessage);
    port.onDisconnect.addListener(() => {
      void api.runtime.lastError;
      state.port = null;
      if (state.busy && state.current) showError(state.current, 'The connection to the extension was interrupted.', retryCurrent);
    });
    state.port = port;
    return port;
  }
  function post(msg) {
    try {
      getPort().postMessage(msg);
      return true;
    } catch {
      if (state.current) showError(state.current, STALE);
      return false;
    }
  }

  function onBgMessage(msg) {
    if (!msg || msg.id !== state.runId || !state.current) return;
    const block = state.current;
    switch (msg.type) {
      case 'plan':
        state.messages = [{ role: 'user', content: msg.userMessage }];
        break;
      case 'delta':
        block.raw += msg.text;
        scheduleRender();
        break;
      case 'done':
        finish(block);
        break;
      case 'error':
        if (block.kind === 'follow') state.messages.pop();
        showError(block, msg.message, retryCurrent);
        break;
    }
  }

  function finish(block) {
    block.streaming = false;
    const { text, picksRaw } = parseAnswer(block.raw, false);
    if (!text) {
      if (block.kind === 'follow') state.messages.pop();
      showError(block, 'The model returned an empty answer.', retryCurrent);
      return;
    }
    renderBody(block);
    const picks = parsePicks(picksRaw, state.results);
    for (const p of picks) block.picks.append(pickCard(p));
    if (block.steps.write) setStep(block, 'write', 'done', picks.length ? `Answer ready · ${picks.length} picks` : 'Answer ready');
    state.messages.push({ role: 'assistant', content: block.raw.trim() });
    setBusy(false);
    showChips();
    scrollDown();
  }

  /* ───────────────────────── flows ───────────────────────── */

  function abortRun() {
    state.runId++; // invalidate any in-flight messages
    if (state.port) {
      try {
        state.port.postMessage({ type: 'abort' });
      } catch {
        /* port already gone */
      }
    }
  }

  async function run() {
    abortRun();
    const id = state.runId;
    const query = state.query;
    if (!query) return;
    resetThread(query);
    state.messages = [];
    state.results = [];
    setBusy(true);
    const block = addAiBlock(true);
    state.current = block;
    setStep(block, 'scan', 'active');

    try {
      const status = await api.runtime.sendMessage({ type: 'status' });
      if (id !== state.runId) return;
      if (!status || !status.ready) return showSetup(block);
    } catch {
      return showError(block, STALE);
    }

    await sleep(350); // let YouTube finish painting the new results
    const results = await waitForResults(id);
    if (id !== state.runId) return;
    state.results = results;
    setStep(block, 'scan', 'done', results.length ? `Read ${results.length} results` : 'No results readable, answering without picks');
    setStep(block, 'plan', 'active');
    post({ type: 'start', id, query, results });
  }

  function ask(text) {
    text = (text || '').trim();
    if (!text || state.busy || !state.messages.length) return;
    input.value = '';
    autoGrow();
    abortRun();
    const id = state.runId;
    addUserBubble(text);
    state.messages.push({ role: 'user', content: text });
    const block = addAiBlock(false);
    block.text = text;
    state.current = block;
    state.stick = true;
    setBusy(true);
    post({ type: 'followup', id, messages: state.messages });
  }

  function retryCurrent() {
    const block = state.current;
    if (!block) return;
    if (block.kind === 'first') run();
    else {
      // Drop the failed turn (and its user bubble); ask() re-adds both. Also drop the
      // dangling user message so the conversation never gets two user turns in a row.
      if (state.messages.at(-1)?.role === 'user') state.messages.pop();
      block.wrap.previousElementSibling?.remove();
      block.wrap.remove();
      ask(block.text);
    }
  }

  function stop() {
    if (!state.busy || !state.current) return;
    const block = state.current;
    abortRun();
    block.streaming = false;
    if (block.raw.trim()) {
      renderBody(block);
      state.messages.push({ role: 'assistant', content: block.raw.trim() });
    } else {
      block.body.textContent = 'Stopped.';
      if (block.kind === 'follow') state.messages.pop();
    }
    for (const k in block.steps) if (block.steps[k].row.classList.contains('active')) block.steps[k].row.className = 'step';
    setBusy(false);
    if (state.messages.length) showChips();
  }

  /* ───────────────────────── composer + header ───────────────────────── */

  function autoGrow() {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  }
  input.addEventListener('input', () => {
    autoGrow();
    if (!state.busy) sendBtn.disabled = !input.value.trim();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      ask(input.value);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  });
  sendBtn.addEventListener('click', () => (state.busy ? stop() : ask(input.value)));

  // YouTube binds single-key shortcuts (k, f, m, /, …). Keep typing inside the panel private.
  for (const type of ['keydown', 'keyup', 'keypress']) host.addEventListener(type, (e) => e.stopPropagation());

  shadow.querySelector('.actions').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'close') setOpen(false);
    else if (act === 'rerun') run();
    else if (act === 'theme') {
      const next = THEMES[(THEMES.indexOf(state.settings.theme) + 1) % THEMES.length];
      state.settings.theme = next;
      applyTheme();
      try {
        await api.storage.local.set({ theme: next });
      } catch {
        /* non-fatal */
      }
    }
  });

  /* ───────────────────────── page lifecycle ───────────────────────── */

  function onResultsPage(query) {
    host.style.display = '';
    state.query = query;
    abortRun();
    setBusy(false);
    state.messages = [];
    resetThread(query);
    if (state.settings.autoRun) {
      setOpen(true);
      if (!state.pending) run();
    } else {
      state.pending = true;
      fab.classList.add('pulse');
      if (state.open) {
        state.pending = false;
        run();
      }
    }
  }

  function onLeaveResults() {
    abortRun();
    setBusy(false);
    state.pending = false;
    state.messages = [];
    setOpen(false);
    host.style.display = 'none';
  }

  let lastKey = '';
  function checkLocation() {
    let u;
    try {
      u = new URL(location.href);
    } catch {
      return;
    }
    const q = clean(u.searchParams.get('search_query'));
    if (u.pathname === '/results' && q) {
      if (q !== lastKey) {
        lastKey = q;
        onResultsPage(q);
      }
    } else if (lastKey) {
      lastKey = '';
      onLeaveResults();
    }
  }

  (async () => {
    await loadSettings();
    // YouTube is a single-page app: react to its navigation event, with a cheap poll as a safety net.
    document.addEventListener('yt-navigate-finish', checkLocation, true);
    window.addEventListener('popstate', () => setTimeout(checkLocation, 300));
    setInterval(checkLocation, 1000);
    checkLocation();
  })();
})();
