import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const html = `<html dark><body><ytd-search><div id="contents">
 ${[['aaaaaaaaaaa','Sourdough for beginners','Bake Lab','12:03','1.2M views','2 years ago'],
    ['bbbbbbbbbbb','Advanced starter tips','Crumb TV','8:10','90K views','1 month ago'],
    ['ccccccccccc','Sourdough troubleshooting','Loaf Doctor','15:00','300K views','3 weeks ago']]
  .map(([id,t,ch,d,v,a])=>`<ytd-video-renderer>
    <a href="/watch?v=${id}"><span>${d}</span></a>
    <a id="video-title" href="/watch?v=${id}" title="${t}">${t}</a>
    <ytd-channel-name><a href="/@${ch.replace(/ /g,'')}">${ch}</a></ytd-channel-name>
    <div>${v}</div><div>${a}</div><div>Add to queue</div></ytd-video-renderer>`).join('')}
 <ytd-ad-slot-renderer><ytd-video-renderer><a href="/watch?v=zzzzzzzzzzz" title="AD">AD</a></ytd-video-renderer></ytd-ad-slot-renderer>
</div></ytd-search></body></html>`;

const dom = new JSDOM(html, { url: 'https://www.youtube.com/results?search_query=sourdough', runScripts: 'outside-only', pretendToBeVisual: true });
const w = dom.window;
// jsdom gaps: innerText, ResizeObserver, canvas
Object.defineProperty(w.HTMLElement.prototype, 'innerText', { get() { return [...this.querySelectorAll('*')].filter(e=>!e.children.length).map(e=>e.textContent).join('\n'); } });
w.ResizeObserver = class { observe(){} disconnect(){} };
const noop = () => {};
w.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: () => noop, set: () => true });
w.matchMedia = () => ({ matches: false, addEventListener: noop });

const store = { theme: 'auto', ascii: true, autoRun: true };
const sentPort = [];
let portCb;
w.chrome = {
  runtime: {
    id: 'me', lastError: null,
    sendMessage: async (m) => (m.type === 'status' ? { ready: true } : {}),
    connect: () => ({ postMessage: m => { sentPort.push(m); }, onMessage: { addListener: f => (portCb = f) }, onDisconnect: { addListener: noop } }),
  },
  storage: { local: { get: async () => store, set: async () => {} }, onChanged: { addListener: noop } },
};
for (const f of ['shared/ascii.js','content/text.js','content/styles.js','content/content.js'])
  w.eval(readFileSync('../src/' + f, 'utf8'));

const host = w.document.getElementById('seek-host');
assert.ok(host, 'host injected');
const sh = host.shadowRoot;
await new Promise(r => setTimeout(r, 1900)); // settings + 350ms + scrape stabilisation (~700ms)

// theme follows YouTube's dark attribute
assert.equal(sh.querySelector('.root').dataset.theme, 'dark');
assert.ok(sh.querySelector('.panel').classList.contains('open'), 'auto-opened');
assert.equal(sh.querySelector('.qtext').textContent, 'sourdough');

const start = sentPort.find(m => m.type === 'start');
assert.ok(start, 'start posted');
assert.equal(start.results.length, 3, 'ad excluded, 3 real results');
assert.equal(JSON.stringify(start.results[0]), JSON.stringify({ id:'aaaaaaaaaaa', title:'Sourdough for beginners', channel:'Bake Lab', meta:'1.2M views · 2 years ago', duration:'12:03' }));
console.log('scrape ok:', JSON.stringify(start.results[1]));

// simulate background stream
const id = start.id;
portCb({ type:'plan', id, userMessage:'CTX' });
portCb({ type:'delta', id, text:'INTERPRETED: They want to start' });
await new Promise(r => setTimeout(r, 60));
assert.equal(sh.querySelectorAll('.step.done').length, 1, 'plan step not done until the interpreted line completes');
assert.ok(!/INTERPRETED/.test(sh.querySelector('.body').textContent), 'header never leaks into the answer');
portCb({ type:'delta', id, text:' sourdough.\n\nFeed a starter daily. <<<PICKS' });
portCb({ type:'delta', id, text:'>>>\n[{"i":0,"why":"Beginner friendly"},{"i":2,"why":"Fixes problems"}]' });
portCb({ type:'delta', id: id + 99, text:'STALE' });
portCb({ type:'done', id });
await new Promise(r => setTimeout(r, 80));
assert.equal(sh.querySelector('.body').textContent.trim(), 'Feed a starter daily.');
const cards = [...sh.querySelectorAll('.card')];
assert.equal(cards.length, 2);
assert.equal(cards[0].href, 'https://www.youtube.com/watch?v=aaaaaaaaaaa');
assert.equal(cards[0].querySelector('.cwhy').textContent, 'Beginner friendly');
assert.equal(sh.querySelectorAll('.step.done').length, 3);
assert.match(sh.querySelectorAll('.step .txt')[1].textContent, /Interpreted as: They want to start sourdough\./);
assert.equal(sh.querySelectorAll('.chip').length, 3);

// follow-up
sh.querySelector('.chip').click();
const fu = sentPort.find(m => m.type === 'followup');
assert.equal(fu.messages.map(m => m.role).join(), 'user,assistant,user');
assert.equal(fu.messages[2].content, 'Explain it simpler');
portCb({ type:'error', id: fu.id, message:'Rate limited by the API.' });
assert.match(sh.querySelector('.err').textContent, /Rate limited/);
sh.querySelector('.err button').click();
const fu2 = sentPort.filter(m => m.type === 'followup');
assert.equal(fu2.length, 2);
assert.equal(fu2[1].messages.map(m => m.role).join(), 'user,assistant,user', 'no duplicate user turn after retry');
console.log('content.js ok');
process.exit(0);
