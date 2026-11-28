// Nhập đề Reading ngay trong app (#/rimport): người học chọn bộ 3 file Markdown mỗi đề
// (đề + đáp án, Simplify, giải chi tiết — có thể chọn nhiều đề một lúc hoặc một file .zip),
// app ghép file, đọc bằng rparse.js rồi lưu vào kho 'reading' (kind: 'test'). Đề hiện trong thư viện như đề có sẵn.
import { S, rPut, rDel } from './store.js';
import { esc, toast, unzip } from './util.js';
import { icon, on, rerender, navBar, confirmSheet, go } from './ui.js';
import { R, loadReading, syncImported, importedTests } from './reading.js';
import { pairFiles, buildTest, Skip } from './rparse.js';

const imp = { busy: false, sets: null, unused: [], error: '' };
const ACCEPT = '.md,.markdown,.txt,text/markdown,text/plain,.zip,application/zip';
const KIND_NAME = { test: 'đề + đáp án', simp: 'Simplify', giai: 'giải chi tiết' };

/** Đọc chữ trong các file đã chọn (mở luôn file .zip). */
async function readTexts(files) {
  const out = [], bad = [];
  for (const f of files) {
    if (/\.zip$/i.test(f.name) || /zip/.test(f.type)) {
      try {
        const z = await unzip(await f.arrayBuffer());
        for (const name of z.names) {
          if (name.endsWith('/') || /(^|\/)(__MACOSX|\.)/.test(name) || !/\.(md|markdown|txt)$/i.test(name)) continue;
          out.push({ name: name.split('/').pop(), text: new TextDecoder().decode(await z.bytes(name)) });
        }
      } catch (e) { console.error(e); bad.push(`${f.name}: không mở được file nén`); }
    } else if (/\.(md|markdown|txt)$/i.test(f.name) || /^text\//.test(f.type)) {
      out.push({ name: f.name, text: await f.text() });
    } else bad.push(`${f.name}: không phải file .md`);
  }
  return { out, bad };
}

async function handleFiles(files) {
  if (!files.length) return;
  imp.busy = true; imp.error = ''; imp.sets = null; rerender();
  try {
    await loadReading();
    const { out, bad } = await readTexts(files);
    const { sets, unused } = pairFiles(out);
    const baseIds = new Set(R.base.map((t) => t.id));
    const mine = new Set(importedTests().map((r) => r.tid));
    imp.unused = [...bad, ...unused.map((n) => `${n}: không nhận ra là file đề, Simplify hay giải chi tiết`)];
    imp.sets = sets.map((s) => {
      const r = { id: s.id, title: s.title, files: { test: s.test?.name, simp: s.simp?.name, giai: s.giai?.name } };
      const missing = Object.entries(r.files).filter(([, v]) => !v).map(([k]) => KIND_NAME[k]);
      if (missing.length) return { ...r, error: `Thiếu file ${missing.join(' và ')}` };
      if (baseIds.has(s.id)) return { ...r, error: 'Đề này đã có sẵn trong app' };
      try {
        const { data, notes } = buildTest(s.test.text, s.simp.text, s.giai.text, s.id, s.title || '');
        if (!data.title) data.title = `Đề nhập · ${data.passages[0].title}`;
        return { ...r, title: data.title, data, notes, replace: mine.has(s.id) };
      } catch (e) {
        if (!(e instanceof Skip)) console.error(e);
        return { ...r, error: e instanceof Skip ? `Không đọc được: ${e.message}` : 'Không đọc được bộ file này' };
      }
    });
    if (!sets.length) imp.error = out.length ? 'Không thấy file Simplify nào. Mỗi đề cần đủ 3 file: đề + đáp án, Simplify và giải chi tiết.' : bad[0] || 'Chưa chọn file .md nào';
  } catch (e) {
    console.error(e);
    imp.error = 'Không đọc được các file đã chọn';
  }
  imp.busy = false;
  rerender();
}

on('ri-pick', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.accept = ACCEPT;
  input.onchange = () => handleFiles([...input.files]);
  input.click();
});
on('ri-files', (el) => handleFiles([...el.files])); // dùng cho kiểm thử
on('ri-cancel', () => { imp.sets = null; imp.unused = []; imp.error = ''; rerender(); });
on('ri-save', async () => {
  const ok = (imp.sets || []).filter((s) => s.data);
  if (!ok.length) return;
  const at = new Date().toISOString();
  await rPut(...ok.map((s) => ({ id: `test:${s.id}`, kind: 'test', tid: s.id, title: s.data.title, at, data: s.data })));
  syncImported();
  imp.sets = null; imp.unused = [];
  toast(`Đã thêm ${ok.length} đề vào Reading`);
  go('#/reading');
});
on('ri-del', async (el) => {
  const r = S.reading.get(el.dataset.id);
  if (!r || !(await confirmSheet({ title: `Xoá ${r.title}?`, body: 'Đề sẽ biến khỏi thư viện Reading. Kết quả các lần đã làm vẫn được giữ.', okLabel: 'Xoá đề', danger: true }))) return;
  await rDel(r.id);
  syncImported();
  toast('Đã xoá đề');
  rerender();
});
on('ri-del-all', async () => {
  const list = importedTests();
  if (!list.length || !(await confirmSheet({ title: `Xoá cả ${list.length} đề đã nhập?`, body: 'Các đề sẽ biến khỏi thư viện Reading. Kết quả các lần đã làm vẫn được giữ.', okLabel: `Xoá ${list.length} đề`, danger: true }))) return;
  for (const r of list) await rDel(r.id);
  syncImported();
  toast(`Đã xoá ${list.length} đề`);
  rerender();
});

const qCount = (d) => d.passages.reduce((n, p) => n + p.groups.reduce((m, g) => m + g.items.length, 0), 0);

function previewHtml() {
  const ok = imp.sets.filter((s) => s.data);
  const rows = imp.sets.map((s) => {
    if (!s.data) {
      return `<div class="card" style="border-left:4px solid var(--red)"><b>${esc(s.title || s.id)}</b>
        <p class="small" style="margin-top:4px">${icon('x', 'sm')} ${esc(s.error)}</p>
        <p class="small faint" style="margin-top:4px">${Object.entries(s.files).filter(([, v]) => v).map(([k, v]) => `${KIND_NAME[k]}: ${esc(v)}`).join('<br>')}</p></div>`;
    }
    const notes = s.notes.length ? `<details style="margin-top:6px"><summary class="small muted">${s.notes.length} lưu ý nhỏ (vẫn dùng được)</summary><ul class="r-ul small">${s.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></details>` : '';
    return `<div class="card"><div class="row-between"><b>${esc(s.title)}</b><span class="tag">${qCount(s.data)} câu</span></div>
      <p class="small muted" style="margin-top:4px">${s.data.passages.map((p) => esc(p.title)).join(' · ')}</p>
      ${s.replace ? '<p class="small" style="margin-top:4px">Sẽ thay bản đã nhập trước đó (giữ kết quả đã làm).</p>' : ''}${notes}</div>`;
  }).join('');
  const unused = imp.unused.length ? `<details class="card"><summary class="small muted">${imp.unused.length} file không dùng</summary><ul class="r-ul small">${imp.unused.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></details>` : '';
  return `<h2>Kiểm tra trước khi thêm</h2>${rows}${unused}
    <button class="btn" style="margin-top:12px" data-act="ri-save" ${ok.length ? '' : 'disabled'}>${ok.length ? `Thêm ${ok.length} đề vào Reading` : 'Không có đề nào dùng được'}</button>
    <button class="btn ghost" style="margin-top:8px" data-act="ri-cancel">Chọn lại</button>`;
}

export function rImportView() {
  const nav = navBar('Nhập đề Reading', { fallback: '#/reading' });
  const help = `<div class="card"><p>Mỗi đề cần <b>3 file .md</b>:</p>
    <ul class="r-ul small" style="margin-top:6px">
      <li><b>Đề + đáp án</b>, ví dụ <i>Practice Cam 11 Reading Test 01 _ IELTS Training Online.md</i></li>
      <li><b>Simplify</b>, ví dụ <i>cam11-test1-simplify-connection-full.md</i></li>
      <li><b>Giải chi tiết</b>, ví dụ <i>cam11-test1-reading-giai-chi-tiet.md</i></li></ul>
    <p class="small muted" style="margin-top:8px">Bạn có thể chọn cùng lúc nhiều đề (cả thư mục Lychee) hoặc một file .zip. App tự ghép 3 file của cùng một đề và bỏ qua file khác (PDF, CSV…).</p>
    <button class="btn" style="margin-top:12px" data-act="ri-pick" ${imp.busy ? 'disabled' : ''}>${icon('upload', 'sm')} ${imp.busy ? 'Đang đọc file…' : 'Chọn file'}</button>
    <input type="file" id="ri-files" data-change="ri-files" multiple hidden accept="${ACCEPT}"></div>`;
  const err = imp.error ? `<div class="banner" style="margin-top:12px">${icon('info')}<span>${esc(imp.error)}</span></div>` : '';
  const list = importedTests().sort((a, b) => (a.title < b.title ? -1 : 1));
  const mine = list.length ? `<h2>Đề đã nhập · ${list.length}</h2><div class="wlist" style="margin-top:0">${list.map((r) => `<div class="wrow"><div class="body"><span style="font-weight:600">${esc(r.title)}</span><p>${r.data.passages.map((p) => esc(p.title)).join(' · ')}</p></div>
      <button class="iconbtn sm" data-act="ri-del" data-id="${esc(r.id)}" aria-label="Xoá đề">${icon('trash', 'sm')}</button></div>`).join('')}</div>
    ${list.length > 1 ? `<button class="btn ghost danger-text" style="margin-top:10px" data-act="ri-del-all">${icon('trash', 'sm')} Xoá tất cả ${list.length} đề đã nhập</button>` : ''}` : '';
  return `<div class="page">${nav}${help}${err}${imp.sets ? previewHtml() : ''}${mine}
    <p class="small faint" style="margin:14px 2px 0">Đề nhập chỉ lưu trên máy này và có trong file sao lưu.</p></div>`;
}
