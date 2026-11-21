// Cloudflare Worker: máy chủ trung gian giữa app Từ Vựng và cổng API tương thích OpenAI (mặc định api.xingchiapi.com).
// App gọi ở chế độ "Máy chủ riêng (proxy)": POST {system, prompt, model} → trả {text}.
// Cổng xingchi không cho trình duyệt gọi thẳng (không có CORS), nên Worker gọi thay và thêm CORS cho trang của app.
//
// Cài trên dash.cloudflare.com → Workers & Pages → tạo Worker → Edit code → dán toàn bộ file này → Deploy.
// Settings → Variables and Secrets:
//   XINGCHI_KEY (Secret)  key của bạn trên xingchiapi.com
//   APP_TOKEN   (Secret)  chuỗi bí mật tự đặt; địa chỉ nhập vào app có dạng https://<tên>.workers.dev/?token=<APP_TOKEN>
//   MODEL       (Text)    tên mô hình trên cổng, ví dụ gemini-2.5-flash, gpt-4o-mini… (xem danh sách trên trang của cổng)
//   API_BASE    (Text, không bắt buộc) mặc định https://api.xingchiapi.com/v1

const ALLOWED = ['https://boboo-work.github.io', 'http://localhost', 'http://127.0.0.1'];

function cors(origin) {
  const ok = ALLOWED.some((a) => origin === a || origin.startsWith(a + ':'));
  return {
    'access-control-allow-origin': ok ? origin : ALLOWED[0],
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
}
const json = (obj, status, origin) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...cors(origin) } });

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin') || '';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    if (request.method !== 'POST') return json({ error: 'Chỉ nhận POST' }, 405, origin);

    // Chặn người lạ dùng key của bạn: địa chỉ phải kèm ?token= đúng APP_TOKEN.
    const token = new URL(request.url).searchParams.get('token') || '';
    if (!env.APP_TOKEN || token !== env.APP_TOKEN) return json({ error: 'Sai hoặc thiếu token trong địa chỉ (?token=…)' }, 401, origin);
    if (!env.XINGCHI_KEY) return json({ error: 'Worker chưa có XINGCHI_KEY (Settings → Variables and Secrets)' }, 500, origin);
    if (!env.MODEL) return json({ error: 'Worker chưa có MODEL (tên mô hình trên cổng)' }, 500, origin);

    let body;
    try { body = await request.json(); } catch { return json({ error: 'Dữ liệu gửi lên không phải JSON' }, 400, origin); }
    const prompt = String(body?.prompt || '').slice(0, 20000);
    const system = String(body?.system || '').slice(0, 5000);
    if (!prompt) return json({ error: 'Thiếu prompt' }, 400, origin);

    const base = (env.API_BASE || 'https://api.xingchiapi.com/v1').replace(/\/+$/, '');
    let res, data;
    try {
      res = await fetch(base + '/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${env.XINGCHI_KEY}` },
        body: JSON.stringify({ model: env.MODEL, messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: prompt }] }),
      });
      data = await res.json().catch(() => null);
    } catch (e) {
      return json({ error: `Không gọi được cổng API: ${e?.message || e}` }, 502, origin);
    }
    if (!res.ok) {
      const err = Array.isArray(data) ? data[0]?.error : data?.error;
      const msg = (typeof err === 'string' ? err : err?.message) || data?.message || data?.code || `lỗi ${res.status}`;
      return json({ error: `Cổng API báo: ${msg}` }, res.status, origin);
    }
    const content = data?.choices?.[0]?.message?.content;
    const text = (Array.isArray(content) ? content.map((p) => p?.text || '').join('') : content || '').trim();
    if (!text) return json({ error: 'Cổng API không trả về nội dung' }, 502, origin);
    return json({ text }, 200, origin);
  },
};
