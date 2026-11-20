// Chạy trong trang (MAIN world), trước mọi script của trang.
// Nghe lén các phản hồi mạng của trình phát video: phản hồi nào là file phụ đề thì gửi bản chữ sang content.js.
// Không sửa nội dung, không chặn, không gửi gì ra ngoài.
(() => {
  if (window.__bisubHooked) return;
  window.__bisubHooked = true;
  const URL_HINT = /timedtext|\.(vtt|srt|ass|ssa|ttml|dfxp|xml)(\?|#|$)|subtitle|caption|\/subs?\/|texttrack|\/tt\//i;
  const MAX = 4 * 1024 * 1024;
  const SKIP_TYPE = /image|video|audio|font|javascript|css|html|octet-stream|mpegurl|dash\+xml/i;
  // Phát hiện bằng nội dung (dành cho trang đặt tên file lạ). Chỉ xem đầu chuỗi nên rất nhẹ.
  const looks = (t) => {
    const h = t.slice(0, 300).replace(/^﻿/, '').trimStart();
    return /^WEBVTT/.test(h) || /^\d+\s*\r?\n\s*\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->/.test(h)
      || /^(<\?xml[^>]*>\s*)?<(tt|tt:tt|timedtext|transcript)[\s>]/.test(h) || /^\{\s*"wireMagic"\s*:\s*"pb3"/.test(h) || /^\[Script Info\]/i.test(h);
  };
  const send = (url, text) => {
    if (typeof text !== 'string' || text.length < 20 || text.length > MAX || !looks(text)) return;
    window.postMessage({ __bisub: 'track', url: String(url), text }, '*');
  };
  const worth = (url, type) => {
    if (type && SKIP_TYPE.test(type) && !/vtt|ttml|xml|text\/plain|json/i.test(type)) return false;
    return URL_HINT.test(url) || /vtt|ttml|srt/i.test(type || '');
  };

  const ofetch = window.fetch;
  if (ofetch) {
    window.fetch = function (...args) {
      const p = ofetch.apply(this, args);
      p.then((res) => {
        try {
          const url = res.url || (args[0] && (args[0].url || args[0])) || '';
          const type = res.headers.get('content-type') || '';
          const len = Number(res.headers.get('content-length') || 0);
          if (len > MAX) return;
          if (worth(url, type) || /text\/plain|text\/xml|application\/xml/i.test(type)) res.clone().text().then((t) => send(url, t), () => {});
        } catch { /* bỏ qua */ }
      }, () => {});
      return p;
    };
  }

  const XO = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    try { this.__bisubUrl = String(url); } catch { /* bỏ qua */ }
    return XO.call(this, method, url, ...rest);
  };
  const XS = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener('load', function () {
      try {
        const url = this.responseURL || this.__bisubUrl || '';
        const type = this.getResponseHeader('content-type') || '';
        if (!worth(url, type) && !/text\/plain|xml/i.test(type)) return;
        const rt = this.responseType;
        if (rt === '' || rt === 'text') send(url, this.responseText);
        else if (rt === 'json' && this.response) send(url, JSON.stringify(this.response));
        else if (rt === 'arraybuffer' && this.response && this.response.byteLength < MAX) send(url, new TextDecoder().decode(this.response));
        else if (rt === 'blob' && this.response && this.response.size < MAX) this.response.text().then((t) => send(url, t), () => {});
      } catch { /* bỏ qua */ }
    });
    return XS.apply(this, args);
  };
})();
