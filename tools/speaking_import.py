#!/usr/bin/env python3
"""Nhập bộ đề IELTS Speaking theo quý (file Markdown) thành dữ liệu cho app.

Cách dùng:
    python3 tools/speaking_import.py "…/Speaking" content/speaking

Thư mục nguồn có dạng:
    Part 1/Forecast Q2-2026/*.md      (mỗi file 4 chủ đề, hoặc 1 chủ đề bắt buộc)
    Part 2&3/Forecast Q3-2026/*.md    (mỗi file 1 đề Part 2 kèm câu hỏi Part 3)

Đọc được 2 kiểu viết của Part 1 (Quý 2: **Q1. …** / **Band 6.0–6.5:** …; Quý 3: ### Q1. … / **Band 6.0–6.5** + > …)
và 2 kiểu của Part 2&3. Kết quả:
    content/speaking/index.json        danh sách quý, chủ đề Part 1, đề Part 2 (để hiện danh sách nhanh)
    content/speaking/<quý>-p1.json      toàn bộ câu hỏi + bài mẫu Part 1 của quý
    content/speaking/<quý>-p23.json     toàn bộ đề Part 2 + câu hỏi Part 3 của quý
In ra số câu đọc được và câu nào thiếu bài mẫu.
"""
import json
import os
import re
import sys

DASH = r'[–—-]'
BAND6 = re.compile(rf'^\*\*(?:Band\s*)?6\.0\s*{DASH}\s*6\.5:?\*\*:?\s*(.*)$')
BAND7 = re.compile(r'^\*\*(?:Band\s*)?7\.0:?\*\*:?\s*(.*)$')
INLINE_QA = re.compile(rf'^\*\*(Q[\d\s&,Q]+)\.\s*(.+?)\*\*\s*[—–-]\s*6\.0\s*{DASH}\s*6\.5:\s*(.+?)\s*/\s*7\.0:\s*(.+)$')
QBOLD = re.compile(r'^\*\*(Q[\d\s&,Q]+)(?:\s*\([^)]*\))?\.\s*(.+?)\*\*\s*$')
QHEAD = re.compile(r'^#{2,4}\s+(?:Q|W|S)?(\d+)(?:\s*\([^)]*\))?[.:]\s*(.+)$')
QOPEN = re.compile(r'^#{2,4}\s+Câu mở đầu:\s*(.+)$')
QEXT = re.compile(r'^#{2,4}\s+Câu mở rộng\s*\d*[^:]*:?\s*(.*)$')
VI = re.compile(r'^\*\((.+)\)\*\s*$')
VOCAB_INLINE = re.compile(r'^\*\*Từ vựng[^*]*:?\*\*:?\s*(.+)$')
GRAMMAR = re.compile(r'^\*\*Ngữ pháp:?\*\*:?\s*(.*)$')


def clean(s):
    return re.sub(r'\s+', ' ', (s or '').replace('\u00a0', ' ')).strip()


def inline_vocab(s):
    """*phrase* = nghĩa · *phrase 2* = nghĩa 2"""
    out = []
    for part in re.split(r'\s+·\s+', s):
        m = re.match(r'^\*([^*]+)\*\s*=\s*(.+)$', part.strip())
        if m:
            out.append({'p': clean(m.group(1)), 'm': clean(m.group(2))})
        elif part.strip():
            out.append({'p': clean(part.strip('* ')), 'm': ''})
    return out


def table_rows(lines, i):
    """Đọc bảng Markdown bắt đầu ở dòng i. Trả về (header, rows, i_sau_bảng)."""
    def cells(line):
        return [clean(c) for c in line.strip().strip('|').split('|')]
    header = [c.lower() for c in cells(lines[i])]
    i += 1
    if i < len(lines) and re.match(r'^\s*\|?\s*:?-{2,}', lines[i]):
        i += 1
    rows = []
    while i < len(lines) and lines[i].strip().startswith('|'):
        rows.append(cells(lines[i]))
        i += 1
    return header, rows, i


def vocab_from_table(header, rows):
    out = []
    for r in rows:
        d = dict(zip(header, r))
        p = d.get('cụm từ') or (r[0] if r else '')
        if not p:
            continue
        item = {'p': p, 'm': d.get('nghĩa', r[1] if len(r) > 1 else '')}
        use = next((v for k, v in d.items() if k.startswith('cách dùng')), '')
        err = d.get('lỗi hay gặp', '')
        if use and use not in ('–', '-'):
            item['u'] = use
        if err and err not in ('–', '-'):
            item['e'] = err
        out.append(item)
    return out


def quote_block(lines, i):
    """Đọc các dòng '> …' liên tiếp (bỏ dòng trống bên trong). Trả về (đoạn văn, i)."""
    paras, cur = [], []
    while i < len(lines):
        s = lines[i].rstrip()
        if s.startswith('>'):
            t = s[1:].strip()
            if t:
                cur.append(t)
            elif cur:
                paras.append(' '.join(cur)); cur = []
            i += 1
        elif not s.strip() and i + 1 < len(lines) and lines[i + 1].startswith('>'):
            i += 1
        else:
            break
    if cur:
        paras.append(' '.join(cur))
    return '\n\n'.join(clean(p) for p in paras), i


def plain_block(lines, i):
    """Đọc các đoạn văn thường đến tiêu đề / đường kẻ / bảng tiếp theo."""
    paras, cur = [], []
    while i < len(lines):
        s = lines[i].rstrip()
        if s.startswith('#') or s.startswith('---') or s.startswith('|') or (s.startswith('**') and not s.startswith('**' + s[2:3].lower())):
            break
        if not s.strip():
            if cur:
                paras.append(' '.join(cur)); cur = []
        else:
            cur.append(s.strip().lstrip('> ').strip())
        i += 1
    if cur:
        paras.append(' '.join(cur))
    return '\n\n'.join(clean(p) for p in paras if clean(p)), i


def read_answer(lines, i, inline):
    """Bài mẫu: phần còn lại của dòng nhãn, hoặc khối trích dẫn ở dòng dưới."""
    if inline.strip():
        return clean(inline), i + 1
    j = i + 1
    while j < len(lines) and not lines[j].strip():
        j += 1
    if j < len(lines) and lines[j].startswith('>'):
        return quote_block(lines, j)
    return plain_block(lines, j)


def grammar_block(lines, i, first):
    """**Ngữ pháp:** … (+ dòng 'Áp dụng: …' ngay dưới)."""
    text = [first] if first.strip() else []
    i += 1
    while i < len(lines) and lines[i].strip() and not re.match(r'^(#|\||---|\*\*Band|\*\*Q|\*\*Từ vựng|\*\*6\.0|\*\*7\.0|>)', lines[i]):
        text.append(lines[i].strip())
        i += 1
    return clean(' '.join(text)), i


def new_q(q, vi='', extra=False):
    return {'q': clean(q.strip('* ')), 'vi': clean(vi), 'a6': '', 'a7': '', 'vocab': [], 'grammar': '', 'extra': extra}


def split_qnums(label):
    return [int(x) for x in re.findall(r'\d+', label)]


# ---------------------------------------------------------------- Part 1
def parse_part1(path, quarter):
    lines = open(path, encoding='utf-8').read().split('\n')
    topics, by_n = [], {}
    topic = q = None
    in_extra = False  # phần "BỔ SUNG – các câu trong PDF…"
    pending = None    # 'a6' | 'a7' khi nhãn band đứng riêng một dòng
    note = ''
    i = 0

    def start_topic(n, title, key=None):
        nonlocal topic, q
        title = clean(re.sub(r'\(BẢN MẪU\)', '', title, flags=re.I)).strip(' –-')
        k = key or n
        if k in by_n:
            topic = by_n[k]
        else:
            topic = {'n': n, 'key': k, 'title': title, 'qs': [], 'vocab': [], 'note': note}
            by_n[k] = topic
            topics.append(topic)
        q = None

    while i < len(lines):
        raw = lines[i].rstrip()
        s = raw.strip()
        # Ghi chú giả định ở đầu file
        if s.startswith('>') and not topics and ('giả định' in s.lower() or 'lưu ý' in s.lower()):
            note = clean(re.sub(r'\*\*', '', s.lstrip('> ')))
            i += 1; continue
        if re.match(r'^##\s+BỔ SUNG', s):
            in_extra = True; i += 1; continue
        if re.match(r'^##\s+(Gợi ý luyện tập|Tổng kết|0\. Công thức)', s):
            # bỏ qua cả mục
            i += 1
            while i < len(lines) and not re.match(r'^#{1,2}\s', lines[i]) and not lines[i].startswith('---'):
                i += 1
            continue
        m = re.match(r'^#{2,3}\s+Topic\s+(\d+):\s*(.+)$', s)          # Quý 2
        if m:
            start_topic(int(m.group(1)), m.group(2)); i += 1; continue
        m = re.match(r'^#\s+(\d+)\.\s+(.+)$', s)                         # Quý 3: # 1. COMPUTERS / TABLETS
        if m:
            start_topic(int(m.group(1)), m.group(2).title() if m.group(2).isupper() else m.group(2)); i += 1; continue
        m = re.match(r'^##\s+I\.\s*Compulsory Frames\s*[–-]\s*(\d+)\.\s*(.+)$', s)  # chủ đề bắt buộc
        if m:
            start_topic(0, m.group(2), key=f'I{m.group(1)}'); topic['compulsory'] = True; i += 1; continue
        m = re.match(r'^#\s+PHẦN\s+([A-Z])\s*[–-]\s*(.+)$', s)            # Work / Study tách 2 chủ đề
        if m and topic and topic.get('compulsory'):
            base = topic['key'].split('-')[0]
            start_topic(0, m.group(2).title(), key=f'{base}-{m.group(1)}'); topic['compulsory'] = True; i += 1; continue
        if topic is None:
            i += 1; continue
        m = INLINE_QA.match(s)
        if m:
            qq = new_q(m.group(2), extra=True)
            qq['a6'], qq['a7'] = clean(m.group(3)), clean(m.group(4))
            topic['qs'].append(qq); q = qq; i += 1; continue
        m = QBOLD.match(s) or QHEAD.match(s) or QOPEN.match(s) or (QEXT.match(s) if QEXT.match(s) and QEXT.match(s).group(1) else None)
        if m and not re.match(r'^#{2,4}\s+Topic', s):
            text = m.groups()[-1]
            vi = ''
            j = i + 1
            while j < len(lines) and not lines[j].strip():
                j += 1
            if j < len(lines) and VI.match(lines[j].strip()):
                vi = VI.match(lines[j].strip()).group(1); i = j
            q = new_q(text, vi, extra=in_extra or bool(QEXT.match(s)))
            topic['qs'].append(q); i += 1; continue
        m = BAND6.match(s)
        if m and q is not None:
            q['a6'], i = read_answer(lines, i, m.group(1)); continue
        m = BAND7.match(s)
        if m and q is not None:
            q['a7'], i = read_answer(lines, i, m.group(1)); continue
        m = VOCAB_INLINE.match(s)
        if m:
            topic['vocab'].extend(inline_vocab(m.group(1)))  # kiểu Quý 2: từ vựng chung cho cả chủ đề
            i += 1; continue
        if s.startswith('|') and q is not None and 'cụm từ' in s.lower():
            h, rows, i = table_rows(lines, i)
            q['vocab'].extend(vocab_from_table(h, rows)); continue
        m = GRAMMAR.match(s)
        if m and q is not None:
            q['grammar'], i = grammar_block(lines, i, m.group(1)); continue
        i += 1
    for t in topics:
        t['qs'] = [x for x in t['qs'] if x['q']]
    return topics


# ---------------------------------------------------------------- Part 2 & 3
def parse_card(path):
    lines = open(path, encoding='utf-8').read().split('\n')
    card = {'title': '', 'points': [], 'note': '', 'notes': [], 'a6': '', 'a7': '', 'vocab': [], 'grammar': [], 'p3': [], 'p3vocab': []}
    sect = 'head'
    q = None
    i = 0
    while i < len(lines):
        s = lines[i].strip()
        if re.match(r'^#{1,2}\s+PART\s*2', s, re.I):
            sect = 'p2'; i += 1; continue
        if re.match(r'^#{1,2}\s+PART\s*3', s, re.I):
            sect = 'p3'; q = None; i += 1; continue
        if re.match(r'^#{2,3}\s+(Tổng kết|Lưu ý phát âm|\d+ cụm đáng nhớ|Vì sao)', s):
            sect = 'skip' if sect != 'p3' or s.startswith('## ') else sect
            i += 1
            while i < len(lines) and not re.match(r'^#{1,3}\s', lines[i]):
                i += 1
            continue
        if sect == 'head':
            m = re.match(r'^##\s+Đề\s+\d+:\s*(.+)$', s) or re.match(r'^##\s+(Describe.+)$', s)
            if m:
                card['title'] = clean(m.group(1)); i += 1; continue
            if s.startswith('>') and not card['note']:
                card['note'] = clean(re.sub(r'\*\*', '', s.lstrip('> '))); i += 1; continue
            i += 1; continue
        if sect == 'p2':
            m = re.match(r'^\*\*Cue card:\*\*\s*(.+)$', s)
            if m:
                card['points'] = [clean(x) for x in re.split(r'\s+·\s+', m.group(1)) if clean(x)]
                i += 1; continue
            m = re.match(r'^\*\*(Describe .+?)\*\*$', s)
            if m:
                card['title'] = clean(m.group(1)).rstrip('.') or card['title']; i += 1; continue
            if re.match(r'^You should say', s, re.I):
                i += 1
                while i < len(lines) and (lines[i].strip().startswith('-') or not lines[i].strip()):
                    if lines[i].strip().startswith('-'):
                        card['points'].append(clean(lines[i].strip()[1:]))
                    i += 1
                continue
            if re.match(r'^#{3}\s+Ghi chú', s):
                j = i + 1
                while j < len(lines) and not lines[j].strip().startswith('|'):
                    j += 1
                h, rows, i = table_rows(lines, j)
                card['notes'] = [{'k': r[0], 'v': r[1] if len(r) > 1 else ''} for r in rows if r and r[0]]
                continue
            m = re.match(rf'^#{{2,3}}\s+(?:Bài mẫu\s+)?Band\s+6\.0\s*{DASH}\s*6\.5', s)
            if m:
                j = i + 1
                while j < len(lines) and not lines[j].strip():
                    j += 1
                card['a6'], i = (quote_block(lines, j) if lines[j].startswith('>') else plain_block(lines, j)); continue
            m = re.match(r'^#{2,3}\s+(?:Bài mẫu\s+)?Band\s+7\.0', s)
            if m:
                j = i + 1
                while j < len(lines) and not lines[j].strip():
                    j += 1
                card['a7'], i = (quote_block(lines, j) if lines[j].startswith('>') else plain_block(lines, j)); continue
            if re.match(r'^#{3}\s+Từ vựng', s):
                j = i + 1
                while j < len(lines) and not lines[j].strip():
                    j += 1
                if j < len(lines) and lines[j].strip().startswith('|'):
                    h, rows, i = table_rows(lines, j)
                    card['vocab'].extend(vocab_from_table(h, rows))
                else:
                    card['vocab'].extend(inline_vocab(lines[j].strip())); i = j + 1
                continue
            if re.match(r'^#{3}\s+Ngữ pháp', s):
                i += 1
                while i < len(lines) and not re.match(r'^(#|---)', lines[i]):
                    t = lines[i].strip()
                    if re.match(r'^(\d+\.|-)\s+', t):
                        card['grammar'].append(clean(re.sub(r'^(\d+\.|-)\s+', '', t)))
                    i += 1
                continue
            i += 1; continue
        if sect == 'p3':
            m = re.match(r'^\*\*Từ vựng[^*]*:\*\*\s*(.+)$', s)
            if m:
                card['p3vocab'].extend(inline_vocab(m.group(1))); i += 1; continue
            if re.match(r'^#{3}\s+Từ vựng', s):
                j = i + 1
                while j < len(lines) and not lines[j].strip():
                    j += 1
                if j < len(lines) and lines[j].strip().startswith('|'):
                    h, rows, i = table_rows(lines, j)
                    card['p3vocab'].extend(vocab_from_table(h, rows))
                else:
                    i = j + 1
                continue
            m = QBOLD.match(s) or QHEAD.match(s)
            if m:
                text = m.groups()[-1]
                vi = ''
                j = i + 1
                while j < len(lines) and not lines[j].strip():
                    j += 1
                if j < len(lines) and VI.match(lines[j].strip()):
                    vi = VI.match(lines[j].strip()).group(1); i = j
                q = new_q(text, vi)
                card['p3'].append(q); i += 1; continue
            m = BAND6.match(s)
            if m and q is not None:
                q['a6'], i = read_answer(lines, i, m.group(1)); continue
            m = BAND7.match(s)
            if m and q is not None:
                q['a7'], i = read_answer(lines, i, m.group(1)); continue
            if s.startswith('|') and q is not None and 'cụm từ' in s.lower():
                h, rows, i = table_rows(lines, i)
                q['vocab'].extend(vocab_from_table(h, rows)); continue
            m = GRAMMAR.match(s)
            if m and q is not None:
                q['grammar'], i = grammar_block(lines, i, m.group(1)); continue
            i += 1; continue
        i += 1
    return card


def strip_q(qs):
    for x in qs:
        for k in ('vi', 'grammar'):
            if not x[k]:
                del x[k]
        if not x['vocab']:
            del x['vocab']
        if not x['extra']:
            del x['extra']
    return qs


def main(src, out):
    os.makedirs(out, exist_ok=True)
    index = {'quarters': []}
    problems = []
    totals = {}
    for qdir in sorted(os.listdir(os.path.join(src, 'Part 1'))):
        m = re.match(r'Forecast Q(\d)-(\d{4})', qdir)
        if not m:
            continue
        qn, year = int(m.group(1)), m.group(2)
        qid = f'q{qn}-{year}'
        months = {1: '1–4', 2: '5–8', 3: '9–12'}[qn]
        # ---- Part 1
        p1 = []
        d1 = os.path.join(src, 'Part 1', qdir)
        for f in sorted(os.listdir(d1)):
            if f.endswith('.md'):
                p1.extend(parse_part1(os.path.join(d1, f), qid))
        # chủ đề bắt buộc lên đầu, rồi theo số
        p1 = [t for t in p1 if t['qs']]  # bỏ chủ đề rỗng (ví dụ "Work / Study" đã tách thành Work và Study)
        p1.sort(key=lambda t: (0 if t.get('compulsory') else 1, t['n'], str(t['key'])))
        for t in p1:
            t['id'] = f"{qid}-p1-{str(t['key']).lower()}"
            strip_q(t['qs'])
            for x in t['qs']:
                if not x.get('a6') or not x.get('a7'):
                    problems.append(f"{qid} Part 1 · {t['title']}: thiếu bài mẫu cho “{x['q'][:60]}”")
            if not t['qs']:
                problems.append(f"{qid} Part 1 · {t['title']}: không đọc được câu hỏi nào")
        # ---- Part 2&3
        cards = []
        d2 = os.path.join(src, 'Part 2&3', qdir)
        for f in sorted(os.listdir(d2)) if os.path.isdir(d2) else []:
            if not f.endswith('.md'):
                continue
            n = int(re.search(r'topic-(\d+)', f).group(1))
            c = parse_card(os.path.join(d2, f))
            c['n'] = n
            c['id'] = f'{qid}-c{n:02d}'
            strip_q(c['p3'])
            for k in ('note', 'notes', 'vocab', 'grammar', 'p3vocab'):
                if not c[k]:
                    del c[k]
            name = f"{qid} Part 2 · đề {n}"
            if not c['title']:
                problems.append(f'{name}: không đọc được tiêu đề')
            if len(c['points']) < 3:
                problems.append(f'{name}: chỉ đọc được {len(c["points"])} gợi ý cue card')
            if not c['a6'] or not c['a7']:
                problems.append(f'{name}: thiếu bài mẫu Part 2')
            if not c['p3']:
                problems.append(f'{name}: không đọc được câu Part 3')
            for x in c['p3']:
                if not x.get('a6') or not x.get('a7'):
                    problems.append(f"{name}: Part 3 thiếu bài mẫu cho “{x['q'][:60]}”")
            cards.append(c)
        # Gợi ý cue card bổ sung (khi file nguồn không chép phần "You should say")
        extra_f = os.path.join(os.path.dirname(os.path.abspath(__file__)), f'speaking_cuecards_{qid}.json')
        extra = json.load(open(extra_f, encoding='utf-8')) if os.path.exists(extra_f) else {}
        for c in cards:
            if len(c['points']) < 3 and str(c['n']) in extra:
                c['points'] = extra[str(c['n'])]
                c['guess'] = 1  # app ghi chú: gợi ý do app suy ra
                problems[:] = [p for p in problems if p != f"{qid} Part 2 · đề {c['n']}: chỉ đọc được 0 gợi ý cue card"]
        cards.sort(key=lambda c: c['n'])
        for c in cards:
            del c['n']
        for c, i in zip(cards, range(1, len(cards) + 1)):
            c['n'] = i
        json.dump({'quarter': qid, 'topics': p1}, open(os.path.join(out, f'{qid}-p1.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        json.dump({'quarter': qid, 'cards': cards}, open(os.path.join(out, f'{qid}-p23.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        index['quarters'].append({
            'id': qid, 'title': f'Quý {qn}/{year}', 'months': f'tháng {months}',
            'p1': {'file': f'content/speaking/{qid}-p1.json', 'topics': [{'id': t['id'], 'title': t['title'], 'n': len(t['qs']), **({'c': 1} if t.get('compulsory') else {})} for t in p1]},
            'p23': {'file': f'content/speaking/{qid}-p23.json', 'cards': [{'id': c['id'], 'n': c['n'], 'title': c['title'], 'q3': len(c['p3'])} for c in cards]},
        })
        totals[qid] = (len(p1), sum(len(t['qs']) for t in p1), len(cards), sum(len(c['p3']) for c in cards))
    index['quarters'].sort(key=lambda q: q['id'], reverse=True)  # quý mới nhất lên trên
    json.dump(index, open(os.path.join(out, 'index.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    for k, (t, q1, c, q3) in sorted(totals.items()):
        print(f'{k}: Part 1 {t} chủ đề / {q1} câu · Part 2 {c} đề · Part 3 {q3} câu')
    print(f'{len(problems)} vấn đề')
    for p in problems:
        print('  -', p)


if __name__ == '__main__':
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    main(sys.argv[1], sys.argv[2])
