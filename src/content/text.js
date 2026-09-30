/* Seek — text helpers: safe mini-markdown + parsing of the model's PICKS block. */
(() => {
  const NS = (globalThis.YTA = globalThis.YTA || {});
  const MARK = '<<<PICKS>>>';

  const esc = (s) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // Everything is HTML-escaped BEFORE any tag is introduced, so model output can
  // never inject markup. Links are intentionally not rendered.
  function inline(s) {
    let t = esc(s);
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
    return t;
  }

  function renderMarkdown(md) {
    const lines = String(md || '').replace(/\r/g, '').split('\n');
    const out = [];
    let para = [];
    let list = null; // 'ul' | 'ol'
    let fence = null; // array of code lines while inside ```

    const flushPara = () => {
      if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`);
      para = [];
    };
    const closeList = () => {
      if (list) out.push(`</${list}>`);
      list = null;
    };

    for (const line of lines) {
      if (/^\s*```/.test(line)) {
        if (fence) {
          out.push(`<pre><code>${esc(fence.join('\n'))}</code></pre>`);
          fence = null;
        } else {
          flushPara();
          closeList();
          fence = [];
        }
        continue;
      }
      if (fence) {
        fence.push(line);
        continue;
      }
      if (!line.trim()) {
        flushPara();
        closeList();
        continue;
      }
      let m;
      if ((m = /^\s*#{1,4}\s+(.*)$/.exec(line))) {
        flushPara();
        closeList();
        out.push(`<p class="h">${inline(m[1])}</p>`);
      } else if ((m = /^\s*[-*•]\s+(.*)$/.exec(line))) {
        flushPara();
        if (list !== 'ul') {
          closeList();
          out.push('<ul>');
          list = 'ul';
        }
        out.push(`<li>${inline(m[1])}</li>`);
      } else if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(line))) {
        flushPara();
        if (list !== 'ol') {
          closeList();
          out.push('<ol>');
          list = 'ol';
        }
        out.push(`<li>${inline(m[1])}</li>`);
      } else {
        closeList();
        para.push(line.trim());
      }
    }
    if (fence) out.push(`<pre><code>${esc(fence.join('\n'))}</code></pre>`);
    flushPara();
    closeList();
    return out.join('');
  }

  // Final split once the stream is complete.
  function splitPicks(raw) {
    const i = raw.indexOf(MARK);
    if (i < 0) return { text: raw.trim(), picksRaw: null, marked: false };
    return { text: raw.slice(0, i).trim(), picksRaw: raw.slice(i + MARK.length), marked: true };
  }

  // While streaming: hide the marker (and any partial marker at the tail) from the reader.
  function streamVisible(raw) {
    const i = raw.indexOf(MARK);
    if (i >= 0) return { text: raw.slice(0, i), marked: true };
    for (let k = Math.min(MARK.length - 1, raw.length); k > 0; k--) {
      if (raw.endsWith(MARK.slice(0, k))) return { text: raw.slice(0, raw.length - k), marked: false };
    }
    return { text: raw, marked: false };
  }

  // Map the model's [{i, why}] onto the real scraped results. Invalid or
  // out-of-range indices are dropped, so the model can never surface a video
  // that wasn't actually on the page.
  function parsePicks(picksRaw, results, max = 4) {
    if (!picksRaw) return [];
    const a = picksRaw.indexOf('[');
    const b = picksRaw.lastIndexOf(']');
    if (a < 0 || b < a) return [];
    let arr;
    try {
      arr = JSON.parse(picksRaw.slice(a, b + 1));
    } catch {
      return [];
    }
    if (!Array.isArray(arr)) return [];
    const seen = new Set();
    const out = [];
    for (const p of arr) {
      const i = Number(p && p.i);
      if (!Number.isInteger(i) || i < 0 || i >= results.length || seen.has(i)) continue;
      seen.add(i);
      out.push({ item: results[i], why: String((p && p.why) || '').slice(0, 140) });
      if (out.length >= max) break;
    }
    return out;
  }


  // Splits a raw model reply into: the INTERPRETED line (if any), the visible answer
  // text, and the PICKS block. Tolerant of small models that skip the format:
  // without an INTERPRETED line the whole reply is treated as the answer.
  function parseAnswer(raw, streaming) {
    let interp = null;
    let rest = raw;
    const m = /^\s*INTERPRETED:\s*/i.exec(raw);
    if (m) {
      const after = raw.slice(m[0].length);
      const nl = after.indexOf('\n');
      if (nl < 0) {
        if (streaming) return { interp: null, pending: true, text: '', picksRaw: null, marked: false };
        interp = after.trim();
        rest = '';
      } else {
        interp = after.slice(0, nl).trim();
        rest = after.slice(nl + 1);
      }
    } else if (streaming) {
      const t = raw.trim().toLowerCase();
      if (t.length < 12 && 'interpreted:'.startsWith(t)) return { interp: null, pending: true, text: '', picksRaw: null, marked: false };
    }
    if (streaming) {
      const v = streamVisible(rest);
      return { interp, pending: false, text: v.text.replace(/^\s+/, ''), picksRaw: null, marked: v.marked };
    }
    const sp = splitPicks(rest);
    return { interp, pending: false, text: sp.text, picksRaw: sp.picksRaw, marked: sp.marked };
  }

  Object.assign(NS, { renderMarkdown, splitPicks, streamVisible, parsePicks, parseAnswer });
})();
