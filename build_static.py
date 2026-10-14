"""Build the public static site into docs/ (for GitHub Pages: Settings → Pages → Deploy from branch, folder /docs).

Copies app/static/ and writes docs/programs.json from the programs_v view, with personal contact
details and cleaning notes removed. Mailing address, website and the APGO listing link are kept.
Re-run after any change to residency.db, derive.py or the app:  python3 build_static.py
"""
import json, os, re, shutil, sqlite3, subprocess, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC, OUT, DB = os.path.join(ROOT, 'app', 'static'), os.path.join(ROOT, 'docs'), os.path.join(ROOT, 'residency.db')
sys.path.insert(0, os.path.join(ROOT, 'app'))
from server import programs  # noqa: E402  (same rows the local app serves)

# Never published: named people, their phone/fax/email, internal IDs, and build/cleaning notes.
REDACT = {'chair_name', 'chair_phone', 'chair_fax', 'program_director_name', 'program_director_phone', 'program_director_fax',
          'contact_name', 'contact_phone', 'contact_email', 'account_id', 'data_notes', 'raw_json'}
CONTACT_RE = re.compile(r'[\w.+-]+@[\w-]+\.[\w.]+|\(?\b\d{3}\)?[-. ]\d{3}[-. ]\d{4}\b')

subprocess.run([sys.executable, os.path.join(ROOT, 'derive.py'), DB], check=True)
rows = programs()
cols = set(rows[0])
missing = REDACT - cols - {'raw_json'}
assert not missing, f'redaction list names columns that no longer exist: {missing}'
# guard against new contact-like columns appearing after a schema change
leaky = {c for c in cols - REDACT if re.search(r'(_phone|_fax|_email|_name)$', c) and c not in ('name', 'program_name')}
assert not leaky, f'new contact-like columns, add them to REDACT or allow them explicitly: {leaky}'

public = [{k: v for k, v in r.items() if k not in REDACT} for r in rows]
hits = [(r['rid'], k) for r in public for k, v in r.items() if isinstance(v, str) and k != 'website' and CONTACT_RE.search(v)]
assert not hits, f'email/phone-like text left in public data: {hits[:10]}'

if os.path.isdir(OUT):
    shutil.rmtree(OUT)
shutil.copytree(SRC, OUT)
with open(os.path.join(OUT, 'programs.json'), 'w') as f:
    json.dump(public, f, separators=(',', ':'))
open(os.path.join(OUT, '.nojekyll'), 'w').close()
size = os.path.getsize(os.path.join(OUT, 'programs.json')) // 1024
print(f'docs/: {len(public)} programs, {len(public[0])} fields each, programs.json {size} KB; redacted {len(REDACT)} fields')
