import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const load = (f) => vm.runInThisContext(readFileSync('../src/' + f, 'utf8'));

// ───────────── text.js ─────────────
globalThis.YTA = {};
load('content/text.js');
const { renderMarkdown, splitPicks, streamVisible, parsePicks, parseAnswer } = globalThis.YTA;

assert.equal(renderMarkdown('a <script>x</script> **b**'), '<p>a &lt;script&gt;x&lt;/script&gt; <strong>b</strong></p>');
assert.match(renderMarkdown('- one\n- two\n\n1. a\n2. b'), /<ul><li>one<\/li><li>two<\/li><\/ul><ol><li>a<\/li><li>b<\/li><\/ol>/);
assert.equal(streamVisible('Hello <<<PI').text, 'Hello ');
const results = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const raw = 'Answer.\n<<<PICKS>>>\n```json\n[{"i":2,"why":"fits"},{"i":2,"why":"dup"},{"i":9,"why":"bad"},{"i":0,"why":"ok"}]\n```';
assert.deepEqual(parsePicks(splitPicks(raw).picksRaw, results).map((p) => p.item.id), ['c', 'a']);

// parseAnswer: streaming states
assert.equal(parseAnswer('', true).pending, true);
assert.equal(parseAnswer('INTER', true).pending, true);
assert.equal(parseAnswer('INTERPRETED: They want to', true).pending, true);
let p = parseAnswer('INTERPRETED: They want X.\n\nUse a **starter**. <<<PI', true);
assert.equal(p.interp, 'They want X.'); assert.equal(p.text, 'Use a **starter**. '); assert.equal(p.marked, false);
p = parseAnswer('INTERPRETED: They want X.\n\nAnswer.\n<<<PICKS>>>\n[{"i":1,"why":"y"}]', false);
assert.equal(p.text, 'Answer.'); assert.match(p.picksRaw, /"i":1/);
// small model ignores the format: whole reply is the answer
p = parseAnswer('Just an answer with no header.', true);
assert.equal(p.interp, null); assert.equal(p.pending, false); assert.equal(p.text, 'Just an answer with no header.');
p = parseAnswer('interpreted:   lowercase works\nbody', false);
assert.equal(p.interp, 'lowercase works'); assert.equal(p.text, 'body');
console.log('text.js ok');

// ───────────── background.js ─────────────
let onConnect, onMessage;
const store = {};
globalThis.chrome = {
  runtime: { id: 'me', onInstalled: { addListener() {} }, onConnect: { addListener: (f) => (onConnect = f) }, onMessage: { addListener: (f) => (onMessage = f) }, lastError: null },
  storage: { local: { get: async () => ({ ...store }), setAccessLevel: async () => {} } },
};
load('shared/providers.js');
const enc = new TextEncoder();
const sse = (lines) => new ReadableStream({ start(c) { for (const l of lines) c.enqueue(enc.encode(l)); c.close(); } });
const oai = (o) => `data: ${JSON.stringify(o)}\r\n\r\n`;
const delta = (content, extra = {}) => oai({ choices: [{ delta: { content, ...extra } }] });
const calls = [];
let handler = async () => new Response('{}', { status: 500 });
globalThis.fetch = async (url, init) => { calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null }); return handler(url, init); };
load('background/background.js');

const sent = [];
let cb;
onConnect({ name: 'seek', sender: { id: 'me' }, postMessage: (m) => sent.push(m), onMessage: { addListener: (f) => (cb = f) }, onDisconnect: { addListener() {} } });
const reset = () => { sent.length = 0; calls.length = 0; };
const START = { type: 'start', id: 1, query: 'sourdough', results: [{ title: 'T0', channel: 'C', meta: '1M views', duration: '10:00' }, { title: 'T1', channel: 'D' }] };
const text = () => sent.filter((m) => m.type === 'delta').map((m) => m.text).join('');

// status: nothing configured -> not ready; default provider is openrouter
assert.deepEqual(await onMessage({ type: 'status' }, { id: 'me' }), { ready: false });
assert.equal(onMessage({ type: 'status' }, { id: 'evil' }), undefined);

// 1) OpenRouter, streaming, reasoning fields + inline <think> split across chunks + SSE comments
store.apiKeys = { openrouter: 'sk-or-test' };
assert.deepEqual(await onMessage({ type: 'status' }, { id: 'me' }), { ready: true });
handler = async () => new Response(sse([
  ': OPENROUTER PROCESSING\r\n\r\n',
  oai({ choices: [{ delta: { role: 'assistant', content: '', reasoning: 'hmm let me think' } }] }),
  delta('<thi'), delta('nk>secret reasoning</th'), delta('ink>INTERPRETED: They want bread.\n\nUse a starter. <<<PI'),
  delta('CKS>>>\n[{"i":1,"why":"clear"}]'),
  'data: [DONE]\r\n\r\n',
]), { status: 200 });
await cb(START);
assert.equal(calls[0].url, 'https://openrouter.ai/api/v1/chat/completions');
assert.equal(calls[0].init.headers.authorization, 'Bearer sk-or-test');
assert.equal(calls[0].body.model, 'openrouter/free');
assert.equal(calls[0].body.stream, true);
assert.equal(calls[0].body.messages[0].role, 'system');
assert.equal(calls[0].body.messages[1].role, 'user');
assert.equal(calls.length, 1, 'exactly one request per search');
assert.equal(sent[0].type, 'plan');
assert.match(sent[0].userMessage, /^1 \| T1 \| D \| no details$/m);
assert.match(sent[0].userMessage, /^0 \| T0 \| C \| 10:00 · 1M views$/m);
assert.equal(text(), 'INTERPRETED: They want bread.\n\nUse a starter. <<<PICKS>>>\n[{"i":1,"why":"clear"}]');
assert.ok(!text().includes('secret'));
assert.equal(sent.at(-1).type, 'done');

// follow-up keeps history, no plan message
reset();
handler = async () => new Response(sse([delta('Simpler: feed it daily.'), 'data: [DONE]\r\n\r\n']), { status: 200 });
await cb({ type: 'followup', id: 2, messages: [{ role: 'user', content: 'ctx' }, { role: 'assistant', content: 'a' }, { role: 'user', content: 'simpler?' }] });
assert.equal(calls[0].body.messages.length, 4); // system + 3
assert.equal(sent[0].type, 'delta');

// 2) NVIDIA with a {detail} 429 body
reset();
store.provider = 'nvidia'; store.apiKeys.nvidia = 'nvapi-x';
handler = async () => new Response(JSON.stringify({ detail: 'Too Many Requests' }), { status: 429 });
await cb(START);
assert.equal(calls[0].url, 'https://integrate.api.nvidia.com/v1/chat/completions');
assert.equal(calls[0].body.model, 'meta/llama-3.3-70b-instruct');
assert.equal(sent.at(-1).type, 'error');
assert.match(sent.at(-1).message, /NVIDIA NIM rate limit/);

// 3) OpenRouter 402 and 401 wording
reset();
store.provider = 'openrouter';
handler = async () => new Response(JSON.stringify({ error: { message: 'Insufficient credits' } }), { status: 402 });
await cb(START);
assert.match(sent.at(-1).message, /no usable credit/);
reset();
handler = async () => new Response(JSON.stringify({ error: { message: 'No auth credentials found' } }), { status: 401 });
await cb(START);
assert.match(sent.at(-1).message, /OpenRouter rejected the API key/);

// 4) mid-stream provider error object
reset();
handler = async () => new Response(sse([delta('Partial'), oai({ error: { code: 429, message: 'Provider returned error' } })]), { status: 200 });
await cb(START);
assert.equal(sent.at(-1).type, 'error');
assert.match(sent.at(-1).message, /rate limit/);

// 5) Anthropic (legacy v0.1 storage migrates), different dialect
reset();
for (const k of Object.keys(store)) delete store[k];
store.apiKey = 'sk-ant-legacy';
assert.deepEqual(await onMessage({ type: 'status' }, { id: 'me' }), { ready: true });
const ev = (o) => `event: x\r\ndata: ${JSON.stringify(o)}\r\n\r\n`;
handler = async () => new Response(sse([ev({ type: 'message_start' }), ev({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hi <think>not stripped for anthropic</think>' } }), ev({ type: 'message_stop' })]), { status: 200 });
await cb(START);
assert.equal(calls[0].url, 'https://api.anthropic.com/v1/messages');
assert.equal(calls[0].init.headers['x-api-key'], 'sk-ant-legacy');
assert.equal(calls[0].body.model, 'claude-sonnet-5-5');
assert.equal(calls[0].body.system.includes('INTERPRETED'), true);
assert.equal(calls[0].body.messages[0].role, 'user');
assert.equal(text(), 'Hi <think>not stripped for anthropic</think>');

// 6) custom/local provider: ready without a key, hits the given base URL (trailing slash trimmed)
reset();
for (const k of Object.keys(store)) delete store[k];
store.provider = 'custom'; store.baseUrl = 'http://localhost:11434/v1/'; store.models = { custom: 'llama3.2' };
assert.deepEqual(await onMessage({ type: 'status' }, { id: 'me' }), { ready: true });
handler = async () => new Response(sse([delta('ok'), 'data: [DONE]\r\n\r\n']), { status: 200 });
await cb(START);
assert.equal(calls[0].url, 'http://localhost:11434/v1/chat/completions');
assert.equal(calls[0].init.headers.authorization, undefined);
assert.equal(calls[0].body.model, 'llama3.2');
store.baseUrl = '';
assert.deepEqual(await onMessage({ type: 'status' }, { id: 'me' }), { ready: false });

// 7) test connection with unsaved overrides
reset();
for (const k of Object.keys(store)) delete store[k];
handler = async () => new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }), { status: 200 });
let r = await onMessage({ type: 'test', provider: 'groq', apiKey: 'gsk_x', model: '' }, { id: 'me' });
assert.equal(r.ok, true);
assert.equal(calls[0].url, 'https://api.groq.com/openai/v1/chat/completions');
assert.equal(calls[0].body.model, 'llama-3.3-70b-versatile');
assert.equal(calls[0].body.stream, undefined);
r = await onMessage({ type: 'test', provider: 'groq', apiKey: '' }, { id: 'me' });
assert.equal(r.ok, false);

// 8) model listing: OpenRouter (pricing + :free, unauthenticated ok) and Gemini ('models/' prefix)
reset();
handler = async () => new Response(JSON.stringify({ data: [
  { id: 'vendor/paid-model', pricing: { prompt: '0.000001', completion: '0.000002' } },
  { id: 'vendor/zero-price', pricing: { prompt: '0', completion: '0' } },
  { id: 'vendor/x:free', pricing: { prompt: '0', completion: '0' } },
  { id: 'openai/text-embedding-3-small' },
] }), { status: 200 });
r = await onMessage({ type: 'models', provider: 'openrouter', apiKey: '' }, { id: 'me' });
assert.equal(r.ok, true);
assert.equal(calls[0].url, 'https://openrouter.ai/api/v1/models');
assert.equal(calls[0].init.headers.authorization, undefined);
assert.deepEqual(r.models.map((m) => [m.id, m.free]), [['vendor/x:free', true], ['vendor/zero-price', true], ['vendor/paid-model', false]]);
handler = async () => new Response(JSON.stringify({ data: [{ id: 'models/gemini-2.5-flash' }, { id: 'models/text-embedding-004' }] }), { status: 200 });
r = await onMessage({ type: 'models', provider: 'gemini', apiKey: 'AIza' }, { id: 'me' });
assert.deepEqual(r.models.map((m) => m.id), ['gemini-2.5-flash']);
r = await onMessage({ type: 'models', provider: 'nvidia', apiKey: '' }, { id: 'me' });
assert.equal(r.ok, false);

console.log('background.js ok');
