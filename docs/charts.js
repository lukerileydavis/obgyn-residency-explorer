// Small hand-rolled SVG charts. Colors come from CSS classes (.y0–.y4 year bins, .c0–.c3 compare slots).

const NS = 'http://www.w3.org/2000/svg';
export const LETTERS = 'ABCD';

export function s(tag, attrs = {}, parent) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
}
export const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------------------------------------------------------------- data year
export const YEAR_BINS = [
  { label: '2019 or earlier', test: y => y <= 2019 },
  { label: '2020–21', test: y => y <= 2021 },
  { label: '2022–23', test: y => y <= 2023 },
  { label: '2024–25', test: y => y <= 2025 },
  { label: '2026 or later', test: () => true },
];
export const yearBin = y => y == null ? -1 : YEAR_BINS.findIndex(b => b.test(y));
export const yearClass = p => { const b = yearBin(p.year_effective); return b < 0 ? 'yn' : 'y' + b; };
export const isEstimated = p => p.year_source === 'last_updated';
export function yearText(p) {
  if (p.year_effective == null) return 'year unknown';
  return isEstimated(p) ? `~${p.year_effective}` : `${p.year_effective}`;
}
export function yearTitle(p) {
  if (p.year_source === 'data_year') return `Survey data year ${p.data_year}; listing last updated ${p.last_updated || 'unknown'}`;
  if (p.year_source === 'last_updated') return `No data year reported; ${p.year_effective} is the year the listing was last updated (${p.last_updated})`;
  return 'No data year or update date reported';
}
export function yearChip(p, big = false) {
  return `<span class="yr ${yearClass(p)}${isEstimated(p) ? ' est' : ''}${big ? ' big' : ''}" title="${esc(yearTitle(p))}">${yearText(p)}</span>`;
}
export function yearLegend() {
  return `<span class="yrlegend" aria-label="Data year color key">${YEAR_BINS.map((b, i) =>
    `<span><i class="sw y${i}"></i>${b.label}</span>`).join('')}<span><i class="sw est"></i>estimated from update date</span></span>`;
}

// Mini histogram of data years under a chart: the year caveat, always present, never loud.
export function yearStrip(progs, { n } = {}) {
  const ys = progs.map(p => p.year_effective).filter(y => y != null);
  if (!ys.length) return document.createElement('div');
  const lo = Math.min(...ys), hi = Math.max(...ys);
  const counts = {}; ys.forEach(y => counts[y] = (counts[y] || 0) + 1);
  const max = Math.max(...Object.values(counts));
  const sorted = [...ys].sort((a, b) => a - b), med = sorted[Math.floor(sorted.length / 2)];
  const est = progs.filter(isEstimated).length;
  const wrap = document.createElement('div');
  wrap.className = 'yearstrip';
  const w = (hi - lo + 1) * 7, h = 16;
  const svg = s('svg', { width: w, height: h, viewBox: `0 0 ${w} ${h}`, 'aria-hidden': 'true' });
  for (let y = lo; y <= hi; y++) {
    const c = counts[y] || 0;
    if (!c) { s('rect', { x: (y - lo) * 7, y: h - 1, width: 5, height: 1, class: 'axisfill' }, svg); continue; }
    const bh = Math.max(2, Math.round(c / max * h));
    s('rect', { x: (y - lo) * 7, y: h - bh, width: 5, height: bh, rx: 1, class: 'y' + yearBin(y) }, svg);
  }
  wrap.appendChild(svg);
  const txt = document.createElement('span');
  txt.innerHTML = `n = ${n ?? progs.length} · data years ${lo === hi ? lo : `${lo}–${hi}`}, median ${med}${est ? ` · ${est} estimated` : ''}`;
  wrap.appendChild(txt);
  wrap.title = Object.entries(counts).map(([y, c]) => `${y}: ${c}`).join('\n');
  return wrap;
}

// ---------------------------------------------------------------- tooltip
const tip = () => document.getElementById('tip');
export function showTip(html, ev) {
  const t = tip(); t.innerHTML = html; t.hidden = false;
  const pad = 14, r = t.getBoundingClientRect();
  let x = ev.clientX + pad, y = ev.clientY + pad;
  if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - pad;
  if (y + r.height > innerHeight - 8) y = ev.clientY - r.height - pad;
  t.style.left = Math.max(8, x) + 'px'; t.style.top = Math.max(8, y) + 'px';
}
export const hideTip = () => { tip().hidden = true; };
export function progTip(p, rows = []) {
  return `<div class="tt-name">${esc(p.name)}</div><div class="tt-sub">${esc(p.city)}, ${esc(p.state_province)} ${yearChip(p)}</div>` +
    (rows.length ? `<table>${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`).join('')}</table>` : '');
}

// ---------------------------------------------------------------- scales
export function niceTicks(lo, hi, count = 5) {
  if (lo === hi) { lo -= 1; hi += 1; }
  const raw = (hi - lo) / count, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(st => st >= raw);
  const ticks = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) ticks.push(+v.toFixed(10));
  return { ticks, lo: Math.min(lo, Math.floor(lo / step) * step), hi: Math.max(hi, Math.ceil(hi / step) * step) };
}
export function quantiles(vals) {
  const v = [...vals].sort((a, b) => a - b), q = f => v[Math.min(v.length - 1, Math.max(0, Math.round(f * (v.length - 1))))];
  return { min: v[0], q1: q(0.25), med: q(0.5), q3: q(0.75), max: v[v.length - 1], n: v.length };
}
export function percentile(vals, x) {
  if (x == null || !vals.length) return null;
  const below = vals.filter(v => v < x).length, eq = vals.filter(v => v === x).length;
  return Math.round((below + eq / 2) / vals.length * 100);
}
export const ordinal = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');

// ---------------------------------------------------------------- strip plot (dot histogram)
// progs: programs; get: p => number; highlight: [rid]; onClick(p)
// Few distinct values -> a column chart of counts. Otherwise one dot per program, with tall stacks capped at
// MAX_ROWS and the remainder shown as "+N", so heaps at 0% or 100% don't blow up the card.
const MAX_ROWS = 10;
export function stripPlot(container, opts) {
  const { progs, get } = opts;
  const pts = progs.map(p => ({ p, v: get(p) })).filter(d => d.v != null && isFinite(d.v));
  const box = document.createElement('div'); box.className = 'strip';
  container.appendChild(box);
  if (!pts.length) { box.innerHTML = '<p class="muted small">No programs report this.</p>'; return; }
  const distinct = new Set(pts.map(d => d.v)), vs = [...distinct];
  const smallInts = vs.every(Number.isInteger) && Math.max(...vs) - Math.min(...vs) <= 12;
  if (distinct.size <= 7 || smallInts) return columnPlot(box, pts, { ...opts, fillInts: smallInts });
  dotPlot(box, pts, opts);
}

function tipFor(dd, vals, format, tipRows) {
  return progTip(dd.p, [['Value', format(dd.v)], ['Percentile', pctLabel(percentile(vals, dd.v))], ...(tipRows ? tipRows(dd.p) : [])]);
}
function wire(svg, { vals, format, onClick, tipRows }) {
  svg.addEventListener('mousemove', ev => {
    const t = ev.target.__d, g = ev.target.__group;
    if (t) return showTip(tipFor(t, vals, format, tipRows), ev);
    if (g) return showTip(groupTip(g, format, vals), ev);
    hideTip();
  });
  svg.addEventListener('mouseleave', hideTip);
  svg.addEventListener('click', ev => { const t = ev.target.__d; if (t && onClick) { hideTip(); onClick(t.p); } });
}
function groupTip(g, format, vals) {
  const names = g.items.slice(0, 8).map(d => `<li>${esc(d.p.name)} ${yearChip(d.p)}</li>`).join('');
  const lbl = g.lo === g.hi ? format(g.lo) : `${format(g.lo)} – ${format(g.hi)}`;
  return `<div class="tt-name">${g.items.length} programs at ${lbl}</div><div class="tt-sub">${Math.round(g.items.length / vals.length * 100)}% of programs reporting</div>
    <ul class="tt-list">${names}${g.items.length > 8 ? `<li class="muted">and ${g.items.length - 8} more</li>` : ''}</ul>`;
}

function dotPlot(box, pts, { format, highlight = [], onClick, width, tipRows }) {
  const W = width || box.clientWidth || 600, r = 4, gap = 1, d = r * 2 + gap, M = { l: 10, r: 10, t: 16, b: 26 };
  const vals = pts.map(dd => dd.v), { ticks, lo, hi } = niceTicks(Math.min(...vals), Math.max(...vals), Math.max(3, Math.floor(W / 110)));
  const iw = W - M.l - M.r, x = v => M.l + (v - lo) / (hi - lo || 1) * iw;
  const hl = new Set(highlight), cols = new Map();
  // highlighted programs go to the bottom of their column so they are never hidden by the cap
  pts.sort((a, b) => (hl.has(b.p.rid) - hl.has(a.p.rid)) || a.v - b.v).forEach(dd => {
    const c = Math.round((x(dd.v) - M.l) / d); dd.col = c;
    if (!cols.has(c)) cols.set(c, []); cols.get(c).push(dd);
  });
  const maxRow = Math.min(MAX_ROWS, Math.max(...[...cols.values()].map(a => a.length)));
  const H = M.t + maxRow * d + 12 + M.b, base = H - M.b;
  const svg = s('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img' });
  s('line', { x1: M.l, x2: W - M.r, y1: base + 0.5, y2: base + 0.5, class: 'axis' }, svg);
  ticks.forEach(t => {
    s('line', { x1: x(t), x2: x(t), y1: base, y2: base + 4, class: 'axis' }, svg);
    s('text', { x: x(t), y: base + 16, class: 'tick', 'text-anchor': 'middle' }, svg).textContent = format(t);
  });
  const q = quantiles(vals), mx = x(q.med);
  s('line', { x1: mx, x2: mx, y1: M.t - 6, y2: base, class: 'median' }, svg);
  s('text', { x: mx + 4, y: M.t - 4, class: 'tick' }, svg).textContent = 'median ' + format(q.med);
  const dimmed = hl.size > 0, cy = row => base - r - 1 - row * d;
  for (const [c, items] of cols) {
    const cx = M.l + c * d, overflow = items.length > maxRow, shown = overflow ? maxRow - 1 : items.length;
    items.slice(0, shown).forEach((dd, row) => {
      const i = highlight.indexOf(dd.p.rid);
      if (i >= 0) {
        s('circle', { cx, cy: cy(row), r: r + 2, class: 'dot ring c' + i }, svg).__d = dd;
        s('text', { x: cx, y: cy(Math.max(row, shown - 1)) - r - 6 - (overflow ? 12 : 0), class: 'hl-label', 'text-anchor': 'middle' }, svg)
          .textContent = highlight.length > 1 ? LETTERS[i] : format(dd.v);
      } else {
        s('circle', { cx, cy: cy(row), r, class: 'dot ' + (dimmed ? 'dim' : yearClass(dd.p)) + (isEstimated(dd.p) ? ' est' : '') }, svg).__d = dd;
      }
    });
  }
  // capped columns: one "+N" per run of adjacent capped columns, with a bracket when the run is wider than one column
  const capped = [...cols.keys()].filter(c => cols.get(c).length > maxRow).sort((a, b) => a - b);
  const runs = [];
  capped.forEach(c => { const last = runs[runs.length - 1]; if (last && c - last[last.length - 1] <= 2) last.push(c); else runs.push([c]); });
  runs.forEach(run => {
    const x0 = M.l + run[0] * d, x1 = M.l + run[run.length - 1] * d, y = cy(maxRow - 1);
    const items = run.flatMap(c => cols.get(c)), hidden = run.reduce((a, c) => a + cols.get(c).length - (maxRow - 1), 0);
    if (run.length > 1) s('path', { d: `M${x0 - r},${y + 3} v-3 H${x1 + r} v3`, class: 'bracket' }, svg);
    const t = s('text', { x: (x0 + x1) / 2, y: y + (run.length > 1 ? -3 : 4), class: 'more', 'text-anchor': 'middle' }, svg);
    t.textContent = '+' + hidden;
    const hit = s('rect', { x: Math.min(x0 - r, (x0 + x1) / 2 - 12), y: y - 12, width: Math.max(x1 - x0 + 2 * r, 24), height: 18, class: 'hit' }, svg);
    const vs = items.map(dd => dd.v);
    hit.__group = t.__group = { items, lo: Math.min(...vs), hi: Math.max(...vs) };
  });
  wire(svg, { vals, format, onClick, tipRows });
  box.appendChild(svg);
}

function columnPlot(box, pts, { format, highlight = [], width, fillInts }) {
  const W = width || box.clientWidth || 600, H = 118, M = { l: 10, r: 10, t: 20, b: 22 };
  const vals = pts.map(d => d.v);
  let keys = [...new Set(vals)].sort((a, b) => a - b);
  if (fillInts) keys = Array.from({ length: keys[keys.length - 1] - keys[0] + 1 }, (_, i) => keys[0] + i);
  const groups = keys.map(v => ({ lo: v, hi: v, items: pts.filter(d => d.v === v) }));
  const max = Math.max(...groups.map(g => g.items.length)), n = groups.length;
  const slot = (W - M.l - M.r) / n, bw = Math.min(56, slot * 0.6), ih = H - M.t - M.b;
  const svg = s('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img' });
  s('line', { x1: M.l, x2: W - M.r, y1: H - M.b + .5, y2: H - M.b + .5, class: 'axis' }, svg);
  const med = quantiles(vals).med;
  groups.forEach((g, i) => {
    const cx = M.l + slot * (i + .5), h = g.items.length ? Math.max(2, g.items.length / max * ih) : 0, y = H - M.b - h;
    const bar = s('path', { d: `M${cx - bw / 2},${H - M.b} V${y + 4} q0,-4 4,-4 H${cx + bw / 2 - 4} q4,0 4,4 V${H - M.b} Z`, class: 'col' + (highlight.length ? ' dimfill' : '') }, svg);
    if (g.items.length) bar.__group = g; else bar.remove();
    if (g.items.length) s('text', { x: cx, y: y - 5, class: 'tick', 'text-anchor': 'middle' }, svg).textContent = g.items.length;
    s('text', { x: cx, y: H - M.b + 15, class: 'tick' + (g.lo === med ? ' strong' : ''), 'text-anchor': 'middle' }, svg).textContent = format(g.lo);
    const hs = highlight.map((rid, k) => [k, g.items.find(d => d.p.rid === rid)]).filter(([, d]) => d);
    hs.forEach(([k, d], j) => {
      const mx = cx + (j - (hs.length - 1) / 2) * 14;
      s('circle', { cx: mx, cy: H - M.b - 9, r: 6, class: 'dot ring c' + k }, svg).__d = d;
      if (highlight.length > 1) s('text', { x: mx, y: H - M.b - 18, class: 'hl-label', 'text-anchor': 'middle' }, svg).textContent = LETTERS[k];
    });
  });
  wire(svg, { vals, format });
  const cap = document.createElement('p'); cap.className = 'small muted colnote';
  cap.textContent = `Bars count programs. Median ${format(med)}.`;
  box.append(svg, cap);
}

// ---------------------------------------------------------------- range bar (inline peer context)
// Scaled to the 5th–95th percentile so a few extreme programs don't squash everyone else;
// values beyond that sit at the end of the track, which grows a small arrow on that side.
export const pctLabel = p => p == null ? '' : p <= 0 ? 'lowest' : p >= 100 ? 'highest' : ordinal(p) + ' pct.';
export function rangeBar({ vals, marks, format, width = 220 }) {
  const svg = s('svg', { width, height: 22, viewBox: `0 0 ${width} 22`, class: 'rangebar' });
  if (vals.length < 3) return svg;
  const q = quantiles(vals), sorted = [...vals].sort((a, b) => a - b);
  const at = f => sorted[Math.round(f * (sorted.length - 1))];
  let lo = at(0.05), hi = at(0.95);
  if (lo === hi) { lo = q.min; hi = q.max; }
  const pad = 9, inner = width - pad * 2, x = v => pad + (Math.min(hi, Math.max(lo, v)) - lo) / ((hi - lo) || 1) * inner;
  s('line', { x1: pad, x2: width - pad, y1: 11.5, y2: 11.5, class: 'track' }, svg);
  if (q.min < lo) s('path', { d: `M${pad - 6},11.5 l4,-3 v6 z`, class: 'beyond' }, svg);
  if (q.max > hi) s('path', { d: `M${width - pad + 6},11.5 l-4,-3 v6 z`, class: 'beyond' }, svg);
  s('rect', { x: x(q.q1), y: 8, width: Math.max(2, x(q.q3) - x(q.q1)), height: 7, rx: 3.5, class: 'iqr' }, svg);
  s('line', { x1: x(q.med), x2: x(q.med), y1: 4, y2: 19, class: 'median' }, svg);
  marks.forEach(m => { if (m.v != null) s('circle', { cx: x(m.v), cy: 11.5, r: 5, class: 'dot ring ' + m.cls }, svg); });
  svg.addEventListener('mousemove', ev => showTip(
    `<table>${marks.filter(m => m.v != null).map(m => `<tr><th>${esc(m.name)}</th><td>${format(m.v)} · ${pctLabel(percentile(vals, m.v))}</td></tr>`).join('')}
     <tr><th>Median</th><td>${format(q.med)}</td></tr><tr><th>Middle half</th><td>${format(q.q1)} – ${format(q.q3)}</td></tr>
     <tr><th>Bar spans</th><td>${format(lo)} – ${format(hi)} (5th–95th pct.)</td></tr>
     <tr><th>Full range</th><td>${format(q.min)} – ${format(q.max)}</td></tr><tr><th>Programs</th><td>${q.n}</td></tr></table>`, ev));
  svg.addEventListener('mouseleave', hideTip);
  return svg;
}

// ---------------------------------------------------------------- scatter
export function scatter(container, { progs, xm, ym, highlight = [], onClick }) {
  const pts = progs.map(p => ({ p, x: p[xm.key], y: p[ym.key] })).filter(d => d.x != null && d.y != null);
  const W = container.clientWidth || 700, H = Math.min(460, Math.max(300, W * 0.55)), M = { l: 56, r: 16, t: 12, b: 40 };
  const xs = niceTicks(Math.min(...pts.map(d => d.x)), Math.max(...pts.map(d => d.x)), 6);
  const ys = niceTicks(Math.min(...pts.map(d => d.y)), Math.max(...pts.map(d => d.y)), 5);
  const X = v => M.l + (v - xs.lo) / (xs.hi - xs.lo || 1) * (W - M.l - M.r);
  const Y = v => H - M.b - (v - ys.lo) / (ys.hi - ys.lo || 1) * (H - M.t - M.b);
  const svg = s('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: 'chart' });
  ys.ticks.forEach(t => {
    s('line', { x1: M.l, x2: W - M.r, y1: Y(t) + .5, y2: Y(t) + .5, class: 'grid' }, svg);
    s('text', { x: M.l - 8, y: Y(t) + 4, class: 'tick', 'text-anchor': 'end' }, svg).textContent = ym.fmt(t);
  });
  xs.ticks.forEach(t => s('text', { x: X(t), y: H - M.b + 18, class: 'tick', 'text-anchor': 'middle' }, svg).textContent = xm.fmt(t));
  s('line', { x1: M.l, x2: W - M.r, y1: H - M.b + .5, y2: H - M.b + .5, class: 'axis' }, svg);
  s('text', { x: W - M.r, y: H - 4, class: 'axlabel', 'text-anchor': 'end' }, svg).textContent = xm.label + ' →';
  s('text', { x: M.l, y: M.t - 2, class: 'axlabel' }, svg).textContent = '';
  const hl = new Set(highlight), dimmed = hl.size > 0;
  pts.filter(d => !hl.has(d.p.rid)).forEach(d => {
    s('circle', { cx: X(d.x), cy: Y(d.y), r: 4.5, class: 'dot ' + (dimmed ? 'dim' : yearClass(d.p)) + (isEstimated(d.p) ? ' est' : '') }, svg).__d = d;
  });
  pts.filter(d => hl.has(d.p.rid)).forEach(d => {
    const i = highlight.indexOf(d.p.rid);
    s('circle', { cx: X(d.x), cy: Y(d.y), r: 6.5, class: 'dot ring c' + i }, svg).__d = d;
    s('text', { x: X(d.x) + 10, y: Y(d.y) + 4, class: 'hl-label' }, svg).textContent = LETTERS[i];
  });
  svg.addEventListener('mousemove', ev => {
    const t = ev.target.__d; if (!t) return hideTip();
    showTip(progTip(t.p, [[xm.label, xm.fmt(t.x)], [ym.label, ym.fmt(t.y)]]), ev);
  });
  svg.addEventListener('mouseleave', hideTip);
  svg.addEventListener('click', ev => { const t = ev.target.__d; if (t && onClick) { hideTip(); onClick(t.p); } });
  const ylab = document.createElement('div'); ylab.className = 'ylabel'; ylab.textContent = '↑ ' + ym.label;
  container.append(ylab, svg);
}

// ---------------------------------------------------------------- horizontal share bars
// rows: [{label, value, total, title}]
export function shareBars(container, rows, { format = v => v } = {}) {
  const max = Math.max(...rows.map(r => r.value), 1);
  const list = document.createElement('div'); list.className = 'sharebars';
  rows.forEach(r => {
    const row = document.createElement('div'); row.className = 'sb-row';
    row.innerHTML = `<span class="sb-label">${esc(r.label)}</span><span class="sb-track"><span class="sb-bar" style="width:${r.value / max * 100}%"></span></span><span class="sb-val">${format(r)}</span>`;
    if (r.title) row.title = r.title;
    list.appendChild(row);
  });
  container.appendChild(list);
}

// ---------------------------------------------------------------- part-to-whole bar (graduate destinations)
export function partBar(parts, { width = 320 } = {}) {
  const tot = parts.reduce((a, p) => a + (p.v || 0), 0);
  const wrap = document.createElement('div'); wrap.className = 'partbar';
  if (!tot) { wrap.innerHTML = '<span class="muted">Not reported</span>'; return wrap; }
  const svg = s('svg', { width, height: 14, viewBox: `0 0 ${width} 14` });
  let x = 0;
  parts.forEach((p, i) => {
    if (!p.v) return;
    const w = p.v / tot * width;
    s('rect', { x: x + (x ? 1 : 0), y: 0, width: Math.max(1, w - (x ? 2 : 0)), height: 14, rx: 3, class: 'c' + i }, svg);
    x += w;
  });
  wrap.appendChild(svg);
  const lg = document.createElement('div'); lg.className = 'legend';
  lg.innerHTML = parts.map((p, i) => `<span><i class="sw c${i}"></i>${esc(p.label)} <b>${p.v ?? '—'}%</b></span>`).join('');
  wrap.appendChild(lg);
  return wrap;
}
