import re, html, sys
from html.parser import HTMLParser

class P(HTMLParser):
    """Flatten the detail page into rows: each rTableRow -> list of cell texts (empty cells kept)."""
    def __init__(s):
        super().__init__(); s.rows=[]; s.stack=[]; s.cell=None; s.sec=None; s.h2=None; s.depth_row=[]
    def handle_starttag(s,tag,a):
        a=dict(a); c=a.get('class','') or ''
        if tag=='h2' and a.get('id'): s.h2=a['id']; s.sec=a['id']
        if tag=='div':
            s.stack.append(c)
            if 'rTableRow' in c.split(): s.rows.append({'sec':s.sec,'cells':[],'links':[]}); s.depth_row.append(len(s.stack))
            elif 'rTableCell' in c.split() and s.rows: s.cell=[]; s.cell_depth=len(s.stack)
        if tag=='a' and s.cell is not None and a.get('href'): s.rows[-1]['links'].append(a['href'])
        if tag=='br' and s.cell is not None: s.cell.append('\n')
    def handle_endtag(s,tag):
        if tag=='div' and s.stack:
            if s.cell is not None and len(s.stack)==s.cell_depth:
                s.rows[-1]['cells'].append(re.sub(r'[ \t\r\f]+',' ',html.unescape(''.join(s.cell))).strip()); s.cell=None
            if s.depth_row and len(s.stack)==s.depth_row[-1]: s.depth_row.pop()
            s.stack.pop()
    def handle_data(s,d):
        if s.cell is not None: s.cell.append(d)

def parse(rid):
    t=open(f'details/{rid}.html',encoding='utf-8',errors='replace').read()
    t=t[t.index('id="residency"')-20:t.index('id="SubFooter"')]
    p=P(); p.feed(t); return p.rows
if __name__=='__main__':
    for rid in sys.argv[1:]:
        for r in parse(rid): print(rid,r['sec'],r['cells'],r['links'] or '')
