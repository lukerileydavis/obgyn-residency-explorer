"""Local explorer for residency.db.  Run:  python3 app/server.py  [--port 8765]

Stdlib only. Serves app/static/ plus /programs.json, read fresh from the `programs_v` view on every
request. Locally this includes contacts and cleaning notes; build_static.py writes the redacted public copy.
"""
import argparse, http.server, json, os, sqlite3, subprocess, sys, webbrowser

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DB = os.path.join(ROOT, 'residency.db')
STATIC = os.path.join(HERE, 'static')
JSON_COLS = ('conferences_json', 'hospitals_json', 'data_notes')
DROP_COLS = {'raw_json'}


def programs():
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    out = []
    for r in con.execute('SELECT * FROM programs_v ORDER BY name'):
        d = {k: r[k] for k in r.keys() if k not in DROP_COLS}
        for k in JSON_COLS:
            d[k] = json.loads(d[k]) if d[k] else []
        out.append(d)
    con.close()
    return out


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=STATIC, **kw)

    def do_GET(self):
        if self.path.split('?')[0] == '/programs.json':
            body = json.dumps(programs()).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, fmt, *args):
        pass


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--port', type=int, default=8765)
    ap.add_argument('--no-open', action='store_true')
    a = ap.parse_args()
    subprocess.run([sys.executable, os.path.join(ROOT, 'derive.py'), DB], check=True)
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', a.port), Handler)
    url = f'http://127.0.0.1:{a.port}/'
    print(f'Serving {url}  (Ctrl-C to stop)')
    if not a.no_open:
        webbrowser.open(url)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
