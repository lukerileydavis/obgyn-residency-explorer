"""Geocode programs: Census batch geocoder for street addresses, ZIP-centroid fallback.
Caches network responses in geo/ so re-runs are offline. Adds latitude/longitude/geocode_method/geocode_query to programs."""
import csv, io, json, math, os, re, sqlite3, subprocess, zipfile

ZIP_FALLBACK = {50: '06032'}      # UConn Health's own ZIP 06030 is not a ZIP area; use Farmington's main one (~4 km)
ZIP_OVERRIDE = {405: '90033'}      # address says "Los Angeles, California 30033" (a Georgia ZIP); 1200 N State St LA is 90033
con = sqlite3.connect('residency.db'); con.row_factory = sqlite3.Row
progs = con.execute('select rid,name,address,city,state_province,data_notes from programs order by rid').fetchall()


def parse(addr, list_city):
    lines = [l.strip() for l in addr.replace('\r', '').split('\n') if l.strip()]
    z = re.findall(r'\b(\d{5})(?:-\d{4})?\b', addr)
    zipc = z[-1] if z else ''
    city = list_city
    m = re.search(r'([A-Za-z .\'-]+?),?\s+(?:[A-Z]{2}|[A-Za-z ]+?)\s*,?\s*\d{5}', lines[-1]) if lines else None
    if m and ',' in lines[-1]: city = lines[-1].split(',')[0].strip() or list_city
    street = ''
    for l in lines:
        if re.search(r'p\.?\s?o\.?\s*box|post office', l, re.I): continue
        if re.match(r'^\d+\b', l) and re.search(r'[A-Za-z]{2}', l):
            street = re.split(r',|\s#', l)[0].strip(); break
    return street, city, zipc


rows = []
for p in progs:
    street, city, zipc = parse(p['address'], p['city'])
    zipc = ZIP_OVERRIDE.get(p['rid'], zipc)
    rows.append(dict(rid=p['rid'], street=street, city=city, state=p['state_province'], zip=zipc, note=p['data_notes']))
inp = [r for r in rows if r['street']]
print(f'{len(rows)} programs; {len(inp)} with a street line for the batch; {len(rows)-len(inp)} ZIP-only:', [r['rid'] for r in rows if not r['street']])

# ---- Census batch (one request)
resp = 'geo/census_response.csv'
if not os.path.exists(resp):
    buf = io.StringIO(); w = csv.writer(buf)
    for r in inp: w.writerow([r['rid'], r['street'], r['city'], r['state'], r['zip']])
    open('geo/census_input.csv', 'w').write(buf.getvalue())
    out = subprocess.run(['curl', '-sS', '--fail', '-o', resp, '-F', 'addressFile=@geo/census_input.csv', '-F', 'benchmark=Public_AR_Current',
                          'https://geocoding.geo.census.gov/geocoder/locations/addressbatch'], capture_output=True, text=True)
    print('census batch:', out.returncode, out.stderr.strip())
census = {}
for rec in csv.reader(open(resp, encoding='utf-8')):
    if len(rec) >= 6 and rec[2] == 'Match' and rec[5]:
        lon, lat = map(float, rec[5].split(',')); census[int(rec[0])] = (lat, lon, rec[4], rec[3])
print('census matched', len(census), 'of', len(inp))

# ---- ZIP centroids (one download)
gz = 'geo/zcta.txt'
if not os.path.exists(gz):
    subprocess.run(['curl', '-sS', '--fail', '-o', 'geo/zcta.zip', 'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2023_Gazetteer/2023_Gaz_zcta_national.zip'], check=True)
    z = zipfile.ZipFile('geo/zcta.zip'); open(gz, 'wb').write(z.read(z.namelist()[0]))
zc = {}
rd = csv.reader(open(gz, encoding='utf-8'), delimiter='\t'); hdr = [h.strip() for h in next(rd)]
for rec in rd: zc[rec[0].strip()] = (float(rec[hdr.index('INTPTLAT')]), float(rec[hdr.index('INTPTLONG')]))


pl = 'geo/places.txt'
if not os.path.exists(pl):
    subprocess.run(['curl', '-sS', '--fail', '-o', 'geo/places.zip', 'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2023_Gazetteer/2023_Gaz_place_national.zip'], check=True)
    z = zipfile.ZipFile('geo/places.zip'); open(pl, 'wb').write(z.read(z.namelist()[0]))
places = {}
rd = csv.reader(open(pl, encoding='utf-8'), delimiter='\t'); ph = [h.strip() for h in next(rd)]
for rec in rd:
    nm = re.sub(r'\s+(city|town|village|borough|CDP|municipality|zona urbana|comunidad)$', '', rec[ph.index('NAME')].strip(), flags=re.I).lower()
    places.setdefault((rec[0].strip(), nm), (float(rec[ph.index('INTPTLAT')]), float(rec[ph.index('INTPTLONG')])))


def hav(a, b):
    p1, p2 = math.radians(a[0]), math.radians(b[0]); dl = math.radians(b[1] - a[1]); dp = p2 - p1
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


existing = {r[1] for r in con.execute('pragma table_info(programs)')}
for c, t in (('latitude', 'REAL'), ('longitude', 'REAL'), ('geocode_method', 'TEXT'), ('geocode_query', 'TEXT')):
    if c not in existing: con.execute(f'alter table programs add column {c} {t}')
sus, stats = [], {}
for r in rows:
    rid = r['rid']; zpt = zc.get(r['zip']) or zc.get(ZIP_FALLBACK.get(r['rid'], ''))
    if rid in census:
        lat, lon, matched, mtype = census[rid]; method = 'census_' + mtype.lower()
        if zpt and hav((lat, lon), zpt) > 40: sus.append((rid, round(hav((lat, lon), zpt)), matched))
    elif zpt: lat, lon = zpt; method = 'zip_centroid'; matched = r['zip']
    elif (r['state'], r['city'].lower().replace('st.', 'st').replace('saint', 'st')) in places or (r['state'], r['city'].lower()) in places:
        lat, lon = places.get((r['state'], r['city'].lower()), places.get((r['state'], r['city'].lower().replace('st.', 'st')))); method = 'city_centroid'; matched = f"{r['city']}, {r['state']}"
    else: lat = lon = None; method = 'failed'; matched = None
    stats[method] = stats.get(method, 0) + 1
    notes = json.loads(r['note']) if r['note'] else []
    if rid in ZIP_OVERRIDE: notes.append(f'geocoded with ZIP {ZIP_OVERRIDE[rid]}: address text says a Georgia ZIP for a Los Angeles street (likely typo)')
    if rid in ZIP_FALLBACK and method == 'zip_centroid': notes.append(f"ZIP {r['zip']} not a ZIP area; used {ZIP_FALLBACK[rid]} centroid")
    if method == 'city_centroid': notes.append('location is city-centroid (ZIP not in Census ZIP-area file and no street match)')
    if method == 'zip_centroid': notes.append('location is ZIP-centroid (' + ('PO box only' if not r['street'] else 'street not matched by Census') + ')')
    con.execute('update programs set latitude=?,longitude=?,geocode_method=?,geocode_query=?,data_notes=? where rid=?',
                (lat, lon, method, matched or f"{r['street']}, {r['city']}, {r['state']} {r['zip']}", json.dumps(notes) if notes else None, rid))
con.commit()
print('methods:', stats)
print('census points >40 km from their ZIP centroid (suspicious):', sus)
