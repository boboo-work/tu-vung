// Đọc phụ đề các định dạng hay gặp và chuyển về một dạng chung: [{ s, e, t }] (giây bắt đầu, giây kết thúc, chữ).
// Dùng chung cho extension Chrome (nạp như content script) và app Từ Vựng (import như module, rồi dùng globalThis.BiSubs).
// Hỗ trợ: SRT, WebVTT, TTML/DFXP (Netflix, Disney+…), YouTube json3 / srv3 / srv1, ASS/SSA.
globalThis.BiSubs = (() => {
  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
  const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, k) => {
    if (k[0] === '#') {
      const n = k[1] === 'x' || k[1] === 'X' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENT[k.toLowerCase()] ?? m;
  });
  // Bỏ thẻ định dạng (<i>, <font>, <c.color>, <00:00:01.000>, {\an8}…), giữ xuống dòng.
  const clean = (s) => decode(String(s)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/\{\\[^}]*\}/g, '')
    .replace(/\\N/g, '\n'))
    .replace(/[ \t ]+/g, ' ')
    .split('\n').map((l) => l.trim()).filter(Boolean).join('\n');

  // "01:02:03,456" | "02:03.456" | "1:02:03.45" | "00:01:02:12" (khung hình, coi 25 hình/giây)
  function clock(str) {
    const m = String(str).trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d+))?(?::(\d+))?$/);
    if (!m) return NaN;
    const frac = m[4] ? Number('0.' + m[4]) : 0;
    const frames = m[5] ? Number(m[5]) / 25 : 0;
    return (Number(m[1] || 0) * 3600) + Number(m[2]) * 60 + Number(m[3]) + frac + frames;
  }

  function finish(cues) {
    const out = cues
      .filter((c) => Number.isFinite(c.s) && Number.isFinite(c.e) && c.t)
      .map((c) => ({ s: Math.max(0, c.s), e: Math.max(c.e, c.s + 0.3), t: c.t }))
      .sort((a, b) => a.s - b.s || a.e - b.e);
    // Bỏ câu lặp y hệt nối tiếp nhau (phụ đề HLS chia đoạn hay bị lặp ở chỗ nối).
    const res = [];
    for (const c of out) {
      const p = res[res.length - 1];
      if (p && p.t === c.t && c.s <= p.e + 0.05) { p.e = Math.max(p.e, c.e); continue; }
      res.push(c);
    }
    return res;
  }

  // ---- SRT / WebVTT ----
  function parseSrtVtt(text) {
    const cues = [];
    const blocks = text.replace(/\r\n?/g, '\n').replace(/^﻿/, '').split(/\n\s*\n/);
    for (const b of blocks) {
      const lines = b.split('\n');
      const i = lines.findIndex((l) => l.includes('-->'));
      if (i < 0) continue;
      const [a, rest] = lines[i].split('-->');
      const s = clock(a), e = clock(rest.trim().split(/\s+/)[0]);
      const t = clean(lines.slice(i + 1).join('\n'));
      if (t) cues.push({ s, e, t });
    }
    return cues;
  }

  // ---- ASS / SSA ----
  function parseAss(text) {
    const cues = [];
    let fmt = null;
    for (const line of text.replace(/\r/g, '').split('\n')) {
      if (/^Format:/i.test(line) && !fmt) {
        const f = line.slice(7).split(',').map((x) => x.trim().toLowerCase());
        if (f.includes('text')) fmt = f;
      } else if (/^Dialogue:/i.test(line)) {
        const f = fmt || ['layer', 'start', 'end', 'style', 'name', 'marginl', 'marginr', 'marginv', 'effect', 'text'];
        const parts = line.slice(9).split(',');
        const ti = f.indexOf('text');
        const val = (k) => (parts[f.indexOf(k)] || '').trim();
        const t = clean(parts.slice(ti).join(','));
        if (t) cues.push({ s: clock(val('start')), e: clock(val('end')), t });
      }
    }
    return cues;
  }

  // ---- YouTube json3 ----
  function parseJson3(data) {
    const ev = (data.events || []).filter((e) => e.segs && e.tStartMs != null);
    const asr = ev.some((e) => e.segs.some((s) => s.tOffsetMs != null));
    const cues = [];
    for (const e of ev) {
      const t = clean(e.segs.map((s) => s.utf8 || '').join(''));
      if (!t) continue;
      cues.push({ s: e.tStartMs / 1000, e: (e.tStartMs + (e.dDurationMs || 2000)) / 1000, t });
    }
    cues.sort((a, b) => a.s - b.s);
    // Phụ đề tự động: các dòng chồng lên nhau (dòng cũ còn hiện khi dòng mới chạy) → cắt dòng cũ ở chỗ dòng mới bắt đầu.
    if (asr) for (let i = 0; i < cues.length - 1; i++) if (cues[i + 1].s > cues[i].s) cues[i].e = Math.min(cues[i].e, cues[i + 1].s);
    return cues;
  }

  // ---- XML: TTML/DFXP, YouTube srv3/srv1 ----
  function xmlText(node) {
    let out = '';
    for (const n of node.childNodes) {
      if (n.nodeType === 3) out += n.nodeValue;
      else if (n.nodeType === 1) out += /^(br|tt:br)$/i.test(n.nodeName) ? '\n' : xmlText(n);
    }
    return out;
  }
  function parseXml(text) {
    if (typeof DOMParser === 'undefined') return [];
    const doc = new DOMParser().parseFromString(text, 'text/xml');
    if (doc.getElementsByTagName('parsererror').length) return [];
    const root = doc.documentElement;
    const cues = [];
    const name = root.localName;
    if (name === 'timedtext') {
      // srv3: <p t="ms" d="ms">
      for (const p of root.getElementsByTagName('p')) {
        const t = clean(xmlText(p));
        const s = Number(p.getAttribute('t')) / 1000;
        if (t) cues.push({ s, e: s + Number(p.getAttribute('d') || 2000) / 1000, t });
      }
      return cues;
    }
    if (name === 'transcript') {
      for (const x of root.getElementsByTagName('text')) {
        const s = Number(x.getAttribute('start'));
        const t = clean(xmlText(x));
        if (t) cues.push({ s, e: s + Number(x.getAttribute('dur') || 2), t });
      }
      return cues;
    }
    if (name === 'tt') {
      const attr = (el, k) => el.getAttribute(k) ?? el.getAttributeNS('http://www.w3.org/ns/ttml#parameter', k) ?? el.getAttribute('ttp:' + k);
      const tick = Number(attr(root, 'tickRate')) || 10000000;
      const fps = Number(attr(root, 'frameRate')) || 25;
      const time = (v) => {
        if (v == null) return NaN;
        v = v.trim();
        let m;
        if ((m = v.match(/^([\d.]+)(h|m|s|ms|f|t)$/))) {
          const n = Number(m[1]);
          return { h: n * 3600, m: n * 60, s: n, ms: n / 1000, f: n / fps, t: n / tick }[m[2]];
        }
        if ((m = v.match(/^(\d+):(\d{2}):(\d{2}):(\d+)$/))) return m[1] * 3600 + m[2] * 60 + Number(m[3]) + m[4] / fps;
        return clock(v);
      };
      for (const p of root.getElementsByTagNameNS('*', 'p')) {
        const t = clean(xmlText(p));
        const s = time(p.getAttribute('begin'));
        let e = time(p.getAttribute('end'));
        if (!Number.isFinite(e)) e = s + (time(p.getAttribute('dur')) || 2);
        if (t) cues.push({ s, e, t });
      }
    }
    return cues;
  }

  /** Đọc phụ đề, trả về [] nếu không nhận ra. */
  function parse(text) {
    if (!text || typeof text !== 'string') return [];
    const head = text.slice(0, 400).replace(/^﻿/, '').trimStart();
    try {
      if (head[0] === '{') return finish(parseJson3(JSON.parse(text)));
      if (head[0] === '<') return finish(parseXml(text));
      if (/^\[Script Info\]/i.test(head) || /\nDialogue:/.test(text.slice(0, 20000))) return finish(parseAss(text));
      if (text.includes('-->')) return finish(parseSrtVtt(text));
    } catch { /* định dạng hỏng */ }
    return [];
  }

  /** Đoán nhanh nội dung có phải phụ đề không (để không phải đọc mọi phản hồi mạng). */
  function looks(text) {
    const h = String(text).slice(0, 600).replace(/^﻿/, '').trimStart();
    return /^WEBVTT/.test(h)
      || /^\d+\s*\r?\n\s*\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->/.test(h)
      || /^(<\?xml[^>]*>\s*)?<(tt|tt:tt)[\s>]/.test(h)
      || /^(<\?xml[^>]*>\s*)?<(timedtext|transcript)[\s>]/.test(h)
      || /^\{\s*"wireMagic"\s*:\s*"pb3"/.test(h)
      || /^\[Script Info\]/i.test(h);
  }

  // Có dấu tiếng Việt đặc trưng → coi là tiếng Việt.
  const VI = /[ăâđêôơưạảãáàặẳẵắằậẩẫấầẹẻẽéèệểễếềịỉĩíìọỏõóòộổỗốồợởỡớờụủũúùựửữứừỵỷỹýỳ]/i;
  function lang(cues) {
    const sample = cues.slice(0, 200).map((c) => c.t).join(' ');
    if (!sample) return '?';
    const words = sample.split(/\s+/).length;
    const vi = (sample.match(new RegExp(VI.source, 'gi')) || []).length;
    if (vi / words > 0.25) return 'vi';
    const en = (sample.toLowerCase().match(/\b(the|you|and|to|is|it|that|of|what|i'm|don't|this|in|we)\b/g) || []).length;
    if (en / words > 0.06 && /^[\x00-\x7F’‘“”…—–♪]*$/.test(sample.slice(0, 3000).replace(/[éèàçñüöä]/gi, ''))) return 'en';
    return '?';
  }

  /** Chia một dòng thành các phần: từ (chạm được) và phần không phải từ. */
  function tokens(text) {
    const out = [];
    const re = /[A-Za-zÀ-ɏḀ-ỿ]+(?:['’][A-Za-z]+)*(?:-[A-Za-z]+)*/g;
    let i = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > i) out.push({ t: text.slice(i, m.index) });
      out.push({ t: m[0], w: true });
      i = m.index + m[0].length;
    }
    if (i < text.length) out.push({ t: text.slice(i) });
    return out;
  }

  /** Tìm câu đang chạy tại thời điểm t (tìm nhị phân). Trả về chỉ số, hoặc -1. */
  function at(cues, t) {
    let lo = 0, hi = cues.length - 1, best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (cues[mid].s <= t) { best = mid; lo = mid + 1; } else hi = mid - 1;
    }
    // Hai câu chồng nhau: lấy câu muộn nhất còn đang hiện.
    for (let i = best; i >= 0 && i > best - 4; i--) if (cues[i].e > t) return i;
    return -1;
  }

  /** Câu gần nhất bắt đầu trước t (để đi tới/lùi câu). */
  const before = (cues, t) => {
    let lo = 0, hi = cues.length - 1, best = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (cues[mid].s <= t) { best = mid; lo = mid + 1; } else hi = mid - 1; }
    return best;
  };

  /** Ghép phụ đề dịch (theo thời gian) vào phụ đề gốc: mỗi câu gốc lấy các câu dịch chồng lên nó nhiều nhất. */
  function align(main, other) {
    return main.map((c) => {
      const hits = other.filter((o) => Math.min(o.e, c.e) - Math.max(o.s, c.s) > Math.min(0.4, (c.e - c.s) / 2));
      return hits.map((h) => h.t).join(' ');
    });
  }

  const stamp = (x) => {
    const ms = Math.round(x * 1000);
    const p = (n, w = 2) => String(n).padStart(w, '0');
    return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
  };
  /** Xuất SRT; `trans` (tùy chọn) = mảng bản dịch theo cùng thứ tự, ghi thành dòng thứ hai. */
  function toSrt(cues, trans) {
    return cues.map((c, i) => `${i + 1}\n${stamp(c.s)} --> ${stamp(c.e)}\n${c.t}${trans?.[i] ? '\n' + trans[i] : ''}\n`).join('\n');
  }

  return { parse, looks, lang, tokens, at, before, align, toSrt, clean, VI };
})();
