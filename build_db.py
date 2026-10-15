"""Build residency.db (single `programs` table) from cached list + detail HTML.

Inputs : residency-usmle2-gt230.html (list fields), details/<rid>.html (detail pages)
Output : residency.db, table `programs`, one row per rid.
Cleaning notes are collected in `data_notes` (JSON) per row; every raw string is kept in `raw_json`.
"""
import re, json, sqlite3, html, collections, sys
from parse_detail import parse

RIDS = sorted(int(x) for x in open('rids-gt230.txt').read().split())
CANADA = {'AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT'}

# Programs whose q25 case-log "medians" are class totals: every category is ~3-6x the field and dividing by
# positions offered lands on ordinary medians. rid -> reported spontaneous vaginal deliveries, so the fix only
# applies to the listing we checked; if the program re-reports, the build warns and leaves the new numbers alone.
PROC_CLASS_TOTALS = {72: 946, 282: 990}


def slug(s, n=48):
    s = re.sub(r'[^a-z0-9]+', '_', s.lower()).strip('_')
    return s[:n].strip('_')


# ---------------------------------------------------------------- list page
def list_fields():
    t = open('residency-usmle2-gt230.html', encoding='utf-8').read()
    out = {}
    for m in re.finditer(r'rid=(\d+)">(.*?)</a>.*?rArea">(.*?)</span>.*?rArea">(.*?)</span>.*?rArea">(.*?)</span>', t, re.S):
        out[int(m.group(1))] = dict(name=html.unescape(m.group(2)).strip(), city=html.unescape(m.group(3)).strip(),
                                    state_province=m.group(4).strip(), list_country=m.group(5).strip())
    return out


# ---------------------------------------------------------------- detail extraction (raw strings)
def extract(rid):
    rows = parse(rid)
    raw, conferences, hospitals = collections.OrderedDict(), [], []

    def put(k, v):
        if k in raw:
            i = 2
            while f'{k}_{i}' in raw: i += 1
            k = f'{k}_{i}'
        raw[k] = v

    q, group, mode = None, None, None
    for x in rows:
        c, n = x['cells'], len(x['cells'])
        c0 = c[0] if c else ''
        mq = re.match(r'^(\d+)\.\s*(.*)$', c0, re.S)
        if mq: q = int(mq.group(1))

        # --- Q8 conference table
        if c[:1] == ['Activity']: mode = 'activities'; continue
        if mode == 'activities':
            if mq and q == 9: mode = None
            else:
                if n == 3 and re.match(r'^[a-z]\.', c[0]):
                    conferences.append(dict(item=c[0][0], name=c[0][2:].strip(), requirement=c[1], times_per_month=c[2]))
                continue
        if q == 8: continue

        # --- Q24 hospital slots
        if q == 24:
            if n == 3 and re.match(r'^[A-E]\.', c[1]):
                hospitals.append(dict(slot=c[1][0], name=c[1][2:].strip(), pct=c[2]))
            continue

        # --- metadata
        if n == 2 and c[0].endswith(':'):
            put(slug(c[0]), c[1]); continue
        if n == 1 or (n == 2 and mq): continue                      # pure headers
        # --- Q17 resident counts (8 cells; header row has 'Level')
        if q == 17:
            if n == 8 and c[2].strip().startswith('PG'):
                lvl = slug(c[2])
                for name, v in zip(('total', 'img', 'female', 'male', 'do'), c[3:]): put(f'q17_{lvl}_{name}', v)
            continue
        # --- Q20 graduate destinations
        if q == 20:
            if c[1:2] == ['Typical %']:
                for name, v in zip(('private_practice', 'academic', 'fellowship', 'other'), c[2:]): put(f'q20_pct_{name}', v)
            continue
        # --- Q23 fellowships: [chkL, nameL, chkR, nameR]
        if q == 23:
            if n == 4:
                put('fellow_' + slug(c[1]), c[0]); put('fellow_' + slug(c[3]), c[2])
            continue
        # --- Q10 salary
        if q == 10:
            if n == 4 and c[1].startswith('PG'):
                lvl = slug(c[1]); put(f'q10_{lvl}_salary', c[2]); put(f'q10_{lvl}_vacation', c[3])
            continue
        # --- Q22 faculty
        if q == 22:
            if n == 3 and c[1] and c[1] != 'MD': put('q22_' + slug(c[1]), c[2])
            continue
        # --- Q3 department contacts (Phone/FAX/Email repeat)
        if q == 3 and n == 3:
            lab = c[1].rstrip(':').strip()
            if lab == 'Chair': group = 'chair'
            elif lab == 'Program Director': group = 'program_director'
            elif lab.startswith('Residency Contact'): group = 'contact'
            key = group if lab in ('Chair', 'Program Director') or lab.startswith('Residency Contact') else f'{group}_{slug(lab)}'
            put('q3_' + key, c[2]); continue
        # --- free-text questions (15, 16)
        if q in (15, 16) and n == 2 and c0 == '':
            put(f'q{q}_text', c[1]); continue
        # --- generic ['', label, value] / [qnum, label, value]
        if n == 3 and c[1]:
            if c[2] == 'Yes/No' or c[1] in ('Benefits',): continue
            put(f'q{q}_{slug(c[1])}', c[2])
    return raw, conferences, hospitals


# ---------------------------------------------------------------- cleaning
def num(s):
    """Strict-ish numeric: strip $ , % spaces, trailing '.', accept one decimal; else None."""
    if s is None: return None
    t = re.sub(r'[\s$,%]', '', s).rstrip('.')
    return float(t) if re.fullmatch(r'\d+(\.\d+)?', t) else None


def clean_salary(s, notes, key):
    s0 = (s or '').strip()
    if not s0: return None
    m = re.search(r'\((\d{2}-\d{2})\)', s0)
    if m: notes.append(f'{key}: academic-year tag {m.group(1)} removed from "{s0}"'); s0 = s0[:m.start()].strip()
    t = re.sub(r'[\s$]', '', s0).rstrip('.')            # drop $, spaces (incl. "72, 649"), trailing '.'
    if re.fullmatch(r'\d{1,3},\d{3}(\.\d+)?', t) or re.fullmatch(r'\d{4,6}(\.\d+)?', t):
        v = float(t.replace(',', ''))
        if not 25000 <= v <= 200000: notes.append(f'{key}: implausible value {v} from "{s0}" -> NULL'); return None
        return v
    notes.append(f'{key}: unparseable "{s0}" -> NULL'); return None


def clean_vacation(s, notes, key):
    """Paid vacation in weeks. Days are converted at 5 days/week; education-leave suffixes are excluded."""
    s0 = (s or '').strip().lower()
    if not s0: return None
    W = r'(?:wks?|weeks?)'
    if re.fullmatch(rf'(\d+(?:\.\d+)?)\s*(?:{W})?', s0): return float(re.match(r'\d+(?:\.\d+)?', s0).group())
    m = re.fullmatch(r'(\d+(?:\.\d+)?)\s*days?', s0)
    if m: v = round(float(m.group(1)) / 5, 2); notes.append(f'{key}: "{s0}" converted to {v} weeks (5-day weeks)'); return v
    m = re.fullmatch(r'(\d+)\s*\+\s*(\d+)\s*days?', s0)
    if m: v = round(int(m.group(1)) + int(m.group(2)) / 5, 2); notes.append(f'{key}: "{s0}" read as {m.group(1)} weeks + {m.group(2)} days = {v} weeks'); return v
    m = re.fullmatch(rf'(\d+)\s*(?:{W})?\s*[&+]\s*(\d+)\s*{W}\s*(?:of\s*)?e.*', s0)
    if m: notes.append(f'{key}: "{s0}" -> {m.group(1)} weeks vacation; {m.group(2)} wk education leave excluded'); return float(m.group(1))
    notes.append(f'{key}: unparseable "{s0}" -> NULL'); return None


def clean_phone(s):
    d = re.sub(r'\D', '', s or '')
    if len(d) == 11 and d[0] == '1': d = d[1:]
    return f'{d[:3]}-{d[3:6]}-{d[6:]}' if len(d) == 10 else ((s or '').strip() or None)


def clean_date(s):
    m = re.fullmatch(r'(\d{4})/(\d{2})/(\d{2})', (s or '').strip())
    return f'{m.group(1)}-{m.group(2)}-{m.group(3)}' if m else None


def ynb(s):
    t = (s or '').strip().lower()
    return 1 if t == 'yes' else 0 if t == 'no' else None


# ---------------------------------------------------------------- build
def build():
    L = list_fields()
    assert set(L) == set(RIDS), 'list/detail rid mismatch'
    recs = {}
    for rid in RIDS:
        raw, conf, hosp = extract(rid)
        recs[rid] = (raw, conf, hosp)

    # column typing from the data: all-nonblank values in {yes,no} -> bool; checkbox keys -> 0/1; mostly numeric -> REAL
    keys = list(dict.fromkeys(k for raw, _, _ in recs.values() for k in raw))
    handled = {'last_updated', 'year', 'account_id'}
    SKIP_EMPTY = {k for k in keys if all((recs[r][0].get(k) or '').strip() == '' for r in RIDS)}
    kind = {}
    for k in keys:
        if k in SKIP_EMPTY or k in handled: continue
        vals = [(recs[r][0].get(k) or '').strip() for r in RIDS]
        nz = [v for v in vals if v]
        if k.startswith('fellow_') or (re.match(r'q(7|11)_(pg_?\d|year)', k) and set(nz) <= {'X', 'x'}):
            kind[k] = 'check'
        elif set(v.lower() for v in nz) <= {'yes', 'no'}: kind[k] = 'bool'
        elif k.endswith(('_salary', '_vacation')): kind[k] = 'salary' if k.endswith('_salary') else 'vacation'
        elif sum(num(v) is not None for v in nz) >= 0.9 * len(nz):
            kind[k] = 'int' if all(num(v) == int(num(v)) for v in nz if num(v) is not None) else 'real'
        else: kind[k] = 'text'
    for k in keys:
        if k.endswith('_phone') or k.endswith('_fax'): kind[k] = 'phone'
        if k.endswith('_email'): kind[k] = 'email'
    kind = {k: v for k, v in kind.items() if k in keys}
    DUP = {'q1_city': 'city', 'q1_state_providence': 'state_province'}   # same fact as the list page; checked per row below
    for k in ('q1_city', 'q1_state_providence', 'q1_country'): kind.pop(k, None)

    # a few readable renames for long auto-slugs
    RENAME = {}
    for k in keys:
        if k.startswith('q21_'): RENAME[k] = 'abog_first_attempt_pass_pct'
        elif k.startswith('q18_'): RENAME[k] = 'pct_aoa'
        elif k == 'q19_step_i': RENAME[k] = 'avg_usmle_step1'
        elif k == 'q19_step_ii': RENAME[k] = 'avg_usmle_step2'
        elif k.startswith('q4_'): RENAME[k] = 'medical_school_affiliation'
        elif k == 'q3_chair': RENAME[k] = 'chair_name'
        elif k == 'q3_program_director': RENAME[k] = 'program_director_name'
        elif k == 'q3_contact': RENAME[k] = 'contact_name'
        elif k.startswith(('q2_', 'q3_')): RENAME[k] = k[3:]
        if k == 'q2_web_site': RENAME[k] = 'website'
    rn = lambda k: RENAME.get(k, k)
    assert len({rn(k) for k in kind}) == len(kind), 'rename collision'

    coltype = {'int': 'INTEGER', 'check': 'INTEGER', 'bool': 'INTEGER', 'salary': 'REAL', 'vacation': 'REAL', 'real': 'REAL', 'text': 'TEXT', 'phone': 'TEXT', 'email': 'TEXT'}
    cols = [('rid', 'INTEGER PRIMARY KEY'), ('name', 'TEXT'), ('city', 'TEXT'), ('state_province', 'TEXT'), ('country', 'TEXT'),
            ('detail_url', 'TEXT'), ('last_updated', 'TEXT'), ('data_year', 'INTEGER'), ('account_id', 'TEXT')]
    cols += [(rn(k), coltype[t]) for k, t in kind.items()]
    cols += [('conferences_json', 'TEXT'), ('hospitals_json', 'TEXT'), ('proc_note', 'TEXT'), ('data_notes', 'TEXT'), ('raw_json', 'TEXT')]

    con = sqlite3.connect('residency.db'); con.execute('DROP TABLE IF EXISTS programs')
    con.execute('CREATE TABLE programs (' + ', '.join(f'"{n}" {t}' for n, t in cols) + ')')
    allnotes = collections.Counter()
    for rid in RIDS:
        raw, conf, hosp = recs[rid]; notes = []
        l = L[rid]
        row = dict(rid=rid, name=l['name'], city=l['city'], state_province=l['state_province'],
                   country='CAN' if l['state_province'] in CANADA else 'USA',
                   detail_url=f'https://tools.apgo.org/residency-directory/search-residency-directory/residency-details/?rid={rid}',
                   last_updated=clean_date(raw.get('last_updated')), account_id=raw.get('account_id') or None)
        row['data_year'] = int(raw['year']) if re.fullmatch(r'\d{4}', raw.get('year', '')) else None
        if l['list_country'] != row['country']: notes.append(f'country: site says {l["list_country"]}, state {l["state_province"]} -> {row["country"]}')
        for k, col in DUP.items():
            if (raw.get(k) or '').strip().lower() != l[col].strip().lower(): notes.append(f'{col}: detail page says "{raw.get(k)}", list says "{l[col]}" (list kept)')
        for k, t in kind.items():
            v = (raw.get(k) or '').strip()
            if t == 'check': out = 1 if v.upper() == 'X' else 0
            elif t == 'bool': out = ynb(v)
            elif t == 'salary': out = clean_salary(v, notes, rn(k))
            elif t == 'vacation': out = clean_vacation(v, notes, rn(k))
            elif t in ('real', 'int'):
                out = num(v)
                if t == 'int' and out is not None: out = int(out)
                if v and out is None and v.lower() not in ('n/a', 'na', 'none', '-'): notes.append(f'{rn(k)}: unparseable "{v}" -> NULL')
            elif t == 'phone': out = clean_phone(v) if v else None
            elif t == 'email': out = v.lower() or None
            else: out = v or None
            row[rn(k)] = out
        if rid in PROC_CLASS_TOTALS:
            svd, n = row.get('q25_spontaneous_vaginal_deliveries'), row.get('q26_positions_offered')
            if svd != PROC_CLASS_TOTALS[rid] or not n:
                print(f'warning: rid {rid} q25 no longer matches the class-total listing (svd={svd}, class={n}); left as reported')
            else:
                for k in [k for k in row if k.startswith('q25_') and row[k] is not None]: row[k] = round(row[k] / n)
                row['proc_note'] = (f'Procedure counts divided by class size ({n}). The listing reported several times the typical '
                                    'program in nearly every category, consistent with whole-class totals entered as per-graduate medians.')
                notes.append(f'q25: all procedure counts divided by positions offered ({n}); reported values kept in raw_json')
        for c in conf: c['times_per_month'] = num(c['times_per_month'])
        for h in hosp: h['pct'] = num(h['pct'])
        hosp = [h for h in hosp if h['name'] or h['pct'] is not None]
        row['conferences_json'] = json.dumps(conf); row['hospitals_json'] = json.dumps(hosp)
        row['data_notes'] = json.dumps(notes) if notes else None
        row['raw_json'] = json.dumps(raw)
        for n in notes: allnotes[re.sub(r'\d', '9', n)[:70]] += 1
        con.execute(f'INSERT INTO programs ({",".join(chr(34)+c+chr(34) for c,_ in cols if c in row)}) VALUES ({",".join("?" for c,_ in cols if c in row)})',
                    [row[c] for c, _ in cols if c in row])
    con.commit()
    print(f'{len(RIDS)} rows, {len(cols)} columns; {len(SKIP_EMPTY)} all-empty keys dropped')
    return con, allnotes


if __name__ == '__main__':
    con, notes = build()
    for k, v in notes.most_common(): print(v, k)
