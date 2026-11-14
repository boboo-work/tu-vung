#!/usr/bin/env python3
"""Chuyển một bộ đề Reading (3 file Markdown) thành dữ liệu cho app.

Bộ 3 file (cùng một đề, 3 passage):
  1. Đề + đáp án            (Practice_Cam_20_Reading_Test_01.md)
  2. Simplify + connection  (cam20-test1-simplify-connection-full.md)
  3. Giải chi tiết 4 bước    (cam20-test1-reading-giai-chi-tiet.md)

Cách dùng:
  python3 tools/reading_import.py --id cam20-t1 --title "Cambridge 20 · Test 1" \
      --topics "Động vật,Thực vật,Tâm lý học" DE.md SIMPLIFY.md GIAI.md

Kết quả: content/reading/<id>.json và cập nhật content/reading/index.json.
Câu trong bài lấy từ file Simplify (đã tách và đánh số ①②…), nên vị trí "đoạn 3②"
trong file giải trỏ đúng câu. Công cụ dừng lại và báo lỗi nếu dữ liệu không khớp
(thiếu đáp án, vị trí không tồn tại, đáp án file giải khác bảng đáp án…).
"""
import argparse, json, os, re, sys, unicodedata

CIRC = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳'
CIRC_RE = f'[{CIRC}]'
# Lỗi tách chữ hay gặp khi chép từ PDF.
FIXES = [('kā kā pō', 'kākāpō'), ('Kā kā pō', 'Kākāpō')]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def fix(s):
    for a, b in FIXES:
        s = s.replace(a, b)
    return s


def die(msg):
    print('LỖI:', msg, file=sys.stderr)
    sys.exit(1)


def circ_list(s):
    """'②–⑤' → [1,2,3,4]; '③④' → [2,3]."""
    out = []
    s = s.replace('-', '–')
    parts = re.findall(f'{CIRC_RE}(?:–{CIRC_RE})?', s)
    for p in parts:
        if '–' in p:
            a, b = CIRC.index(p[0]), CIRC.index(p[-1])
            out += list(range(a, b + 1))
        else:
            out.append(CIRC.index(p))
    return out


def words(s):
    s = unicodedata.normalize('NFC', fix(s)).lower().replace('’', "'")
    return re.findall(r"[a-zāēīōū0-9]+(?:'[a-z]+)?", s)


# ---------------------------------------------------------------- file Simplify
def parse_simplify(text):
    passages, cur, para = [], None, None
    exercises = {'q': '', 'a': ''}
    lines = text.split('\n')
    i, mode = 0, None
    ex_buf = None
    for line in lines:
        if line.startswith('# BÀI TẬP'):
            ex_buf = 'q'; continue
        if ex_buf:
            if line.startswith('## Đáp án'):
                ex_buf = 'a'; continue
            exercises[ex_buf] += line + '\n'
            continue
        m = re.match(r'^# PASSAGE (\d+)', line)
        if m:
            cur = {'n': int(m.group(1)), 'paras': []}
            passages.append(cur); para = None; continue
        m = re.match(r'^## Đoạn (\S+)', line)
        if m and cur is not None:
            para = {'label': m.group(1), 'sents': [], 'simp': [], 'conn': '', 'main': '', 'warn': []}
            cur['paras'].append(para); continue
        if para is None:
            continue
        m = re.match(rf'^>\s*({CIRC_RE})\s*(.+)$', line)
        if m:
            idx = CIRC.index(m.group(1))
            if idx != len(para['sents']):
                die(f'Đoạn {para["label"]} (passage {cur["n"]}): câu {m.group(1)} không đúng thứ tự')
            para['sents'].append(fix(m.group(2).strip()))
            continue
        if line.startswith('**Simplify:**'):
            body = line[len('**Simplify:**'):].strip()
            items = re.findall(rf'((?:{CIRC_RE})*)\s*\*\*(.+?)\*\*(?:\s*\(([^()]*)\))?', body)
            for nums, t, note in items:
                if t.startswith('→'):  # "(**→ Q1**)" bị bắt nhầm khi không có ngoặc
                    continue
                q = [int(x) for x in re.findall(r'Q(\d+)', note or '')]
                note_clean = re.sub(r'\*\*→\s*Q\d+(?:\s*[A-Z])?\*\*:?\s*', '', note or '').strip()
                idx = circ_list(nums) if nums else list(range(len(para['sents'])))
                para['simp'].append({'idx': idx, 'text': fix(t.strip()), 'note': note_clean, 'q': q})
            continue
        if line.startswith('**Read connection:**'):
            para['conn'] = fix(line[len('**Read connection:**'):].strip()); continue
        m = re.match(r'^→\s*\*\*Main idea:\s*(.+?)\*\*\s*$', line)
        if m:
            para['main'] = m.group(1).strip(); continue
        if line.startswith('⚠️'):
            para['warn'].append(fix(line)); continue
    return passages, {k: v.strip() for k, v in exercises.items()}


# ---------------------------------------------------------------- file đề
def parse_test(text):
    text = fix(text)
    secs = re.split(r'^## READING PASSAGE (\d+)\s*$', text, flags=re.M)
    answers_part = text[text.find('## Answer'):] if '## Answer' in text else ''
    key = {int(n): a.strip() for n, a in re.findall(r'^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*$', answers_part, flags=re.M)}
    passages = []
    for j in range(1, len(secs), 2):
        n, body = int(secs[j]), secs[j + 1]
        body = body.split('## Answer')[0]
        title = re.search(r'^###\s+(?!Questions)(.+)$', body, flags=re.M).group(1).strip()
        after_title = body[body.find(title) + len(title):]
        sub = re.search(r'^\*([^*].+?)\*\s*$', after_title, flags=re.M)
        subtitle = sub.group(1).strip() if sub and after_title.find(sub.group(0)) < after_title.find('###') else ''
        foot = re.findall(r'^\\\*\s*\*(.+?)\*\s*$', body, flags=re.M)
        groups = []
        for gm in re.finditer(r'^### Questions (\d+)[–-](\d+)\s*$(.*?)(?=^### Questions|^---|\Z)', body, flags=re.M | re.S):
            groups.append(parse_group(int(gm.group(1)), int(gm.group(2)), gm.group(3)))
        passages.append({'n': n, 'title': title, 'subtitle': subtitle, 'footnote': [fix(f) for f in foot], 'groups': groups})
    return passages, key


def opt_lines(block):
    return [(k, t.strip()) for k, t in re.findall(r'^-\s*\*\*([A-Z])\*\*\s+(.+)$', block, flags=re.M)]


def parse_group(a, b, block):
    up = block.upper()
    g = {'from': a, 'to': b, 'options': [], 'context': '', 'limit': '', 'maxWords': 0}
    instr = []
    for line in block.strip().split('\n'):
        s = line.strip()
        if not s or s.startswith('|') or s.startswith('- **') or re.match(r'^(\*\*)?\d+\.', s):
            continue
        if re.match(r'^Write (the correct|your answers)|^In boxes', s):
            continue
        if s.startswith('**NB**'):
            instr.append(s); continue
        if re.match(r'^(Do the following|Choose|Complete|Which|Reading Passage|Look at|Match)', s):
            instr.append(s)
    g['instr'] = ' '.join(instr)
    if 'NOT GIVEN' in up and 'TRUE' in up:
        g['type'] = 'tf'; g['options'] = [('TRUE', 'TRUE'), ('FALSE', 'FALSE'), ('NOT GIVEN', 'NOT GIVEN')]
    elif 'NOT GIVEN' in up and 'YES' in up:
        g['type'] = 'tf'; g['options'] = [('YES', 'YES'), ('NO', 'NO'), ('NOT GIVEN', 'NOT GIVEN')]
    elif re.search(r'ONE WORD|NO MORE THAN|WORDS? (AND/OR|ONLY)', up) and 'COMPLETE' in up:
        g['type'] = 'gap'
        lim = re.search(r'\*\*((?:ONE|NO MORE THAN)[^*]+)\*\*', block)
        g['limit'] = lim.group(1).strip() if lim else ''
        nums = {'ONE': 1, 'TWO': 2, 'THREE': 3, 'FOUR': 4}
        mw = re.search(r'(ONE|TWO|THREE|FOUR) WORD', g['limit'].upper())
        g['maxWords'] = nums[mw.group(1)] if mw else 0
        g['number'] = 'NUMBER' in g['limit'].upper()
    else:
        g['type'] = 'choice'
        ol = opt_lines(block)
        # Chữ cái lặp lại = mỗi câu có phương án riêng (Multiple Choice); không lặp = danh sách chung.
        g['options'] = ol if ol and len({k for k, _ in ol}) == len(ol) else []
    items = []
    if g['type'] == 'gap':
        # Phần ghi chú/tóm tắt: giữ nguyên để hiện toàn bộ, mỗi ô trống là một câu hỏi.
        ctx_lines = [l for l in block.strip().split('\n') if l.strip() and not l.strip().startswith(('Complete', 'Choose', 'Write'))]
        g['context'] = '\n'.join(ctx_lines).strip()
        for line in ctx_lines:
            for m in re.finditer(r'\*\*(\d+)\*\*\s*_+', line):
                n = int(m.group(1))
                if not (a <= n <= b):
                    continue
                # Câu chứa ô trống (với đoạn tóm tắt: cắt đúng câu đó).
                sents = re.split(r'(?<=[.!?])\s+', line.strip().lstrip('- ').strip())
                sent = next(x for x in sents if f'**{n}**' in x)
                q = re.sub(rf'\*\*{n}\*\*\s*_+', '______', sent)
                q = re.sub(r'\*\*(\d+)\*\*\s*_+', '…', q).replace('**', '')
                items.append({'n': n, 'q': q.strip()})
    else:
        # Câu hỏi đánh số "1. …" hoặc "**27.** …", phương án riêng nếu có.
        parts = re.split(r'^(?:\*\*)?(\d+)\.(?:\*\*)?\s+', block, flags=re.M)
        for k in range(1, len(parts), 2):
            n = int(parts[k])
            if not (a <= n <= b):
                continue
            seg = parts[k + 1]
            q = seg.strip().split('\n')[0].strip()
            own = opt_lines(seg) if g['type'] == 'choice' and not g['options'] else []
            it = {'n': n, 'q': q}
            if own:
                it['options'] = own
            items.append(it)
        if g['type'] == 'choice' and not g['options'] and not any('options' in i for i in items):
            # "Which section contains…" → các chữ cái A–G.
            m = re.search(r'\*\*([A-Z])[–-]([A-Z])\*\*', block)
            if not m:
                die(f'Câu {a}–{b}: không tìm thấy các phương án')
            g['options'] = [(chr(c), '') for c in range(ord(m.group(1)), ord(m.group(2)) + 1)]
    if [i['n'] for i in items] != list(range(a, b + 1)):
        die(f'Câu {a}–{b}: đọc được {[i["n"] for i in items]}')
    g['items'] = items
    return g


# ---------------------------------------------------------------- file giải
def parse_giai(text):
    text = fix(text)
    out, guides = {}, {}
    # Phần mở đầu của từng nhóm câu hỏi (ví dụ bảng "Người | Ý chính").
    for m in re.finditer(r'^## Q(\d+)[–-](\d+)[^\n]*\n(.*?)(?=^\*\*Q\d+\.)', text, flags=re.M | re.S):
        body = m.group(3).strip()
        if body:
            guides[(int(m.group(1)), int(m.group(2)))] = body
    heads = list(re.finditer(r'^\*\*Q(\d+)\.\s*(.+?)\*\*', text, flags=re.M))
    for k, h in enumerate(heads):
        start = h.end()
        end = heads[k + 1].start() if k + 1 < len(heads) else len(text)
        block = text[start:end]
        block = re.split(r'^(?:---|## |# )', block, flags=re.M)[0].strip()
        n = int(h.group(1))
        ans = None
        m = re.search(r'→\s*\*\*Đáp án:\s*([^*]+)\*\*', block) or re.search(r'→\s*\*\*([A-Z]{1,3}(?: [A-Z]+)*)\*\*', block)
        if m:
            ans = m.group(1).strip()
        loc = []
        b2 = re.search(r'Bước 2[^:]*:\*?\s*(.*?)(?=\*Bước 3|$)', block, flags=re.S)
        if b2:
            for lab, cs in re.findall(rf'(?:đoạn\s+|và\s+)([0-9]+|[A-Z])((?:{CIRC_RE}|[–-])+)', b2.group(1)):
                for c in circ_list(cs):
                    loc.append([lab, c])
        pairs = [[fix(a).strip(), fix(b).strip()] for a, b in re.findall(r'`([^`]+)`\s*↔\s*`([^`]+)`', block)]
        out[n] = {'exp': block, 'ans': ans, 'loc': loc, 'pairs': pairs}
    method = re.search(r'^## PHẦN 0[^\n]*\n(.*?)(?=^---|^# )', text, flags=re.M | re.S)
    traps = re.search(r'^## Bẫy hay gặp[^\n]*\n(.*)\Z', text, flags=re.M | re.S)
    band = re.search(r'^\*\*Quy đổi band[^\n]*$', text, flags=re.M)
    return out, guides, {
        'method': method.group(1).strip() if method else '',
        'traps': traps.group(1).strip() if traps else '',
        'band': band.group(0).strip() if band else '',
    }


def norm_ans(s):
    return re.sub(r'\s+', ' ', s.strip().lower())


def keep_mask(sentence, simplified):
    """Câu rút gọn là câu gốc bỏ bớt chữ → trả về dấu giữ/bỏ cho từng chữ của câu gốc."""
    toks = sentence.split()
    want = words(simplified)
    tw = [words(t) for t in toks]
    mask, j = [], 0
    for ws in tw:
        if ws and j < len(want) and ws[0] == want[j] and all(want[j + q:j + q + 1] == [w] for q, w in enumerate(ws)):
            mask.append(1); j += len(ws)
        else:
            mask.append(0)
    if j != len(want):
        return None
    kept = sum(mask)
    if kept == len(toks) or kept < 2:
        return None
    return mask


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--id', required=True)
    ap.add_argument('--title', required=True)
    ap.add_argument('--topics', default='')
    ap.add_argument('test'); ap.add_argument('simplify'); ap.add_argument('giai')
    a = ap.parse_args()
    read = lambda p: unicodedata.normalize('NFC', open(p, encoding='utf-8').read())
    tps, key = parse_test(read(a.test))
    sps, exercises = parse_simplify(read(a.simplify))
    gi, guides, extra = parse_giai(read(a.giai))
    topics = [t.strip() for t in a.topics.split(',')] if a.topics else []
    if len(tps) != len(sps):
        die(f'Số passage khác nhau: đề {len(tps)}, Simplify {len(sps)}')
    problems = []
    out_passages = []
    for pi, (tp, sp) in enumerate(zip(tps, sps)):
        labels = [p['label'] for p in sp['paras']]
        # 1) Câu trong file Simplify phải phủ đúng bài đọc trong file đề.
        test_body = read(a.test)
        paras = []
        for p in sp['paras']:
            simp = []
            for s in p['simp']:
                if any(i >= len(p['sents']) for i in s['idx']):
                    die(f'P{tp["n"]} đoạn {p["label"]}: Simplify trỏ câu không tồn tại {s["idx"]}')
                item = {'idx': s['idx'], 'text': s['text']}
                if s['note']: item['note'] = s['note']
                if s['q']: item['q'] = s['q']
                if len(s['idx']) == 1:
                    m = keep_mask(p['sents'][s['idx'][0]], s['text'])
                    if m: item['keep'] = m
                simp.append(item)
            paras.append({'label': p['label'], 'sents': p['sents'], 'simp': simp, 'conn': p['conn'], 'main': p['main'], 'warn': p['warn']})
        groups = []
        for g in tp['groups']:
            items = []
            for it in g['items']:
                n = it['n']
                if n not in key:
                    die(f'Câu {n}: không có trong bảng đáp án')
                ans = [x.strip() for x in re.split(r'\s*/\s*|\s+OR\s+', key[n]) if x.strip()]
                info = gi.get(n)
                if not info:
                    problems.append(f'Câu {n}: file giải không có lời giải')
                    info = {'exp': '', 'ans': None, 'loc': [], 'pairs': []}
                if info['ans'] and norm_ans(info['ans']) not in [norm_ans(x) for x in ans] and norm_ans(info['ans'].split(' ')[0]) not in [norm_ans(x) for x in ans]:
                    die(f'Câu {n}: file giải ghi "{info["ans"]}", bảng đáp án ghi "{key[n]}"')
                loc = []
                for lab, si in info['loc']:
                    if lab not in labels:
                        die(f'Câu {n}: vị trí đoạn {lab} không có (có {labels})')
                    pidx = labels.index(lab)
                    if si >= len(paras[pidx]['sents']):
                        die(f'Câu {n}: đoạn {lab} không có câu số {si + 1}')
                    loc.append([pidx, si])
                if not loc and info['exp']:
                    # Không có "Bước 2": thử dạng "(D⑥)", rồi tìm câu chứa đoạn trích trong `…`.
                    for lab, cs in re.findall(rf'\(([0-9]+|[A-Z])((?:{CIRC_RE})+)\)', info['exp']):
                        if lab in labels:
                            loc += [[labels.index(lab), c] for c in circ_list(cs) if c < len(paras[labels.index(lab)]['sents'])]
                    if not loc:
                        for quote in re.findall(r'`([^`]{12,})`', info['exp']):
                            frag = words(quote.split('…')[0])[:6]
                            for pidx, p in enumerate(paras):
                                for si, s in enumerate(p['sents']):
                                    ws = words(s)
                                    if frag and any(ws[k:k + len(frag)] == frag for k in range(len(ws))):
                                        loc.append([pidx, si])
                            if loc:
                                break
                if not loc:
                    problems.append(f'Câu {n}: chưa có vị trí trong bài (bỏ bước định vị)')
                q = dict(it)
                if 'options' in q:
                    q['options'] = [{'k': k, 't': t} for k, t in q['options']]
                q.update({'a': ans, 'loc': loc, 'exp': info['exp'], 'pairs': info['pairs']})
                items.append(q)
            gg = {'from': g['from'], 'to': g['to'], 'type': g['type'], 'instr': g['instr'], 'items': items}
            if g['options']: gg['options'] = [{'k': k, 't': t} for k, t in g['options']]
            if g['type'] == 'gap': gg.update({'limit': g['limit'], 'maxWords': g['maxWords'], 'number': g['number'], 'context': g['context']})
            guide = guides.get((g['from'], g['to']))
            if guide: gg['guide'] = guide
            groups.append(gg)
        out_passages.append({
            'id': f'{a.id}-p{tp["n"]}', 'n': tp['n'], 'title': tp['title'], 'subtitle': tp['subtitle'],
            'topic': topics[pi] if pi < len(topics) else '', 'footnote': tp['footnote'], 'paras': paras, 'groups': groups,
        })
        # Kiểm tra câu trong file Simplify phủ đúng bài trong file đề.
        body_words = words(re.split(r'^### Questions', test_body.split(f'## READING PASSAGE {tp["n"]}')[1], flags=re.M)[0])
        sent_words = [w for p in paras for s in p['sents'] for w in words(s)]
        missing = [w for w in set(body_words) - set(sent_words) if len(w) > 3]
        if missing:
            problems.append(f'P{tp["n"]}: {len(missing)} từ có trong đề nhưng không có trong file Simplify, ví dụ {sorted(missing)[:8]}')
    data = {'id': a.id, 'title': a.title, 'version': 1, 'passages': out_passages, 'exercises': exercises, **extra}
    os.makedirs(os.path.join(ROOT, 'content', 'reading'), exist_ok=True)
    path = os.path.join(ROOT, 'content', 'reading', f'{a.id}.json')
    json.dump(data, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    idx_path = os.path.join(ROOT, 'content', 'reading', 'index.json')
    idx = json.load(open(idx_path, encoding='utf-8')) if os.path.exists(idx_path) else {'version': 1, 'tests': []}
    entry = {'id': a.id, 'title': a.title, 'file': f'content/reading/{a.id}.json', 'passages': [
        {'id': p['id'], 'n': p['n'], 'title': p['title'], 'topic': p['topic'], 'questions': sum(len(g['items']) for g in p['groups']),
         'types': sorted({g['type'] for g in p['groups']})} for p in out_passages]}
    idx['tests'] = [t for t in idx['tests'] if t['id'] != a.id] + [entry]
    json.dump(idx, open(idx_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    total = sum(len(g['items']) for p in out_passages for g in p['groups'])
    strike = sum(1 for p in out_passages for pa in p['paras'] for s in pa['simp'] if 'keep' in s)
    allsimp = sum(1 for p in out_passages for pa in p['paras'] for s in pa['simp'])
    print(f'OK {path}: {len(out_passages)} passage, {total} câu hỏi, {strike}/{allsimp} câu Simplify chấm được bằng gạch chữ')
    for p in problems:
        print('  lưu ý:', p)


if __name__ == '__main__':
    main()
