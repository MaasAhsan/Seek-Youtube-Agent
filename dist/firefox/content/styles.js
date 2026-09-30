/* Seek — panel stylesheet, injected into a shadow root so YouTube's CSS can't touch it. */
(() => {
  const NS = (globalThis.YTA = globalThis.YTA || {});
  NS.CSS = `
:host{all:initial}
*{box-sizing:border-box}
button,textarea{font:inherit;color:inherit}
.root{font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,"Helvetica Neue",Arial,sans-serif;color:var(--fg);-webkit-font-smoothing:antialiased}
.root[data-theme="dark"]{--panel:rgba(12,12,13,.88);--surface:rgba(255,255,255,.05);--surface2:rgba(255,255,255,.09);--border:rgba(255,255,255,.12);--border2:rgba(255,255,255,.24);--fg:#f3f3f4;--fg2:#cbcbd0;--muted:#8e8e95;--inv-bg:#f3f3f4;--inv-fg:#0c0c0d;--shadow:0 24px 70px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.04)}
.root[data-theme="light"]{--panel:rgba(253,253,253,.9);--surface:rgba(0,0,0,.035);--surface2:rgba(0,0,0,.07);--border:rgba(0,0,0,.11);--border2:rgba(0,0,0,.26);--fg:#111113;--fg2:#3b3b41;--muted:#70707a;--inv-bg:#111113;--inv-fg:#fafafa;--shadow:0 24px 60px rgba(0,0,0,.18),0 0 0 1px rgba(0,0,0,.03)}

/* launcher */
.fab{position:fixed;right:20px;bottom:20px;z-index:2147483646;width:46px;height:46px;border-radius:50%;border:1px solid var(--border2);background:var(--panel);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);color:var(--fg);display:grid;place-items:center;cursor:pointer;box-shadow:var(--shadow);transition:transform .2s ease}
.fab:hover{transform:scale(1.06)}
.fab[hidden]{display:none}
.fab.pulse::after{content:"";position:absolute;inset:-5px;border-radius:50%;border:1px solid var(--border2);animation:ring 2s ease-out infinite}
@keyframes ring{from{opacity:.9;transform:scale(.9)}to{opacity:0;transform:scale(1.35)}}

/* panel */
.panel{position:fixed;top:68px;right:12px;bottom:12px;z-index:2147483646;width:408px;max-width:calc(100vw - 24px);display:flex;flex-direction:column;overflow:hidden;border-radius:18px;border:1px solid var(--border);background:var(--panel);-webkit-backdrop-filter:blur(16px) saturate(1.1);backdrop-filter:blur(16px) saturate(1.1);box-shadow:var(--shadow);transform:translateX(calc(100% + 24px));opacity:0;pointer-events:none;transition:transform .38s cubic-bezier(.2,.8,.2,1),opacity .25s ease}
.panel.open{transform:none;opacity:1;pointer-events:auto}
.ascii{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0}
.head,.scroll,.foot{position:relative;z-index:1}

.head{display:flex;align-items:center;justify-content:space-between;padding:12px 12px 8px 18px}
.brand{display:flex;align-items:center;gap:9px;font-weight:650;letter-spacing:-.01em}
.dot{width:8px;height:8px;border-radius:50%;background:var(--fg)}
.busy .dot{animation:pulse 1.1s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.25}}
.actions{display:flex;gap:2px}
.ibtn{width:30px;height:30px;border:0;border-radius:8px;background:transparent;color:var(--muted);display:grid;place-items:center;cursor:pointer;transition:background .15s,color .15s}
.ibtn:hover{background:var(--surface2);color:var(--fg)}
.ibtn svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}

.scroll{flex:1;overflow-y:auto;overscroll-behavior:contain;padding:4px 18px 18px;scrollbar-width:thin;scrollbar-color:var(--border2) transparent}
.label{font:600 10.5px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.qhead{margin:2px 0 18px}
.qtext{margin-top:8px;font-size:20px;line-height:1.25;font-weight:650;letter-spacing:-.02em;overflow-wrap:anywhere}

.msg{margin-bottom:18px}
.msg.user{display:flex;justify-content:flex-end}
.bubble{max-width:88%;padding:8px 13px;border-radius:14px 14px 4px 14px;background:var(--inv-bg);color:var(--inv-fg);font-size:13.5px;overflow-wrap:anywhere;white-space:pre-wrap}

.trace{margin:0 0 14px;padding:10px 12px;border-radius:12px;border:1px solid var(--border);background:var(--surface)}
.step{display:flex;gap:10px;align-items:flex-start;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--muted)}
.step+.step{margin-top:6px}
.step .mark{width:14px;height:14px;flex:none;margin-top:2px;border-radius:50%;border:1px solid var(--border2)}
.step.active{color:var(--fg)}
.step.active .mark{border-color:var(--fg);animation:pulse 1.1s ease-in-out infinite}
.step.active .mark::after{content:"";display:block;width:6px;height:6px;margin:3px;border-radius:50%;background:var(--fg)}
.step.done{color:var(--fg2)}
.step.done .mark{background:var(--fg);border-color:var(--fg)}
.step.done .mark::after{content:"";display:block;width:4px;height:7px;border:solid var(--inv-fg);border-width:0 1.6px 1.6px 0;transform:translate(4px,1px) rotate(45deg)}
.step .txt{overflow-wrap:anywhere}

.body{font-size:14px;line-height:1.62;color:var(--fg);overflow-wrap:anywhere}
.body p{margin:0 0 .8em}
.body p.h{font-weight:650;margin-top:1em}
.body ul,.body ol{margin:0 0 .8em;padding-left:1.25em}
.body li{margin:.2em 0}
.body code{font:12.5px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;padding:.1em .38em;border-radius:5px;background:var(--surface2)}
.body pre{margin:0 0 .8em;padding:10px 12px;border-radius:10px;background:var(--surface2);overflow-x:auto}
.body pre code{padding:0;background:none}
.body > :last-child{margin-bottom:0}
.caret{display:inline-block;width:.55ch;height:1.05em;margin-left:2px;vertical-align:-.16em;background:var(--fg);animation:blink 1s steps(2,start) infinite}
@keyframes blink{to{visibility:hidden}}
.thinking{display:inline-flex;gap:4px;padding:6px 0}
.thinking i{width:5px;height:5px;border-radius:50%;background:var(--muted);animation:pulse 1s ease-in-out infinite}
.thinking i:nth-child(2){animation-delay:.15s}
.thinking i:nth-child(3){animation-delay:.3s}

.picks{margin-top:16px;display:flex;flex-direction:column;gap:8px}
.card{display:flex;gap:11px;padding:8px;border-radius:12px;border:1px solid var(--border);background:var(--surface);color:inherit;text-decoration:none;transition:border-color .15s,background .15s,transform .15s}
.card:hover{border-color:var(--border2);background:var(--surface2);transform:translateY(-1px)}
.thumb{position:relative;flex:none;width:118px;aspect-ratio:16/9;border-radius:8px;overflow:hidden;background:var(--surface2)}
.thumb img{display:block;width:100%;height:100%;object-fit:cover}
.dur{position:absolute;right:4px;bottom:4px;padding:1px 5px;border-radius:4px;background:rgba(0,0,0,.78);color:#fff;font:600 10.5px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.ctext{min-width:0;display:flex;flex-direction:column;gap:3px}
.ctitle{font-size:13px;font-weight:600;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.cmeta{font-size:11.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cwhy{font-size:12px;line-height:1.4;color:var(--fg2)}

.err{margin-top:8px;padding:11px 13px;border-radius:12px;border:1px solid var(--border2);background:var(--surface);font-size:13px}
.err button,.linkbtn{margin-top:8px;padding:5px 11px;border-radius:8px;border:1px solid var(--border2);background:transparent;cursor:pointer;font-size:12.5px}
.err button:hover,.linkbtn:hover{background:var(--surface2)}

.foot{padding:0 12px 12px;border-top:1px solid transparent}
.chips{display:flex;flex-wrap:wrap;gap:6px;padding:0 6px 8px}
.chips:empty{display:none}
.chip{padding:5px 11px;border-radius:999px;border:1px solid var(--border);background:var(--surface);color:var(--fg2);font-size:12px;cursor:pointer;transition:background .15s,border-color .15s}
.chip:hover{background:var(--surface2);border-color:var(--border2)}
.composer{display:flex;align-items:flex-end;gap:8px;padding:8px 8px 8px 14px;border-radius:14px;border:1px solid var(--border);background:var(--panel);transition:border-color .15s}
.composer:focus-within{border-color:var(--border2)}
textarea{flex:1;min-height:22px;max-height:120px;padding:3px 0;border:0;outline:0;resize:none;background:transparent;font-size:14px;line-height:1.45}
textarea::placeholder{color:var(--muted)}
.send{width:30px;height:30px;flex:none;border:0;border-radius:50%;background:var(--inv-bg);color:var(--inv-fg);display:grid;place-items:center;cursor:pointer;transition:opacity .15s,transform .15s}
.send:hover{transform:scale(1.06)}
.send:disabled{opacity:.3;cursor:default;transform:none}
.send svg{width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.send .stop{display:none}
.busy .send .go{display:none}
.busy .send .stop{display:block;fill:currentColor;stroke:none}

@media (max-width:640px){.panel{top:64px;right:0;left:0;bottom:0;width:auto;max-width:none;border-radius:18px 18px 0 0}}
@media (prefers-reduced-motion:reduce){.panel{transition:none}.caret,.dot,.step .mark,.fab.pulse::after{animation:none!important}}
`;
})();
