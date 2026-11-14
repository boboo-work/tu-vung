#!/usr/bin/env python3
"""Chuyển bộ đề Reading (3 file Markdown mỗi đề) thành dữ liệu cho app.

Mỗi đề gồm:
  1. Đề + đáp án       (Practice Cam 17 Reading Test 01 _ ….md — chép từ web, định dạng lộn xộn)
  2. Simplify           (cam17-test1-simplify-connection-full.md)
  3. Giải chi tiết      (cam17-test1-reading-giai-chi-tiet.md)

Một đề:
  python3 tools/reading_import.py one --id cam20-t1 --title "Cambridge 20 · Test 1" DE.md SIMPLIFY.md GIAI.md
Cả thư mục (tự ghép file đề với file Simplify theo tên bài đọc, nên tên file đề đặt nhầm cũng không sao):
  python3 tools/reading_import.py dir "…/Lychee 17" [--skip cam20-t1]

Kết quả: content/reading/<id>.json và content/reading/index.json. Đề nào có lỗi nghiêm trọng
(thiếu đáp án, câu hỏi không đọc được) thì bỏ qua và in lý do; lỗi nhẹ in ở dòng "lưu ý".
"""
import argparse, glob, json, os, re, sys, unicodedata

CIRC = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳'
CR = f'[{CIRC}]'
FIXES = [('kā kā pō', 'kākāpō'), ('Kā kā pō', 'Kākāpō'), ('NOTGIVEN', 'NOT GIVEN'), ('NOT  GIVEN', 'NOT GIVEN')]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii']


class Skip(Exception):
    pass


def fix(s):
    s = unicodedata.normalize('NFC', s).replace('\u00a0', ' ').replace('’', "'").replace('‘', "'")
    for a, b in FIXES:
        s = s.replace(a, b)
    return s


def circ_list(s):
    out = []
    s = s.replace('-', '–')
    for p in re.findall(f'{CR}(?:–{CR})?', s):
        if '–' in p:
            out += list(range(CIRC.index(p[0]), CIRC.index(p[-1]) + 1))
        else:
            out.append(CIRC.index(p))
    return out


def words(s):
    s = fix(s).lower()
    return re.findall(r"[a-zāēīōū0-9]+(?:'[a-z]+)?", s)


def strip_md(s):
    """Bỏ ký hiệu đánh dấu: **đậm**, [S]/[V], ~~ (giữ chữ)."""
    s = re.sub(r'\[(?:S|V|O|C)\]\s*', '', s)
    return re.sub(r'\s+', ' ', s.replace('**', '').replace('~~', '').replace('`', '')).strip()


def drop_struck(s):
    return re.sub(r'\s+', ' ', strip_md(re.sub(r'~~.*?~~', ' ', s))).strip(' ,;')


# ================================================================ Simplify
def parse_simplify(text):
    text = fix(text)
    passages, cur, para = [], None, None
    exercises = {'q': '', 'a': ''}
    ex = None
    lines = text.split('\n')
    i = 0
    mode = None  # 'conn' khi đang đọc danh sách Read connection
    while i < len(lines):
        line = lines[i]
        i += 1
        if line.startswith('# BÀI TẬP'):
            ex = 'q'; continue
        if ex:
            if re.match(r'^##\s+Đáp án', line):
                ex = 'a'; continue
            if re.match(r'^# ', line):
                ex = None
            else:
                exercises[ex] += line + '\n'; continue
        m = re.match(r'^# PASSAGE (\d+)', line)
        if m:
            cur = {'n': int(m.group(1)), 'title': re.sub(r'^# PASSAGE \d+\s*[–-]\s*', '', line).strip(), 'paras': []}
            passages.append(cur); para = None; mode = None; continue
        m = re.match(r'^## Đoạn\s+([0-9]+|[A-Z])\b(.*)$', line)
        if m and cur is not None:
            para = {'label': m.group(1), 'sents': [], 'simp': [], 'conn': '', 'main': '', 'warn': [], 'q': [int(x) for x in re.findall(r'Q(\d+)', m.group(2))]}
            cur['paras'].append(para); mode = None; continue
        if re.match(r'^#{1,3} ', line):
            para = None if not line.startswith('## Đoạn') else para
            mode = None
            continue
        if para is None:
            continue
        m = re.match(rf'^>\s*({CR})\s*(.+)$', line)
        if m:
            para['sents'].append(strip_md(m.group(2))); mode = None; continue
        # Bảng: | ① | … | … |
        m = re.match(rf'^\|\s*({CR}+)\s*\|(.*)\|\s*$', line)
        if m:
            cells = [c.strip() for c in m.group(2).split('|')]
            idx = circ_list(m.group(1))
            qs = [int(x) for x in re.findall(r'Q(\d+)', ' '.join(cells))]
            if len(idx) == 1 and idx[0] == len(para['sents']) and ('[S]' in cells[0] or '~~' in cells[0]) and len(cells) >= 3 and not any(s for s in para['sents'][idx[0]:idx[0] + 1]):
                pass
            if idx and idx[0] >= len(para['sents']) and len(cells) >= 2:
                # Dạng bảng có câu gốc (đánh dấu ~~phần phụ~~): cột 1 là câu gốc.
                orig = strip_md(cells[0])
                para['sents'].append(orig)
                simp = drop_struck(cells[0])
                note = strip_md(cells[1]) if len(cells) > 1 else ''
                para['simp'].append({'idx': idx, 'text': simp if simp and simp != orig else '', 'note': note, 'q': qs})
            else:
                para['simp'].append({'idx': idx, 'text': drop_struck(cells[0]), 'note': strip_md(cells[1]) if len(cells) > 1 else '', 'q': qs})
            continue
        if line.startswith('**Simplify:**'):
            body = line[len('**Simplify:**'):].strip()
            for nums, t, note in re.findall(rf'((?:{CR})*)\s*\*\*(.+?)\*\*(?:\s*\(([^()]*)\))?', body):
                if t.startswith('→'):
                    continue
                q = [int(x) for x in re.findall(r'Q(\d+)', note or '')]
                note_clean = re.sub(r'\*\*→\s*Q\d+(?:\s*[A-Z ]+)?\*\*:?\s*', '', note or '').strip()
                idx = circ_list(nums) if nums else list(range(len(para['sents'])))
                para['simp'].append({'idx': idx, 'text': strip_md(t), 'note': note_clean, 'q': q})
            mode = None
            continue
        if line.startswith('**Read connection:**'):
            rest = line[len('**Read connection:**'):].strip()
            para['conn'] = rest; mode = 'conn'; continue
        m = re.match(r'^→\s*\*\*Main idea:\s*(.+?)\*\*\s*$', line) or re.match(r'^\*\*Main idea:?\*\*:?\s*(.+)$', line)
        if m:
            para['main'] = m.group(1).strip(); mode = None; continue
        if mode == 'conn' and re.match(r'^\s*[-*] ', line):
            para['conn'] += ('\n' if para['conn'] else '') + line.strip(); continue
        if line.startswith('⚠️'):
            para['warn'].append(line.strip()); continue
        if not line.strip():
            continue
        if mode == 'conn':
            mode = None
    return passages, {k: v.strip() for k, v in exercises.items()}


# ================================================================ Đề (chép từ web)
NUMTOK = r'(?<![\d.,/])'


def clean_test(text):
    text = fix(text)
    out = []
    for l in text.split('\n'):
        s = l.strip()
        if re.fullmatch(r'#+\s*\d{1,2}', s):  # dấu ngắt trang "## 2"
            continue
        out.append(l.replace('**', ''))
    return '\n'.join(out)


def parse_answer_key(text):
    m = re.search(r'(?im)^#*\s*Answers?\b.*$', text)
    if not m:
        return {}
    part = text[m.end():]
    part = re.split(r'(?:Search Cam|ABOUT US|Copyright ©)', part)[0]
    part = re.sub(r'(?im)^\s*Passage\s+\d\s*$', ' ', part)
    part = re.sub(r'(?im)^\s*(Cam \d+ Reading Test \d+)\s*$', ' ', part)
    # ¶ đánh dấu xuống dòng: một đáp án không bao giờ kéo sang dòng sau.
    flat = ' ' + re.sub(r'[ \t]+', ' ', re.sub(r'\s*\n\s*', ' ¶ ', part)) + ' '
    key, pos = {}, 0
    n = 1
    while n <= 40:
        m = re.compile(rf'\s{n}(?:\s*(?:&|and|-)\s*(\d+))?\.?\s+(?=\S)').search(flat, pos)
        if not m:
            n += 1; continue
        start = m.end()
        last = int(m.group(1)) if m.group(1) else n
        # Đáp án kéo tới số câu kế tiếp.
        nxt = re.compile(rf'\s{last + 1}(?:\s*(?:&|and|-)\s*\d+)?\.?\s+(?=\S)').search(flat, start)
        end = nxt.start() if nxt else len(flat)
        ans = re.split(r'\s(?:Search|ABOUT US|Copyright)\b', flat[start:end].split('¶')[0])[0].strip()
        for k in range(n, last + 1):
            key[k] = ans
        pos = end if nxt else start
        n = last + 1
    return key


def letter_seq(t, letters, start=0, line_start=True, limit=600):
    """Đọc lần lượt 'A text B text …' (mỗi chữ trên dòng riêng hoặc chung một dòng)."""
    out, pos = [], start
    for k, L in enumerate(letters):
        pat = rf'(?m)^\s*{re.escape(L)}\s+(?=\S)' if (k == 0 and line_start) else rf'(?:^|\s){re.escape(L)}[.)]?\s+(?=\S)'
        m = re.compile(pat, re.M).search(t, pos)
        if not m or (k > 0 and m.start() - pos > limit):
            break
        if out:
            out[-1][1] = t[out[-1][2]:m.start()].strip()
        out.append([L, '', m.end()])
        pos = m.end()
    if out:
        tail = t[out[-1][2]:]
        out[-1][1] = tail.split('\n')[0].strip()
    return [(L, re.sub(r'\s+', ' ', x)) for L, x, _ in out]


def parse_test(text):
    text = clean_test(text)
    key = parse_answer_key(text)
    body = re.split(r'(?im)^#*\s*Answers?\s+Cam\b', text)[0]
    secs = re.split(r'(?im)^#*\s*READING PASSAGE\s+(\d)\s*$', body)
    passages = []
    for j in range(1, len(secs), 2):
        n, sec = int(secs[j]), secs[j + 1]
        qh = re.search(r'(?im)^#*\s*Questions\s+\d+', sec)
        ptext = sec[:qh.start()] if qh else sec
        heads = re.findall(r'(?m)^#+\s+(.+)$', ptext)
        title = ' '.join(h.strip() for h in heads[:2] if not re.search(r'READING PASSAGE|Questions', h, re.I) and len(h) < 90) if heads else ''
        if heads and len(heads) >= 2 and not ptext.split(heads[0], 1)[1].strip().startswith('#'):
            title = heads[0].strip()
        foot = [l.strip() for l in ptext.split('\n') if re.match(r'^\*+\s*[\w -]+:', l.strip())]
        groups = []
        starts = [(gm.start(), gm.end(), int(gm.group(1)), int(gm.group(2) or gm.group(1))) for gm in re.finditer(r'(?im)^#*\s*Questions?\s+(\d+)(?:\s*(?:[-–]|and)\s*(\d+))?\s*$', sec)]
        # Tiêu đề nhóm bị mất khi chép từ web: dựa vào dòng "… in boxes 8-13 …".
        for bm in re.finditer(r'(?im)^.*\bboxes?\s+(\d+)(?:\s*(?:[-–]|and)\s*(\d+))?.*$', sec):
            ba, bb = int(bm.group(1)), int(bm.group(2) or bm.group(1))
            if any(a0 <= ba <= b0 for _, _, a0, b0 in starts):
                continue
            back = sec[max(0, bm.start() - 500):bm.start()]
            im = None
            for im in re.finditer(r'(?im)^(?:Do the following|Choose|Complete|Look at|Which|Reading Passage|Match|Classify|Label)\b.*$', back):
                pass
            st = bm.start() - len(back) + (im.start() if im else len(back))
            starts.append((st, st, ba, bb))
        starts.sort()
        gms = starts
        last = None
        for k, (g0, g1, ga, gb) in enumerate(gms):
            end = gms[k + 1][0] if k + 1 < len(gms) else len(sec)
            # Đề chép sai tiêu đề ("Questions 6-13" sau "Questions 5-8") → bắt đầu sau nhóm trước.
            if last is not None and ga <= last:
                ga = last + 1
            if ga > gb:
                continue
            groups.append(parse_group(ga, gb, sec[g1:end]))
            last = gb
        passages.append({'n': n, 'title': title, 'footnote': foot, 'groups': groups, 'text': ptext})
    return passages, key


INSTR_RE = re.compile(r'^(Do the following|Choose|Complete|Which|Reading Passage|Look at|Match|Classify|Label|NB|Answer the questions|List of)', re.I)


def parse_group(a, b, block):
    g = {'from': a, 'to': b, 'options': [], 'context': '', 'limit': '', 'maxWords': 0, 'number': False}
    lines = [l.strip() for l in block.strip().split('\n') if l.strip()]
    instr = [l for l in lines if INSTR_RE.match(l) and not l.lower().startswith('list of')]
    g['instr'] = ' '.join(instr)
    up = block.upper()
    rng = re.search(r'\b([A-J])\s*[-–]\s*([A-Jl])\b', g['instr'])
    letters = [chr(c) for c in range(ord(rng.group(1)), ord(rng.group(2).replace('l', 'I')) + 1)] if rng else []
    if 'NOT GIVEN' in up and re.search(r'\bTRUE\b', up):
        g['type'] = 'tf'; g['options'] = [('TRUE', ''), ('FALSE', ''), ('NOT GIVEN', '')]
    elif 'NOT GIVEN' in up and re.search(r'\bYES\b', up):
        g['type'] = 'tf'; g['options'] = [('YES', ''), ('NO', ''), ('NOT GIVEN', '')]
    elif re.search(r'COMPLETE', up) and re.search(r'ONE WORD|TWO WORDS|THREE WORDS|NO MORE THAN|WORDS? AND/OR', up) and not re.search(r'LIST OF', up):
        g['type'] = 'gap'
        lim = re.search(r'((?:ONE|TWO|THREE|NO MORE THAN \w+) WORDS?(?: AND/OR A NUMBER| ONLY)?)', up)
        g['limit'] = lim.group(1).strip() if lim else ''
        nums = {'ONE': 1, 'TWO': 2, 'THREE': 3, 'FOUR': 4}
        mw = re.search(r'(ONE|TWO|THREE|FOUR) WORD', g['limit'])
        g['maxWords'] = nums[mw.group(1)] if mw else 0
        g['number'] = 'NUMBER' in g['limit']
    else:
        g['type'] = 'choice'
    two = re.search(r'Choose (TWO|THREE) letters', block, re.I)
    items = []
    if re.search(r'list of headings|correct heading', block, re.I):
        # Matching Headings: danh sách i, ii, iii… ; câu hỏi "14 Paragraph A".
        lh = re.search(r'(?i)list of headings', block)
        rm = re.search(r'(?i)\bi\s*[-–]\s*(x{0,1}v?i{0,3}|i?x|i?v)\b', g['instr'])
        n_opt = ROMAN.index(rm.group(1).lower()) + 1 if rm and rm.group(1).lower() in ROMAN else 10
        g['options'] = letter_seq(block[lh.end():] if lh else block, ROMAN[:n_opt], line_start=False)
        g['type'] = 'choice'; g['roman'] = True
        pos = lh.end() if lh else 0
        for n in range(a, b + 1):
            m = re.compile(rf'(?:^|(?<=\s)){n}\.?\s+(?=[^\s\d])', re.M).search(block, pos)
            q = re.sub(r'\s+', ' ', block[m.end():].split('\n')[0]).strip() if m else ''
            if m: pos = m.end()
            items.append({'n': n, 'q': re.split(r'\s(?:i|ii|iii|iv|v|vi|vii|viii|ix|x)\s', q)[0] if q else ''})
        g['items'] = items
        if len(g['options']) < 3:
            raise Skip(f'câu {a}–{b}: không đọc được danh sách heading')
        return g
    gapstyle = g['type'] == 'gap' or (g['type'] == 'choice' and re.search(r'COMPLETE (THE|EACH)', up) and not re.search(r'CORRECT ENDING', up))
    items = []
    if two:
        # Một câu hỏi chung cho 2–3 số câu; phương án A–E.
        qline = next((l for l in lines if '?' in l and not l.startswith('Do the following')), '') or next((l for l in lines if re.search(r'\b(TWO|THREE)\b', l) and not INSTR_RE.match(l)), '')
        opts = letter_seq(block, letters or list('ABCDE'))
        for n in range(a, b + 1):
            items.append({'n': n, 'q': qline, 'options': opts, 'multi': list(range(a, b + 1))})
        g['type'] = 'choice'
    elif gapstyle:
        ctx = [l for l in lines if not INSTR_RE.match(l) and not re.match(r'^(Write|In boxes)', l, re.I)]
        g['context'] = '\n'.join(ctx)
        joined = '\n'.join(ctx)
        for n in range(a, b + 1):
            m = re.search(rf'{NUMTOK}{n}\s*(?:[.…_]{{2,}}|(?=\s*(?:[●•]|$)))', joined, re.M) or re.search(rf'{NUMTOK}{n}(?=\s*[.…_])', joined) or re.search(rf'{NUMTOK}{n}\s+[A-Z][a-z]+\s*[.…_]{{2,}}', joined)
            if not m:
                # Hoàn thành câu: "23 One advantage … stays ……… even when …" (số ở đầu câu).
                sm = re.search(rf'(?m)^\s*{n}\s+(.+)$', joined)
                if sm:
                    q = re.sub(r'[.…_]{2,}', ' ______ ', sm.group(1))
                    items.append({'n': n, 'q': re.sub(r'\s+', ' ', q).strip()})
                    continue
                items.append({'n': n, 'q': ''})  # lấy câu hỏi từ file giải
                continue
            ls = joined.rfind('\n', 0, m.start()) + 1
            le = joined.find('\n', m.end()); le = len(joined) if le < 0 else le
            line = joined[ls:le]
            # Đoạn tóm tắt dài: cắt đúng câu chứa ô trống.
            off = m.start() - ls
            sents = list(re.finditer(r'[^.!?]*?(?:[.!?](?=\s|$)|$)', line))
            seg = next((s.group(0) for s in sents if s.start() <= off <= s.end() and s.group(0).strip()), line)
            q = re.sub(rf'{NUMTOK}{n}\s*[.…_]*', ' ______ ', seg, count=1)
            q = re.sub(rf'{NUMTOK}\d{{1,2}}\s*[.…_]{{2,}}', ' … ', q)
            q = re.sub(r'^[•●\-–*]\s*', '', q.strip())
            if len(re.sub(r'[_…. ]', '', q)) < 10:
                # Ô trống đứng đầu dòng (sơ đồ, bảng): lấy thêm chữ xung quanh.
                win = joined[max(0, m.start() - 110):m.end() + 110].replace('\n', ' ')
                q = re.sub(rf'{NUMTOK}{n}\s*[.…_]*', ' ______ ', win, count=1)
                q = '… ' + re.sub(rf'{NUMTOK}\d{{1,2}}\s*[.…_]{{2,}}', ' … ', q).strip() + ' …'
            items.append({'n': n, 'q': re.sub(r'\s+', ' ', q).strip()})
        if g['type'] == 'choice':
            g['options'] = letter_seq(block, letters) if letters else []
    else:
        pos, starts = 0, []
        for n in range(a, b + 1):
            m = re.compile(rf'(?:^|(?<=\s)){n}\.?\s+(?=[^\s\d])', re.M).search(block, pos)
            if not m:
                raise Skip(f'câu {n}: không tìm thấy trong đề')
            starts.append((n, m.start(), m.end()))
            pos = m.end()
        per_item = bool(re.search(r'correct letter,?\s*A,?\s*B,?\s*C', g['instr'], re.I))
        for k, (n, s0, s1) in enumerate(starts):
            end = starts[k + 1][1] if k + 1 < len(starts) else len(block)
            seg = block[s1:end]
            it = {'n': n}
            if per_item:
                opts = letter_seq(seg, list('ABCDE'))
                cut = re.search(r'(?m)^\s*A\s+(?=\S)', seg)
                it['q'] = re.sub(r'\s+', ' ', seg[:cut.start()] if cut else seg).strip()
                if len(opts) < 3:
                    raise Skip(f'câu {n}: không đọc được phương án A–D')
                it['options'] = opts[:4] if not re.search(r'\bE\b', seg) else opts
            else:
                first = seg.strip().split('\n')[0]
                it['q'] = re.sub(r'\s+', ' ', first).strip()
            items.append(it)
        if not per_item and g['type'] == 'choice':
            if letters and re.search(r'paragraph|section', g['instr'], re.I) and not re.search(r'list of|heading', g['instr'], re.I):
                g['options'] = [(L, '') for L in letters]
            else:
                tail_from = starts[-1][2]
                after = block[tail_from:]
                nl = after.find('\n')
                tail_text = after[nl:] if nl >= 0 else ''
                opts = letter_seq(tail_text, letters or list('ABCDEFGHIJ'))
                if len(opts) < max(2, len(letters) - 1):
                    opts = letter_seq(block, letters or list('ABCDEFGHIJ'))
                g['options'] = opts
                # Phần cuối câu cuối có thể dính danh sách phương án.
                if opts:
                    items[-1]['q'] = re.split(r'\s(?:A\s+' + re.escape(opts[0][1][:12]) + ')', items[-1]['q'])[0].strip()
            if not g['options']:
                raise Skip(f'câu {a}–{b}: không đọc được danh sách phương án')
    g['items'] = items
    return g


# ================================================================ Giải chi tiết
def parse_giai(text):
    text = fix(text)
    lines = text.split('\n')
    heads = []
    for i, l in enumerate(lines):
        m = re.match(r'^(?:[-*]\s+)?\*\*Q(\d+)(?:\s*[–&-]\s*(\d+))?\s*([.:–-])\s*(.*?)\*\*:?\s*(.*)$', l)
        if m:
            heads.append((i, m))
    out = {}
    for k, (i, m) in enumerate(heads):
        j = heads[k + 1][0] if k + 1 < len(heads) else len(lines)
        blk = []
        for l in lines[i + 1:j]:
            if re.match(r'^#{1,3} ', l) or l.strip() == '---':
                break
            blk.append(l)
        n, sep, head, rest = int(m.group(1)), m.group(3), m.group(4).strip(), m.group(5).strip()
        if sep == '.':
            qtext, ans = head, None
            am = re.search(r'→\s*\*\*([^*]+)\*\*', rest)
            if am: ans = am.group(1)
            exp = (rest + '\n' + '\n'.join(blk)).strip()
        else:
            qtext, ans = '', head
            exp = (rest + '\n' + '\n'.join(blk)).strip()
        if ans is None:
            am = re.search(r'→\s*\*\*Đáp án:\s*([^*]+)\*\*', exp) or re.search(r'→\s*\*\*([A-Z]+(?: [A-Z]+)*)\*\*', exp)
            if am: ans = am.group(1)
        loc = []
        b2 = re.search(r'Bước 2[^:]*:\*?\s*(.*?)(?=\*Bước 3|$)', exp, re.S)
        src = b2.group(1) if b2 else exp
        for lab, cs in re.findall(rf'(?:[Đđ]oạn\s+|và\s+|\()([0-9]+|[A-Z])\s*,?\s*(?:câu\s*)?((?:{CR}|[–-])+)', src):
            for c in circ_list(cs):
                if [lab, c] not in loc:
                    loc.append([lab, c])
        pairs = [[a.strip(), b.strip()] for a, b in re.findall(r'`([^`]+)`\s*(?:↔|=)\s*`([^`]+)`', exp)]
        out[n] = {'q': strip_md(qtext), 'ans': ans, 'loc': loc[:6], 'exp': exp, 'pairs': pairs}
        if m.group(2):
            for n2 in range(n + 1, int(m.group(2)) + 1):
                out.setdefault(n2, dict(out[n]))
    # Lời giải dạng bảng: | 14 | A | heading | lập luận |
    for l in lines:
        tm = re.match(r'^\|\s*(\d{1,2})\s*\|(.*)\|\s*$', l)
        if tm and int(tm.group(1)) not in out and 1 <= int(tm.group(1)) <= 40:
            cells = [c.strip() for c in tm.group(2).split('|')]
            loc = []
            for lab, cs in re.findall(rf'(?:^|[\s(])([0-9]+|[A-Z])\s*((?:{CR}|[–-])+)', ' '.join(cells)):
                for c in circ_list(cs):
                    if [lab, c] not in loc:
                        loc.append([lab, c])
            out[int(tm.group(1))] = {'q': '', 'ans': None, 'loc': loc[:4], 'exp': ' · '.join(c for c in cells if c), 'pairs': [[a.strip(), b.strip()] for a, b in re.findall(r'`([^`]+)`\s*(?:↔|=)\s*`([^`]+)`', l)]}
    guides = {}
    for gm in re.finditer(r'(?m)^#{2,3} Q(\d+)\s*[–-]\s*(\d+)[^\n]*\n(.*?)(?=^\*\*Q\d+|^#{1,3} |\Z)', text, re.S):
        body = gm.group(3).strip()
        a, b = int(gm.group(1)), int(gm.group(2))
        if body:
            guides[(a, b)] = body
        # Nhóm "chọn 2" không có tiêu đề từng câu: đáp án ở tiêu đề nhóm.
        hdr = gm.group(0).split('\n')[0]
        am = re.search(r'Đáp án:\s*\*\*([^*]+)\*\*', hdr) or re.search(r'Đáp án:\s*\*?\*?\s*([A-J](?:\s*(?:,|và|and|&)\s*[A-J])+)', body)
        for n in range(a, b + 1):
            if am and (n not in out or not out[n].get('ans')):
                prev = out.get(n, {})
                out[n] = {'q': prev.get('q', ''), 'ans': am.group(1), 'loc': prev.get('loc', []), 'exp': body, 'pairs': prev.get('pairs', [])}
    extras = []
    for sm in re.finditer(r'(?m)^## (?!PASSAGE|Q\d|PHẦN 0|Bẫy)([^\n]+)\n(.*?)(?=^## |^# |\Z)', text, re.S):
        title, body = sm.group(1).strip(), sm.group(2).strip()
        if body and not re.match(r'(Bảng đáp án|Tổng hợp 40)', title, re.I):
            extras.append({'title': title, 'md': body})
    method = re.search(r'(?ms)^## PHẦN 0[^\n]*\n(.*?)(?=^---|^# |^## PASSAGE)', text)
    traps = re.search(r'(?ms)^## Bẫy hay gặp[^\n]*\n(.*?)(?=^## |^# |\Z)', text)
    band = re.search(r'(?m)^\*\*Quy đổi band[^\n]*$', text)
    return out, guides, {'method': method.group(1).strip() if method else '', 'traps': traps.group(1).strip() if traps else '',
                         'band': band.group(0).strip() if band else '', 'extras': extras[:6]}


# ================================================================ Ghép + kiểm tra
def ans_variants(raw):
    """'(Sumatran) orangutan / orang-utan' → ['sumatran orangutan', 'orangutan', 'orang-utan']."""
    out = []
    raw = re.sub(r'(?<=[a-z])\s+I\s+(?=[a-z])', ' / ', raw.strip())  # 'I' do chép từ PDF thay cho '/'
    for part in re.split(r'\s*/\s*|\s+OR\s+', raw):
        part = part.strip().strip('.')
        if not part:
            continue
        if '(' in part:
            out.append(re.sub(r'[()]', '', part).strip())
            out.append(re.sub(r'\([^)]*\)', '', part).strip())
        else:
            out.append(part)
    return [re.sub(r'\s+', ' ', x) for x in dict.fromkeys(out) if x]


def norm(s):
    return re.sub(r'\s+', ' ', str(s).strip().lower().rstrip('.'))


def keep_mask(sentence, simplified):
    toks = sentence.split()
    want = words(simplified)
    mask, j = [], 0
    for t in toks:
        ws = words(t)
        if ws and j < len(want) and want[j:j + len(ws)] == ws:
            mask.append(1); j += len(ws)
        else:
            mask.append(0)
    if j != len(want) or sum(mask) == len(toks) or sum(mask) < 2:
        return None
    return mask


TOPICS = [
    ('Động vật', 'animal species bird birds fish insects insect bees parrot wildlife mammal mammals predators prey whale whales marine tiger thylacine creatures'),
    ('Thực vật · nông nghiệp', 'plant plants tree trees forest forests crop crops farming farm farmers agriculture seeds soil palm elm'),
    ('Môi trường · khí hậu', 'climate environment environmental pollution carbon emissions energy renewable sustainable conservation ocean water ice'),
    ('Tâm lý học', 'psychology psychologists behaviour behavior mind emotions emotional stress memory brain cognitive personality happiness'),
    ('Lịch sử · khảo cổ', 'history historical century ancient archaeologists archaeological civilisation empire medieval scrolls king roman'),
    ('Khoa học · công nghệ', 'technology scientists scientific research robots computer digital engineering innovation invention discovery'),
    ('Y học · sức khoẻ', 'health medical disease patients doctors medicine diet sleep exercise hospital'),
    ('Kinh tế · xã hội', 'economic economy business companies company workers employees money market society social cities urban city'),
    ('Nghệ thuật · văn hoá', 'art artists painting paintings music museum culture cultural language literature collectors'),
    ('Thể thao', 'sport sports athletes tennis football olympic players stadium stadiums racket'),
]


def topic_of(title, text):
    ws = words(title + ' ' + title + ' ' + text)
    best, score = '', 0
    for name, kw in TOPICS:
        ks = set(kw.split())
        sc = sum(1 for w in ws if w in ks)
        if sc > score:
            best, score = name, sc
    return best


def build(test_path, simp_path, giai_path, tid, ttitle):
    read = lambda p: open(p, encoding='utf-8').read()
    tps, key = parse_test(read(test_path))
    sps, exercises = parse_simplify(read(simp_path))
    gi, guides, extra = parse_giai(read(giai_path))
    if len(tps) != 3 or len(sps) != 3:
        raise Skip(f'số passage: đề {len(tps)}, Simplify {len(sps)}')
    notes, out = [], []
    for tp, sp in zip(tps, sps):
        labels = [p['label'] for p in sp['paras']]
        paras = []
        for p in sp['paras']:
            if not p['sents']:
                raise Skip(f'P{tp["n"]} đoạn {p["label"]}: không có câu gốc')
            simp = []
            for s in p['simp']:
                idx = [i for i in s['idx'] if i < len(p['sents'])]
                if not idx:
                    continue
                it = {'idx': idx, 'text': s['text']}
                if s.get('note'): it['note'] = s['note']
                if s.get('q'): it['q'] = s['q']
                if len(idx) == 1 and s['text']:
                    m = keep_mask(p['sents'][idx[0]], s['text'])
                    if m: it['keep'] = m
                simp.append(it)
            paras.append({'label': p['label'], 'sents': p['sents'], 'simp': simp, 'conn': p['conn'], 'main': p['main'], 'warn': p['warn']})
        groups = []
        for g in tp['groups']:
            items = []
            for it in g['items']:
                n = it['n']
                info = gi.get(n, {'q': '', 'ans': None, 'loc': [], 'exp': '', 'pairs': []})
                raw = key.get(n) or (info['ans'] or '')
                if not raw:
                    raise Skip(f'câu {n}: không có đáp án')
                if 'multi' in it:
                    raw_letters = re.findall(r'\b([A-J])\b', raw)
                    ans = list(dict.fromkeys(raw_letters))
                else:
                    ans = ans_variants(raw)
                    if g.get('roman'):
                        ans = [a.split(' ')[0].lower() for a in ans]
                    elif g['type'] != 'gap':
                        ans = [a.split(' ')[0].upper() if len(a.split(' ')[0]) <= 2 or a.upper().startswith(('TRUE', 'FALSE', 'YES', 'NO')) else a for a in ans]
                        if g['type'] == 'tf':
                            ans = ['NOT GIVEN' if a.upper().startswith('NOT') else a.upper() for a in ans]
                if info['ans'] and 'multi' not in it:
                    ga = norm(re.sub(r'\s*\(.*\)$', '', info['ans']))
                    if ga and not any(norm(a) == ga or norm(a).startswith(ga) or ga.startswith(norm(a)) for a in ans):
                        notes.append(f'câu {n}: file giải ghi "{info["ans"]}", bảng đáp án ghi "{raw}" (dùng bảng đáp án)')
                loc = []
                for lab, si in info['loc']:
                    if lab in labels and si < len(paras[labels.index(lab)]['sents']):
                        loc.append([labels.index(lab), si])
                if not loc:
                    # Dò câu khớp nhất với phần trích trong lời giải (> Simplify, `trích`, "đoạn 2, câu \"…\"").
                    quotes = re.findall(r'(?m)^>\s*(.+)$', info['exp']) + re.findall(r'`([^`]{20,})`', info['exp']) + re.findall(r'câu\s*["“]([^"”]{8,})', info['exp'])
                    best = (0, None)
                    for qt in quotes:
                        qw = [w for w in words(drop_struck(qt).replace('…', ' ')) if len(w) > 2]
                        if len(qw) < 3:
                            continue
                        for p_i, p in enumerate(paras):
                            for s_i, sent in enumerate(p['sents']):
                                sw = set(words(sent))
                                sc = sum(1 for w in qw if w in sw) / len(qw)
                                if sc > best[0]:
                                    best = (sc, [p_i, s_i])
                    if best[0] >= 0.6:
                        loc = [best[1]]
                if not loc:
                    for p_i, p in enumerate(paras):
                        for s in p['simp']:
                            if n in (s.get('q') or []):
                                loc.append([p_i, s['idx'][0]])
                    loc = loc[:3]
                qt = info['q'] if info['q'] and g['type'] == 'gap' else it['q'] or info['q']
                if len(re.sub(r'[_…. ]', '', qt)) < 6 and info['q']:
                    qt = info['q']
                if len(qt) > 220 and '______' in qt:
                    k0 = qt.index('______')
                    qt = ('… ' if k0 > 110 else '') + qt[max(0, k0 - 110):k0 + 110].strip() + (' …' if k0 + 110 < len(qt) else '')
                q = {'n': n, 'q': qt, 'a': ans, 'loc': loc, 'exp': info['exp'], 'pairs': info['pairs']}
                if 'options' in it:
                    q['options'] = [{'k': k, 't': t} for k, t in it['options']]
                if 'multi' in it:
                    q['multi'] = it['multi']
                if not q['q']:
                    raise Skip(f'câu {n}: không có nội dung câu hỏi')
                if not loc:
                    notes.append(f'câu {n}: chưa có vị trí')
                items.append(q)
            gg = {'from': g['from'], 'to': g['to'], 'type': g['type'], 'instr': g['instr'], 'items': items}
            if g['options']: gg['options'] = [{'k': k, 't': t} for k, t in g['options']]
            if g['type'] == 'gap': gg.update({'limit': g['limit'], 'maxWords': g['maxWords'], 'number': g['number'], 'context': g['context']})
            guide = guides.get((g['from'], g['to']))
            if guide: gg['guide'] = guide
            # Danh sách phương án trong đề bị lẫn cột → lấy danh sách đã ghép lại trong file giải.
            ks0 = [o['k'] for o in gg.get('options', [])]
            if g['type'] == 'choice' and guide and not any('options' in q for q in items) and (len(ks0) < 3 or not all(a in ks0 for q in items for a in q['a'])):
                gl = re.findall(r'\*{0,2}\b([A-J])\*{0,2}\s+([^·\n*|]{2,60}?)\s*(?=·|$|\n)', guide.split('\n\n**Q')[0])
                if len(gl) >= 3:
                    gg['options'] = [{'k': k, 't': strip_md(t)} for k, t in gl]
                    notes.append(f'câu {g["from"]}–{g["to"]}: danh sách phương án lấy từ file giải')
            # Đáp án dạng chữ cái phải nằm trong danh sách phương án.
            for q in items:
                ks = [o['k'] for o in q.get('options') or gg.get('options') or []]
                if g['type'] != 'gap' and ks and not all(a in ks for a in q['a']):
                    raise Skip(f'câu {q["n"]}: đáp án {q["a"]} không có trong phương án {ks}')
            groups.append(gg)
        nums = [q['n'] for g in groups for q in g['items']]
        title = tp['title'] or sp['title'].title()
        out.append({'id': f'{tid}-p{tp["n"]}', 'n': tp['n'], 'title': title, 'subtitle': '', 'footnote': tp['footnote'],
                    'topic': topic_of(title, tp['text']), 'paras': paras, 'groups': groups, '_nums': nums})
    allnums = sorted(n for p in out for n in p.pop('_nums'))
    if allnums != list(range(1, 41)):
        raise Skip(f'đọc được {len(allnums)} câu, thiếu {sorted(set(range(1, 41)) - set(allnums))}')
    return {'id': tid, 'title': ttitle, 'version': 1, 'passages': out, 'exercises': exercises, **extra}, notes


def save(data):
    os.makedirs(os.path.join(ROOT, 'content', 'reading'), exist_ok=True)
    json.dump(data, open(os.path.join(ROOT, 'content', 'reading', f'{data["id"]}.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    idx_path = os.path.join(ROOT, 'content', 'reading', 'index.json')
    idx = json.load(open(idx_path, encoding='utf-8')) if os.path.exists(idx_path) else {'version': 1, 'tests': []}
    entry = {'id': data['id'], 'title': data['title'], 'file': f'content/reading/{data["id"]}.json', 'passages': [
        {'id': p['id'], 'n': p['n'], 'title': p['title'], 'topic': p['topic'], 'questions': sum(len(g['items']) for g in p['groups'])} for p in data['passages']]}
    idx['tests'] = [t for t in idx['tests'] if t['id'] != data['id']] + [entry]
    idx['tests'].sort(key=lambda t: [int(x) if x.isdigit() else x for x in re.findall(r'\d+|\D+', t['id'])])
    json.dump(idx, open(idx_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


def pair_dir(d):
    """Ghép file đề với bộ Simplify/giải theo tên bài đọc (tên file đề có thể đặt nhầm)."""
    sets = []
    tests = [p for p in glob.glob(os.path.join(d, '*.md')) if os.path.basename(p).lower().startswith('practice')]
    for sp in sorted(glob.glob(os.path.join(d, 'cam*-test*-simplify-connection-full.md'))):
        m = re.search(r'cam(\d+)-test(\d+)', os.path.basename(sp))
        gp = sp.replace('simplify-connection-full', 'reading-giai-chi-tiet')
        if not os.path.exists(gp):
            continue
        titles = ' '.join(re.findall(r'(?m)^# PASSAGE \d+\s*[–-]\s*(.+)$', fix(open(sp, encoding='utf-8').read())))
        tw = set(w for w in words(titles) if len(w) > 3)
        best = max(tests, key=lambda t: len(tw & set(words(fix(open(t, encoding='utf-8').read())[:20000]))), default=None)
        sets.append((f'cam{m.group(1)}-t{m.group(2)}', f'Cambridge {m.group(1)} · Test {m.group(2)}', best, sp, gp))
    return sets


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    one = sub.add_parser('one'); one.add_argument('--id', required=True); one.add_argument('--title', required=True)
    one.add_argument('test'); one.add_argument('simplify'); one.add_argument('giai')
    dd = sub.add_parser('dir'); dd.add_argument('dirs', nargs='+'); dd.add_argument('--skip', default='')
    a = ap.parse_args()
    jobs = [(a.id, a.title, a.test, a.simplify, a.giai)] if a.cmd == 'one' else [j for d in a.dirs for j in pair_dir(d) if j[0] not in a.skip.split(',')]
    ok = 0
    for tid, title, tp, sp, gp in jobs:
        try:
            data, notes = build(tp, sp, gp, tid, title)
            save(data)
            ok += 1
            strike = sum(1 for p in data['passages'] for pa in p['paras'] for s in pa['simp'] if 'keep' in s)
            print(f'OK   {tid}: {" | ".join(p["title"] for p in data["passages"])} · gạch chữ {strike} câu · {os.path.basename(tp)}')
            for n in notes:
                print('     lưu ý:', n)
        except Skip as e:
            print(f'BỎ   {tid}: {e}')
    print(f'Xong: {ok}/{len(jobs)} đề')


if __name__ == '__main__':
    main()
