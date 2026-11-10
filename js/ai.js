// AI Vocabulary Assistant — lớp kết nối.
// Ứng dụng KHÔNG giả lập AI: nếu chưa cấu hình, askAI() báo lỗi rõ ràng và giao diện hiển thị trạng thái "chưa kết nối".
//
// Hai cách kết nối:
//  1. 'anthropic' — gọi thẳng Claude Messages API từ trình duyệt bằng API key của người dùng (lưu cục bộ trên máy).
//  2. 'proxy'     — gọi tới backend riêng (khuyến nghị khi mở rộng): POST {system, prompt, model} → {text}.
//                   Khi đó API key nằm ở server, không nằm trên điện thoại.

export const AI_MODELS = [
  ['claude-opus-5-5', 'Claude Opus 5.5 (mặc định)'],
  ['claude-sonnet-5-5', 'Claude Sonnet 5.5 (nhanh, tiết kiệm hơn)'],
  ['claude-haiku-5-5', 'Claude Haiku 5.5 (nhanh nhất)'],
];

export const aiReady = (ai) => (ai?.provider === 'proxy' ? !!ai.endpoint?.trim() : !!ai?.apiKey?.trim());

const SYSTEM = `Bạn là trợ lý học từ vựng tiếng Anh cho một người Việt đang luyện IELTS.
Giải thích bằng tiếng Việt, rõ ràng và ngắn gọn; ví dụ và cụm từ viết bằng tiếng Anh tự nhiên như người bản xứ, kèm nghĩa tiếng Việt khi hữu ích.
Trình bày bằng văn bản thuần với các đề mục ngắn và gạch đầu dòng "- ". Dùng **in đậm** cho từ khoá. Không dùng bảng.`;

const ctx = (w) =>
  `Từ đang học: "${w.word}"${w.pos ? ` (${w.pos})` : ''}${w.meaning ? ` — nghĩa đã lưu: ${w.meaning}` : ''}.`;

// Các tác vụ hỗ trợ. needsInput: cần người dùng nhập thêm.
export const AI_ACTIONS = [
  { id: 'context', label: 'Giải thích theo ngữ cảnh', needsInput: 'optional', placeholder: 'Dán câu/đoạn văn chứa từ này (không bắt buộc)',
    build: (w, input) => `${ctx(w)}\n${input ? `Ngữ cảnh: """${input}"""\nHãy giải thích nghĩa của từ trong đúng ngữ cảnh này, sắc thái, và vì sao tác giả chọn từ đó.` : 'Hãy giải thích các nghĩa chính của từ theo từng ngữ cảnh sử dụng phổ biến, kèm sắc thái (trang trọng/thân mật).'}` },
  { id: 'confusables', label: 'Phân biệt từ dễ nhầm', needsInput: 'optional', placeholder: 'Từ muốn so sánh, ví dụ: affect / effect (không bắt buộc)',
    build: (w, input) => `${ctx(w)}\nHãy phân biệt từ này với ${input ? `"${input}"` : 'những từ người Việt hay nhầm lẫn với nó'}: khác nhau về nghĩa, sắc thái, ngữ pháp, collocation; mỗi từ một ví dụ; kết thúc bằng mẹo ghi nhớ.` },
  { id: 'examples', label: 'Ví dụ tự nhiên',
    build: (w) => `${ctx(w)}\nViết 6 câu ví dụ tự nhiên như người bản xứ, đa dạng ngữ cảnh (đời thường, học thuật, công việc), kèm bản dịch tiếng Việt cho mỗi câu.` },
  { id: 'ielts', label: 'Dùng trong IELTS',
    build: (w) => `${ctx(w)}\nGiải thích cách dùng từ này trong IELTS Speaking và IELTS Writing: phù hợp phần nào/chủ đề nào, mức độ trang trọng, 2 câu mẫu Speaking, 2 câu mẫu Writing Task 2 (và Task 1 nếu phù hợp), lỗi cần tránh.` },
  { id: 'collocations', label: 'Collocations nâng cao',
    build: (w) => `${ctx(w)}\nĐề xuất 8–10 collocations nâng cao (band 7+) với từ này, nhóm theo cấu trúc (adj + n, v + n, adv + v…), mỗi cụm kèm nghĩa tiếng Việt và một câu ví dụ ngắn.` },
  { id: 'quiz', label: 'Tạo câu hỏi luyện tập',
    build: (w) => `${ctx(w)}\nTạo 5 câu hỏi luyện tập đa dạng (điền từ, chọn đáp án, sửa lỗi sai, viết lại câu, dịch Việt–Anh). Để phần ĐÁP ÁN ở cuối, tách riêng bằng dòng "--- Đáp án ---".` },
  { id: 'grade', label: 'Chấm & sửa câu của tôi', needsInput: 'required', placeholder: 'Viết câu tiếng Anh của bạn có dùng từ này…',
    build: (w, input) => `${ctx(w)}\nCâu của người học: """${input}"""\nHãy đánh giá: (1) dùng từ đúng nghĩa và đúng collocation chưa, (2) lỗi ngữ pháp/chính tả, (3) mức độ tự nhiên. Đưa ra phiên bản đã sửa và một phiên bản nâng cao hơn. Nhận xét thẳng thắn, cụ thể.` },
];

export class AIError extends Error {}

export async function askAI(ai, prompt) {
  if (!aiReady(ai)) throw new AIError('Chưa kết nối AI. Hãy cấu hình trong Cài đặt → Trợ lý AI.');
  if (!navigator.onLine) throw new AIError('Trợ lý AI cần kết nối mạng. Hiện thiết bị đang offline.');

  if (ai.provider === 'proxy') {
    let res;
    try {
      res = await fetch(ai.endpoint.trim(), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ system: SYSTEM, prompt, model: ai.model }),
      });
    } catch { throw new AIError('Không kết nối được tới máy chủ AI của bạn.'); }
    if (!res.ok) throw new AIError(`Máy chủ AI trả về lỗi ${res.status}.`);
    const data = await res.json().catch(() => null);
    if (!data?.text) throw new AIError('Máy chủ AI trả về dữ liệu không đúng định dạng {text}.');
    return data.text;
  }

  // Claude Messages API (gọi trực tiếp từ trình duyệt).
  let res;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ai.apiKey.trim(),
        'anthropic-version': '2026-10-21',
        'anthropic-beta': 'server-side-fallback-2026-07-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: ai.model || 'claude-opus-5-5',
        max_tokens: 16000,
        fallbacks: 'default',
        system: SYSTEM,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  } catch {
    throw new AIError('Không kết nối được tới Claude API. Kiểm tra mạng rồi thử lại.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = data?.error?.message || '';
    if (res.status === 401) throw new AIError('API key không hợp lệ. Kiểm tra lại trong Cài đặt.');
    if (res.status === 429) throw new AIError('Đã vượt giới hạn tần suất của API. Hãy thử lại sau ít phút.');
    if (res.status >= 500) throw new AIError('Claude API đang gặp sự cố tạm thời. Hãy thử lại sau.');
    throw new AIError(`Claude API báo lỗi ${res.status}${detail ? ': ' + detail : ''}`);
  }
  if (data.stop_reason === 'refusal') throw new AIError('AI đã từ chối trả lời yêu cầu này.');
  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  if (!text) throw new AIError('AI không trả về nội dung.');
  return data.stop_reason === 'max_tokens' ? text + '\n\n(Câu trả lời bị cắt do quá dài.)' : text;
}
