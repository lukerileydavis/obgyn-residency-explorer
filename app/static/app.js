import { fmt, GROUPS, METRICS, PROC_OB, PROC_GYN, FACULTY, FELLOWSHIPS, BENEFITS, DESTINATIONS } from './fields.js';
import {
  esc, yearChip, yearLegend, yearStrip, yearClass, yearText, yearTitle, isEstimated, LETTERS,
  stripPlot, rangeBar, scatter, shareBars, partBar, percentile, ordinal, pctLabel, progTip, quantiles,
} from './charts.js';

// ---------------------------------------------------------------- state
const store = {
  get(k, d) { try { const v = localStorage.getItem('atlas.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('atlas.' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const state = {
  all: [], byRid: new Map(),
  minYear: store.get('minYear', ''), undated: store.get('undated', true),
  compare: store.get('compare', []),
  table: { q: '', st: '', preset: 'overview', sort: 'name', dir: 1 },
  scatter: { x: 'q26_number_of_applications', y: 'interview_pct' },
  map: { color: 'year', size: 'positions', base: store.get('mapBase', 'states') },
};
let statesGeo = null;
const MAX_COMPARE = 4;
const main = document.getElementById('main');
const go = p => { location.hash = '#/program/' + p.rid; };

function filtered() {
  return state.all.filter(p => {
    if (!state.undated && isEstimated(p)) return false;
    if (state.minYear && (p.year_effective == null || p.year_effective < +state.minYear)) return false;
    return true;
  });
}
const vals = (progs, key) => progs.map(p => p[key]).filter(v => v != null && isFinite(v));

function setCompare(list) {
  state.compare = list.filter(r => state.byRid.has(r)).slice(0, MAX_COMPARE);
  store.set('compare', state.compare);
  renderTray();
}
function toggleCompare(rid) {
  if (state.compare.includes(rid)) setCompare(state.compare.filter(r => r !== rid));
  else if (state.compare.length < MAX_COMPARE) setCompare([...state.compare, rid]);
}

// ---------------------------------------------------------------- shell
function renderTray() {
  const tray = document.getElementById('tray');
  document.getElementById('cmp-count').textContent = state.compare.length ? `(${state.compare.length})` : '';
  if (!state.compare.length || location.hash.startsWith('#/compare')) { tray.hidden = true; return; }
  tray.hidden = false;
  tray.innerHTML = `<span class="muted">Comparing</span>` + state.compare.map((rid, i) => {
    const p = state.byRid.get(rid);
    return `<span class="chip"><i class="sw c${i}"></i><b>${LETTERS[i]}</b> ${esc(p.name)} ${yearChip(p)}<button data-rm="${rid}" aria-label="Remove ${esc(p.name)}">×</button></span>`;
  }).join('') + `<a class="btn" href="#/compare">Open comparison</a><button class="link" data-clear>Clear</button>`;
  tray.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { setCompare(state.compare.filter(r => r !== +b.dataset.rm)); route(); });
  tray.querySelector('[data-clear]').onclick = () => { setCompare([]); route(); };
}
function updateFilterCount() {
  const n = filtered().length;
  document.getElementById('filtercount').textContent = n === state.all.length ? `${n} programs` : `${n} of ${state.all.length} programs`;
}
function initShell() {
  const my = document.getElementById('minyear'), ud = document.getElementById('undated');
  my.value = state.minYear; ud.checked = state.undated;
  my.onchange = () => { state.minYear = my.value; store.set('minYear', my.value); updateFilterCount(); route(); };
  ud.onchange = () => { state.undated = ud.checked; store.set('undated', ud.checked); updateFilterCount(); route(); };
  updateFilterCount();
  addEventListener('hashchange', route);
  let t; addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => { if (!location.hash.startsWith('#/map')) route(true); }, 200); });
}

let lastHash = null;
function route(keepScroll = false) {
  const h = location.hash.replace(/^#/, '') || '/';
  const [path] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  const nav = parts[0] === 'program' ? '' : (parts[0] || 'programs');
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === nav));
  const sy = scrollY;
  if (mapInstance) { mapInstance.remove(); mapInstance = null; }
  main.innerHTML = '';
  main.className = 'view-' + (parts[0] || 'programs');
  if (parts[0] === 'map') viewMap();
  else if (parts[0] === 'distributions') viewDistributions();
  else if (parts[0] === 'program') viewProgram(+parts[1]);
  else if (parts[0] === 'compare') { if (parts[1]) setCompare(parts[1].split(',').map(Number)); viewCompare(); }
  else viewPrograms();
  renderTray();
  if (keepScroll === true || lastHash === h) scrollTo(0, sy); else scrollTo(0, 0);
  lastHash = h;
}

// ---------------------------------------------------------------- programs table
const PRESETS = {
  overview: ['Overview', ['q26_positions_offered', 'avg_usmle_step2', 'interview_pct', 'match_rate_interviewed', 'q10_pg_1_salary', 'residents_total', 'faculty_md_total', 'fellowships_offered']],
  match: ['Match', ['q26_positions_offered', 'q26_number_of_applications', 'q26_number_of_interviews_granted', 'apps_per_position', 'interview_pct', 'match_rate', 'match_rate_interviewed']],
  residents: ['Residents & outcomes', ['avg_usmle_step2', 'pct_aoa', 'abog_first_attempt_pass_pct', 'residents_total', 'residents_pct_female', 'residents_pct_img', 'residents_pct_do', 'q20_pct_fellowship']],
  salary: ['Salary & benefits', ['q10_pg_1_salary', 'q10_pg_2_salary', 'q10_pg_3_salary', 'q10_pg_4_salary', 'salary_avg', 'q10_pg_1_vacation', 'benefits_count']],
  procedures: ['Procedures', ['proc_ob_total', 'proc_gyn_total', 'q25_spontaneous_vaginal_deliveries', 'q25_cesarean_deliveries', 'q25_laparoscopic_hysterectomy', 'q25_abortions', 'q25_surgery_for_invasive_cancer']],
  faculty: ['Faculty', ['faculty_md_total', 'q22_maternal_fetal_medicine', 'q22_gynecologic_oncology', 'q22_female_pelvic_medicine_reconstructive_surgery_ur', 'q22_reproductive_endocrinology_infertility', 'q22_family_planning', 'faculty_subspecialties_covered', 'fellowships_offered']],
};
const SHORT = {
  q26_positions_offered: 'Positions', avg_usmle_step2: 'Step 2 avg', interview_pct: 'Interview %', match_rate_interviewed: 'Accept. if interviewed',
  match_rate: 'Acceptance', q10_pg_1_salary: 'PGY-1 salary', residents_total: 'Residents', faculty_md_total: 'FT faculty',
  fellowships_offered: 'Fellowships', q26_number_of_applications: 'Applications', q26_number_of_interviews_granted: 'Interviews',
  apps_per_position: 'Apps / position', pct_aoa: 'AOA', abog_first_attempt_pass_pct: 'ABOG pass', residents_pct_female: 'Female',
  residents_pct_img: 'IMG', residents_pct_do: 'DO', q20_pct_fellowship: '→ Fellowship', q10_pg_2_salary: 'PGY-2', q10_pg_3_salary: 'PGY-3',
  q10_pg_4_salary: 'PGY-4', salary_avg: 'Avg salary', q10_pg_1_vacation: 'Vacation', benefits_count: 'Benefits', proc_ob_total: 'OB total',
  proc_gyn_total: 'GYN total', q25_spontaneous_vaginal_deliveries: 'SVD', q25_cesarean_deliveries: 'Cesarean',
  q25_laparoscopic_hysterectomy: 'Lap hyst', q25_abortions: 'Abortion', q25_surgery_for_invasive_cancer: 'Invasive cancer',
  q22_maternal_fetal_medicine: 'MFM', q22_gynecologic_oncology: 'Gyn onc', q22_female_pelvic_medicine_reconstructive_surgery_ur: 'Urogyn',
  q22_reproductive_endocrinology_infertility: 'REI', q22_family_planning: 'Fam. plan.', faculty_subspecialties_covered: 'Subspecialties',
};

function viewPrograms() {
  const T = state.table, progs = filtered();
  const states = [...new Set(state.all.map(p => p.state_province))].sort();
  const intro = document.createElement('section'); intro.className = 'intro';
  intro.innerHTML = `<h1>${progs.length} OB/GYN residency programs</h1>
    <p class="lede">Self-reported APGO directory listings for programs whose residents average Step 2 above 230. Each listing reports its own survey year, so every number here carries its year.</p>`;
  intro.appendChild(yearStrip(progs));
  main.appendChild(intro);

  const bar = document.createElement('div'); bar.className = 'toolbar';
  bar.innerHTML = `<input type="search" id="q" placeholder="Search programs or cities" value="${esc(T.q)}" aria-label="Search programs">
    <select id="st" aria-label="State"><option value="">All states</option>${states.map(s => `<option ${s === T.st ? 'selected' : ''}>${s}</option>`).join('')}</select>
    <div class="seg" role="tablist" aria-label="Columns">${Object.entries(PRESETS).map(([k, [l]]) => `<button role="tab" data-p="${k}" aria-selected="${k === T.preset}">${l}</button>`).join('')}</div>
    ${yearLegend()}`;
  main.appendChild(bar);
  const wrap = document.createElement('div'); wrap.className = 'tablewrap'; main.appendChild(wrap);

  const draw = () => {
    const cols = PRESETS[T.preset][1];
    const q = T.q.trim().toLowerCase();
    let rows = progs.filter(p => (!T.st || p.state_province === T.st) && (!q || `${p.name} ${p.city} ${p.state_province} ${p.program_name || ''}`.toLowerCase().includes(q)));
    const key = T.sort, dir = T.dir;
    rows.sort((a, b) => {
      const av = key === 'year' ? a.year_effective : a[key], bv = key === 'year' ? b.year_effective : b[key];
      if (av == null && bv == null) return 0; if (av == null) return 1; if (bv == null) return -1;
      return (typeof av === 'string' ? av.localeCompare(bv) : av - bv) * dir;
    });
    const th = (k, label, cls = '') => `<th class="${cls}" data-sort="${k}" aria-sort="${T.sort === k ? (T.dir > 0 ? 'ascending' : 'descending') : 'none'}" title="${esc(METRICS[k]?.desc || METRICS[k]?.label || '')}">${label}${T.sort === k ? (T.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
    wrap.innerHTML = `<table class="ptable"><thead><tr><th class="cmpcol"><span class="vh">Compare</span></th>${th('name', 'Program')}${th('year', 'Data year', 'num')}${cols.map(c => th(c, SHORT[c] || METRICS[c].label, 'num')).join('')}</tr></thead>
      <tbody>${rows.map(p => `<tr data-rid="${p.rid}"><td class="cmpcol"><input type="checkbox" aria-label="Compare ${esc(p.name)}" ${state.compare.includes(p.rid) ? 'checked' : ''} ${!state.compare.includes(p.rid) && state.compare.length >= MAX_COMPARE ? 'disabled' : ''}></td>
        <td><a href="#/program/${p.rid}" class="pname">${esc(p.name)}</a><span class="ploc">${esc(p.city)}, ${p.state_province}</span></td>
        <td class="num">${yearChip(p)}</td>${cols.map(c => `<td class="num">${METRICS[c].fmt(p[c])}</td>`).join('')}</tr>`).join('')}</tbody></table>
      ${rows.length ? '' : '<p class="empty">No programs match. Clear the search or widen the data-year filter in the header.</p>'}`;
    wrap.querySelectorAll('th[data-sort]').forEach(h => h.onclick = () => {
      const k = h.dataset.sort; if (T.sort === k) T.dir *= -1; else { T.sort = k; T.dir = k === 'name' ? 1 : -1; } draw();
    });
    wrap.querySelectorAll('input[type=checkbox]').forEach(cb => cb.onchange = () => { toggleCompare(+cb.closest('tr').dataset.rid); draw(); });
    wrap.querySelectorAll('tbody tr').forEach(tr => tr.onclick = e => { if (!e.target.closest('input,a')) location.hash = '#/program/' + tr.dataset.rid; });
  };
  bar.querySelector('#q').oninput = e => { T.q = e.target.value; draw(); };
  bar.querySelector('#st').onchange = e => { T.st = e.target.value; draw(); };
  bar.querySelectorAll('[data-p]').forEach(b => b.onclick = () => {
    T.preset = b.dataset.p; bar.querySelectorAll('[data-p]').forEach(x => x.setAttribute('aria-selected', x === b)); draw();
  });
  draw();
}

// ---------------------------------------------------------------- map
let mapInstance = null;
const GEO = {
  census_exact: 'Street address, exact match', census_non_exact: 'Street address, approximate match',
  zip_centroid: 'ZIP code center (approximate)', city_centroid: 'City center (approximate)',
};
const approxGeo = p => p.geocode_method === 'zip_centroid' || p.geocode_method === 'city_centroid';

function viewMap() {
  const progs = filtered().filter(p => p.latitude != null);
  const M = state.map;
  const colorOpts = [['year', 'Data year'], ...['avg_usmle_step2', 'interview_pct', 'match_rate_interviewed', 'q10_pg_1_salary', 'q26_number_of_applications', 'faculty_md_total', 'proc_gyn_total'].map(k => [k, METRICS[k].label])];
  main.innerHTML = `<div class="maptools toolbar">
      <label>Color by <select id="mcolor">${colorOpts.map(([k, l]) => `<option value="${k}" ${k === M.color ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      <label>Size by <select id="msize"><option value="positions" ${M.size === 'positions' ? 'selected' : ''}>Positions offered</option><option value="uniform" ${M.size === 'uniform' ? 'selected' : ''}>Same size</option></select></label>
      <label>Base map <select id="mbase"><option value="states" ${M.base !== 'osm' ? 'selected' : ''}>State outlines</option><option value="osm" ${M.base === 'osm' ? 'selected' : ''}>Streets (OpenStreetMap)</option></select></label>
      <span id="mlegend"></span>
      <span class="muted small"><i class="sw hollow"></i> hollow = location approximate (ZIP or city center)</span>
    </div>
    <div id="map" role="region" aria-label="Map of programs"></div><div id="mapfoot"></div>`;
  const map = mapInstance = L.map('map', { scrollWheelZoom: true, zoomSnap: 0.25 });
  // Base layer: local state outlines by default (no network, no key); OSM street tiles on request.
  let base = null;
  const setBase = async () => {
    if (base) { map.removeLayer(base); base = null; }
    if (M.base === 'osm') {
      base = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 });
    } else {
      statesGeo ||= await fetch('us-states.geojson').then(r => r.json());
      if (mapInstance !== map) return;
      base = L.geoJSON(statesGeo, { style: { className: 'state' }, interactive: false, attribution: 'US Census boundaries' });
    }
    base.addTo(map); base.bringToBack();
    document.getElementById('map').classList.toggle('tiles', M.base === 'osm');
  };
  setBase();
  const layer = L.layerGroup().addTo(map);

  const draw = () => {
    layer.clearLayers();
    let cls, legend;
    if (M.color === 'year') { cls = p => yearClass(p); legend = yearLegend(); }
    else {
      const m = METRICS[M.color], v = vals(progs, M.color).sort((a, b) => a - b);
      const cuts = [0.2, 0.4, 0.6, 0.8].map(f => v[Math.floor(f * (v.length - 1))]);
      cls = p => p[M.color] == null ? 'yn' : 'y' + cuts.filter(c => p[M.color] > c).length;
      const edges = [v[0], ...cuts, v[v.length - 1]];
      legend = `<span class="yrlegend">${[0, 1, 2, 3, 4].map(i => `<span><i class="sw y${i}"></i>${m.fmt(edges[i])}–${m.fmt(edges[i + 1])}</span>`).join('')}<span><i class="sw yn"></i>not reported</span></span>`;
    }
    document.getElementById('mlegend').innerHTML = legend;
    [...progs].sort((a, b) => (b.q26_positions_offered || 0) - (a.q26_positions_offered || 0)).forEach(p => {
      const r = M.size === 'uniform' ? 6 : 3 + Math.sqrt(p.q26_positions_offered || 4) * 2.2;
      const mk = L.circleMarker([p.latitude, p.longitude], { radius: r, className: `mk ${cls(p)}${approxGeo(p) ? ' approx' : ''}${state.compare.includes(p.rid) ? ' inc' : ''}` });
      mk.bindTooltip(() => progTip(p, [
        ['Data year', `${yearText(p)}${isEstimated(p) ? ' (from update date)' : ''}`],
        ['Location', esc(GEO[p.geocode_method] || p.geocode_method || '—')],
        ['Positions', fmt.int(p.q26_positions_offered)],
        ['Step 2 avg', fmt.int(p.avg_usmle_step2)],
        ['Interview %', fmt.pct(p.interview_pct)],
        ['Accept. if interviewed', fmt.pct(p.match_rate_interviewed)],
        ['PGY-1 salary', fmt.money(p.q10_pg_1_salary)],
        ...(M.color !== 'year' && !['avg_usmle_step2', 'interview_pct', 'match_rate_interviewed', 'q10_pg_1_salary'].includes(M.color) ? [[METRICS[M.color].label, METRICS[M.color].fmt(p[M.color])]] : []),
      ]), { className: 'maptip', direction: 'top', offset: [0, -r], opacity: 1 });
      mk.on('click', () => go(p));
      mk.addTo(layer);
    });
  };
  document.getElementById('mcolor').onchange = e => { M.color = e.target.value; draw(); };
  document.getElementById('msize').onchange = e => { M.size = e.target.value; draw(); };
  document.getElementById('mbase').onchange = e => { M.base = e.target.value; store.set('mapBase', M.base); setBase(); };
  draw();
  const b = L.latLngBounds(progs.map(p => [p.latitude, p.longitude]));
  if (b.isValid()) map.fitBounds(b, { padding: [30, 30] }); else map.setView([39, -96], 4);
  document.getElementById('mapfoot').appendChild(yearStrip(progs));
  const missing = filtered().length - progs.length;
  if (missing) document.getElementById('mapfoot').insertAdjacentHTML('beforeend', `<span class="muted small">${missing} without coordinates</span>`);
}

// ---------------------------------------------------------------- distributions
function chartCard(parent, m, progs, { wide = false } = {}) {
  const card = document.createElement('figure'); card.className = 'card' + (wide ? ' wide' : '');
  const withVal = progs.filter(p => p[m.key] != null);
  card.innerHTML = `<figcaption><span class="ctitle">${esc(m.label)}</span>${m.desc ? `<span class="cdesc">${esc(m.desc)}</span>` : ''}</figcaption>`;
  parent.appendChild(card);
  stripPlot(card, { progs, get: p => p[m.key], format: m.fmt, highlight: state.compare, onClick: go });
  card.appendChild(yearStrip(withVal));
  return card;
}

function viewDistributions() {
  const progs = filtered();
  const head = document.createElement('section'); head.className = 'intro';
  const hl = state.compare.map((r, i) => { const p = state.byRid.get(r); return `<span class="chip"><i class="sw c${i}"></i><b>${LETTERS[i]}</b> ${esc(p.name)}</span>`; }).join(' ');
  head.innerHTML = `<h1>How programs spread out</h1>
    <p class="lede">One dot per program, colored by the year its data comes from. Hover a dot for details; click it to open the program.
    ${state.compare.length ? `Programs in your comparison are marked and the rest are grayed out: ${hl}` : 'Add programs to your comparison to mark them on every chart.'}</p>
    <div class="toolbar"><nav class="jump">${GROUPS.map(g => `<a href="#${g.id}" data-jump="${g.id}">${g.title}</a>`).join('')}<a href="#rel" data-jump="rel">Relationships</a></nav>${yearLegend()}</div>`;
  main.appendChild(head);
  head.querySelectorAll('[data-jump]').forEach(a => a.onclick = e => { e.preventDefault(); document.getElementById('sec-' + a.dataset.jump)?.scrollIntoView({ behavior: 'smooth' }); });

  for (const g of GROUPS) {
    const sec = document.createElement('section'); sec.className = 'dsec'; sec.id = 'sec-' + g.id;
    sec.innerHTML = `<h2>${g.title}</h2>${g.note ? `<p class="note">${g.note}</p>` : ''}`;
    const grid = document.createElement('div'); grid.className = 'grid';
    sec.appendChild(grid); main.appendChild(sec);
    const ms = g.metrics.filter(m => vals(progs, m.key).length >= 5 && !(g.id === 'faculty' && m.sub === 'faculty' && m.key !== 'q22_general_ob_gyn'));
    ms.forEach(m => chartCard(grid, m, progs));

    if (g.id === 'faculty') {
      const sub = document.createElement('div'); sub.className = 'grid'; sec.appendChild(sub);
      const c1 = document.createElement('figure'); c1.className = 'card';
      c1.innerHTML = '<figcaption><span class="ctitle">Programs with at least one full-time faculty member</span><span class="cdesc">Share of programs, by subspecialty. Hover for the typical count.</span></figcaption>';
      sub.appendChild(c1);
      const reporting = progs.filter(p => p.faculty_md_total != null);
      shareBars(c1, FACULTY.filter(([k]) => k !== 'general_ob_gyn').map(([k, l]) => {
        const v = vals(reporting, 'q22_' + k).filter(x => x > 0);
        return { label: l, value: v.length, total: reporting.length, title: v.length ? `Median ${quantiles(v).med} among programs that have any` : '' };
      }).sort((a, b) => b.value - a.value), { format: r => `${Math.round(r.value / r.total * 100)}%` });
      c1.appendChild(yearStrip(reporting));
      const c2 = document.createElement('figure'); c2.className = 'card';
      c2.innerHTML = '<figcaption><span class="ctitle">Fellowships offered at the institution</span><span class="cdesc">Share of programs</span></figcaption>';
      sub.appendChild(c2);
      shareBars(c2, FELLOWSHIPS.map(([k, l]) => ({ label: l, value: progs.filter(p => p['fellow_' + k]).length, total: progs.length }))
        .sort((a, b) => b.value - a.value), { format: r => `${Math.round(r.value / r.total * 100)}%` });
      c2.appendChild(yearStrip(progs));
      const fac = document.createElement('div'); fac.className = 'grid'; sec.appendChild(fac);
      sec.insertBefore(Object.assign(document.createElement('h3'), { textContent: 'Full-time faculty by subspecialty' }), fac);
      g.metrics.filter(m => m.sub === 'faculty' && m.key !== 'q22_general_ob_gyn' && vals(progs, m.key).length >= 5).forEach(m => chartCard(fac, m, progs));
    }
    if (g.id === 'salary') {
      const sub = document.createElement('div'); sub.className = 'grid'; sec.appendChild(sub);
      const c = document.createElement('figure'); c.className = 'card';
      c.innerHTML = '<figcaption><span class="ctitle">Benefits offered</span><span class="cdesc">Share of programs that report “Yes”</span></figcaption>';
      sub.appendChild(c);
      shareBars(c, BENEFITS.map(([k, l]) => ({ label: l, value: progs.filter(p => p['q14_' + k] === 1).length, total: progs.length }))
        .sort((a, b) => b.value - a.value), { format: r => `${Math.round(r.value / r.total * 100)}%` });
      c.appendChild(yearStrip(progs));
      const c2 = document.createElement('figure'); c2.className = 'card';
      c2.innerHTML = '<figcaption><span class="ctitle">Moonlighting</span><span class="cdesc">Free-text answers grouped; hover a program’s page for its exact wording</span></figcaption>';
      sub.appendChild(c2);
      const ml = progs.filter(p => p.moonlighting);
      shareBars(c2, [['yes', 'Permitted'], ['limited', 'Limited or with approval'], ['no', 'Not permitted']].map(([k, l]) => ({ label: l, value: ml.filter(p => p.moonlighting === k).length, total: ml.length })),
        { format: r => `${Math.round(r.value / r.total * 100)}%` });
      c2.appendChild(yearStrip(ml));
      // salary by PGY level as one wide chart: median line across years
      const c3 = document.createElement('figure'); c3.className = 'card';
      c3.innerHTML = '<figcaption><span class="ctitle">PGY-1 salary by data year</span><span class="cdesc">Why year matters: older listings report older pay scales</span></figcaption>';
      sub.appendChild(c3);
      const byYear = {};
      progs.filter(p => p.q10_pg_1_salary != null && p.year_effective != null).forEach(p => (byYear[p.year_effective] ||= []).push(p.q10_pg_1_salary));
      shareBars(c3, Object.entries(byYear).sort().map(([y, v]) => ({ label: y, value: quantiles(v).med, total: v.length, title: `${v.length} programs` })),
        { format: r => `${fmt.moneyk(r.value)} <span class="muted">n=${r.total}</span>` });
    }
  }

  // relationships
  const sec = document.createElement('section'); sec.className = 'dsec'; sec.id = 'sec-rel';
  const opts = sel => Object.values(METRICS).map(m => `<option value="${m.key}" ${m.key === sel ? 'selected' : ''}>${esc(m.label)}</option>`).join('');
  sec.innerHTML = `<h2>Relationships</h2><p class="note">Pick any two measures. Each dot is a program, colored by data year.</p>
    <div class="toolbar"><label>Across <select id="sx">${opts(state.scatter.x)}</select></label><label>Up <select id="sy">${opts(state.scatter.y)}</select></label></div>
    <figure class="card wide" id="scat"></figure>`;
  main.appendChild(sec);
  const drawScatter = () => {
    const f = sec.querySelector('#scat'); f.innerHTML = '';
    const xm = METRICS[state.scatter.x], ym = METRICS[state.scatter.y];
    scatter(f, { progs, xm, ym, highlight: state.compare, onClick: go });
    f.appendChild(yearStrip(progs.filter(p => p[xm.key] != null && p[ym.key] != null)));
  };
  sec.querySelector('#sx').onchange = e => { state.scatter.x = e.target.value; drawScatter(); };
  sec.querySelector('#sy').onchange = e => { state.scatter.y = e.target.value; drawScatter(); };
  drawScatter();
}

// ---------------------------------------------------------------- program page
function peerRow(p, peers, m, { label } = {}) {
  const v = p[m.key], pv = vals(peers, m.key), pct = percentile(pv, v);
  const tr = document.createElement('tr');
  tr.innerHTML = `<th>${esc(label || m.label)}${m.desc ? `<span class="rdesc">${esc(m.desc)}</span>` : ''}</th><td class="num big">${m.fmt(v)}</td><td class="rb"></td><td class="num muted pctl">${v == null ? '' : pctLabel(pct)}</td>`;
  tr.querySelector('.rb').appendChild(rangeBar({ vals: pv, marks: [{ v, cls: 'c0', name: 'This program' }], format: m.fmt }));
  return tr;
}
function peerTable(p, peers, metrics) {
  const t = document.createElement('table'); t.className = 'peers';
  t.innerHTML = '<thead><tr><th></th><th class="num">This program</th><th>Among peers</th><th class="num"><span class="vh">Percentile</span></th></tr></thead>';
  const tb = document.createElement('tbody'); t.appendChild(tb);
  metrics.forEach(m => tb.appendChild(peerRow(p, peers, typeof m === 'string' ? METRICS[m] : m)));
  return t;
}
const yn = v => v === 1 ? 'Yes' : v === 0 ? 'No' : '—';
const pgCheck = (p, pre) => [1, 2, 3, 4].filter(i => p[`${pre}${i}`]).map(i => 'PGY-' + i).join(', ') || '—';

function viewProgram(rid) {
  const p = state.byRid.get(rid);
  if (!p) { main.innerHTML = '<p class="empty">No program with that ID. <a href="#/">Back to all programs</a></p>'; return; }
  const peers = filtered().some(x => x.rid === rid) ? filtered() : [...filtered(), p];
  const inCmp = state.compare.includes(rid);
  const age = p.year_effective ? new Date().getFullYear() - p.year_effective : null;
  const notes = Array.isArray(p.data_notes) ? p.data_notes : [];

  main.innerHTML = `
  <article class="program">
    <header class="phead">
      <div class="ptitle">
        <p class="crumb"><a href="#/">All programs</a></p>
        <h1>${esc(p.program_name || p.name)}</h1>
        <p class="where">${esc(p.city)}, ${esc(p.state_province)}${p.medical_school_affiliation ? ` · ${esc(p.medical_school_affiliation)}` : ''}</p>
        <div class="actions">
          <button class="btn ${inCmp ? 'on' : ''}" id="cmpbtn" ${!inCmp && state.compare.length >= MAX_COMPARE ? 'disabled title="Comparison is full (4 programs)"' : ''}>${inCmp ? 'Remove from comparison' : 'Add to comparison'}</button>
          ${p.website ? `<a class="btn ghost" href="${esc(p.website)}" target="_blank" rel="noopener">Program website</a>` : ''}
          <a class="btn ghost" href="${esc(p.detail_url)}" target="_blank" rel="noopener">APGO listing</a>
        </div>
      </div>
      <aside class="stamp" title="${esc(yearTitle(p))}">
        <span class="stamp-label">${isEstimated(p) ? 'Data year not reported' : 'Data year'}</span>
        ${yearChip(p, true)}
        <span class="stamp-meta">${isEstimated(p) ? 'Year shown is when the listing was last updated' : `Listing updated ${p.last_updated || 'date unknown'}`}</span>
        ${age >= 3 ? `<span class="stamp-warn">${age} years old. Compare with care.</span>` : ''}
      </aside>
    </header>

    <section class="funnel" aria-label="Last match">
      <div><span class="fv">${fmt.int(p.q26_number_of_applications)}</span><span class="fl">applications</span></div>
      <div class="arrow"><span>${fmt.pct(p.interview_pct)}</span><small>interviewed</small></div>
      <div><span class="fv">${fmt.int(p.q26_number_of_interviews_granted)}</span><span class="fl">interviews</span></div>
      <div class="arrow"><span>${fmt.pct(p.match_rate_interviewed)}</span><small>matched</small></div>
      <div><span class="fv">${fmt.int(p.q26_positions_matched)}</span><span class="fl">matched of ${fmt.int(p.q26_positions_offered)} positions</span></div>
      <div class="fsum"><span class="fv">${fmt.pct1(p.match_rate)}</span><span class="fl">of applicants matched</span></div>
    </section>
    ${p.match_flag ? `<p class="flag">Check these numbers: ${esc(p.match_flag)}.</p>` : ''}

    <p class="peernote">Ranges compare this program with ${peers.length} programs in the current data-year filter. The bar shows the full range, the middle half of programs, and the median.</p>
    <div class="pgrid">
      <section><h2>Match & applicants</h2><div data-slot="match"></div></section>
      <section><h2>Current residents</h2><div data-slot="res"></div><div data-slot="restable"></div></section>
      <section><h2>Salary & benefits</h2><div data-slot="sal"></div><div data-slot="ben"></div></section>
      <section><h2>Outcomes</h2><div data-slot="out"></div><h3>Where graduates go</h3><div data-slot="dest"></div></section>
      <section class="span2"><h2>Procedures</h2><p class="note">${GROUPS.find(g => g.id === 'procedures').note}</p>${p.proc_note ? `<p class="flag">Adjusted: ${esc(p.proc_note)}</p>` : ''}<div class="two" data-slot="proc"></div></section>
      <section class="span2"><h2>Faculty & fellowships</h2><p class="note">${GROUPS.find(g => g.id === 'faculty').note}</p><div class="two" data-slot="fac"></div><h3>Fellowships at the institution</h3><div data-slot="fel"></div></section>
      <section class="span2"><h2>Training structure</h2><div data-slot="train"></div></section>
      <section><h2>Conferences</h2><div data-slot="conf"></div></section>
      <section><h2>Hospitals</h2><div data-slot="hosp"></div></section>
      ${p.q15_text || p.q16_text ? `<section class="span2 prose"><h2>In the program’s words</h2>
        ${p.q15_text ? `<h3>Living in the area</h3><p>${esc(p.q15_text)}</p>` : ''}${p.q16_text ? `<h3>What else applicants should know</h3><p>${esc(p.q16_text)}</p>` : ''}</section>` : ''}
      <section><h2>${p.chair_name || p.program_director_name || p.contact_name || p.contact_email ? 'Contacts' : 'Address'}</h2><dl class="kv">
        ${[['Chair', p.chair_name], ['Program director', p.program_director_name], ['Residency contact', p.contact_name],
           ['Email', p.contact_email ? `<a href="mailto:${esc(p.contact_email)}">${esc(p.contact_email)}</a>` : null], ['Phone', p.contact_phone || p.program_director_phone],
           ['Address', p.address ? esc(p.address).replace(/\n/g, '<br>') : null]].filter(([, v]) => v).map(([k, v]) => `<dt>${k}</dt><dd>${k === 'Email' || k === 'Address' ? v : esc(v)}</dd>`).join('')}
      </dl></section>
      <section><h2>About this data</h2><dl class="kv">
        <dt>Data year</dt><dd>${esc(yearTitle(p))}</dd>
        <dt>Accreditation</dt><dd>${esc(p.q5_accreditation_status || '—')}${p.q5_year_of_last_accreditation ? `, last ${p.q5_year_of_last_accreditation}` : ''}</dd>
        <dt>Map location</dt><dd>${esc(GEO[p.geocode_method] || '—')}${p.geocode_query ? `<span class="rdesc">${esc(p.geocode_query)}</span>` : ''}</dd>
        ${p.proc_note ? `<dt>Procedures</dt><dd>${esc(p.proc_note)}</dd>` : ''}
        <dt>APGO ID</dt><dd>${p.rid}</dd>
      </dl>${notes.length ? `<h3>Cleaning notes</h3><ul class="notes">${notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}</section>
    </div>
  </article>`;

  main.querySelector('#cmpbtn').onclick = () => { toggleCompare(rid); route(true); };
  const slot = n => main.querySelector(`[data-slot="${n}"]`);
  slot('match').appendChild(peerTable(p, peers, ['interview_pct', 'match_rate', 'match_rate_interviewed', 'apps_per_position', 'q26_number_of_applications', 'q26_positions_offered']));
  slot('res').appendChild(peerTable(p, peers, ['avg_usmle_step2', 'pct_aoa', 'residents_total', 'residents_pct_female', 'residents_pct_img', 'residents_pct_do'].filter(k => k !== 'avg_usmle_step1' || p[k] != null)));
  slot('restable').innerHTML = `<table class="mini"><thead><tr><th></th>${[1, 2, 3, 4].map(i => `<th class="num">PGY-${i}</th>`).join('')}</tr></thead><tbody>
    ${[['total', 'Residents'], ['female', 'Female'], ['male', 'Male'], ['img', 'International grads'], ['do', 'DO']].map(([k, l]) => `<tr><th>${l}</th>${[1, 2, 3, 4].map(i => `<td class="num">${fmt.int(p[`q17_pg_${i}_${k}`])}</td>`).join('')}</tr>`).join('')}
    </tbody></table>`;
  slot('sal').appendChild(peerTable(p, peers, ['q10_pg_1_salary', 'q10_pg_2_salary', 'q10_pg_3_salary', 'q10_pg_4_salary', 'q10_pg_1_vacation']));
  slot('ben').innerHTML = `<ul class="checks">${BENEFITS.map(([k, l]) => `<li class="${p['q14_' + k] === 1 ? 'yes' : p['q14_' + k] === 0 ? 'no' : 'na'}"><span aria-hidden="true">${p['q14_' + k] === 1 ? '✓' : p['q14_' + k] === 0 ? '–' : '?'}</span>${l}</li>`).join('')}</ul>
    <p class="small"><b>Moonlighting:</b> ${esc(p.q13_moonlighting_permitted || 'Not reported')}</p>`;
  slot('out').appendChild(peerTable(p, peers, ['abog_first_attempt_pass_pct', 'q20_pct_fellowship']));
  slot('dest').appendChild(partBar(DESTINATIONS.map(([k, l]) => ({ v: p[k], label: l })), { width: 300 }));
  const proc = slot('proc');
  proc.appendChild(peerTable(p, peers, ['proc_ob_total', ...PROC_OB.map(([k]) => 'q25_' + k)]));
  proc.appendChild(peerTable(p, peers, ['proc_gyn_total', ...PROC_GYN.map(([k]) => 'q25_' + k)]));
  const fac = slot('fac'), facKeys = FACULTY.map(([k]) => 'q22_' + k);
  fac.appendChild(peerTable(p, peers, ['faculty_md_total', ...facKeys.slice(0, 6)]));
  fac.appendChild(peerTable(p, peers, facKeys.slice(6)));
  slot('fel').innerHTML = `<p class="tags">${FELLOWSHIPS.map(([k, l]) => `<span class="tag ${p['fellow_' + k] ? 'on' : ''}">${l}</span>`).join('')}</p>`;
  slot('train').innerHTML = `<table class="mini rot"><thead><tr><th></th>${[1, 2, 3, 4].map(i => `<th>PGY-${i}</th>`).join('')}</tr></thead><tbody>
      <tr><th>Rotations</th>${[1, 2, 3, 4].map(i => `<td>${esc(p['q6_pg_' + i] || '—')}</td>`).join('')}</tr>
      <tr><th>Night float</th>${[1, 2, 3, 4].map(i => `<td>${yn(p['q9_pg_' + i])}</td>`).join('')}</tr>
      <tr><th>Visiting-student alumni</th>${[1, 2, 3, 4].map(i => `<td>${fmt.int(p['q29_pg' + i])}</td>`).join('')}</tr>
    </tbody></table>
    <dl class="kv cols">
      <dt>Elective rotation</dt><dd>${yn(p.q7_is_a_resident_elective_rotation_offered)}${p.q7_is_a_resident_elective_rotation_offered ? ` · ${pgCheck(p, 'q7_pg_')} · ${esc(p.q7_number_of_weeks || '?')} weeks` : ''}</dd>
      <dt>Global health option</dt><dd>${yn(p.q7_option_for_global_health)}</dd>
      <dt>Research project</dt><dd>${esc(p.q11_research_project_required || '—')}${pgCheck(p, 'q11_pg_') !== '—' ? ` · presented ${pgCheck(p, 'q11_pg_')}` : ''}</dd>
      <dt>CREOG in-service exam</dt><dd>${yn(p.q12_in_service_examination_creog_required)}</dd>
      <dt>Oral exams</dt><dd>${yn(p.q12_departmental_or_rotation_oral_examination)}</dd>
      <dt>Simulation / OSCE</dt><dd>${esc(p.q12_performance_based_assessment_osce_simulation_sur || '—')}</dd>
      <dt>Min. Step scores to interview</dt><dd>Step 1: ${esc(p.q27_usmle_step_i || '—')} · Step 2: ${esc(p.q27_usmle_step_ii || '—')}</dd>
      <dt>Student electives</dt><dd>${yn(p.q28_medical_student_electives_available)}${p.q28_duration_weeks ? ` · ${esc(p.q28_duration_weeks)} weeks` : ''}</dd>
    </dl>`;
  const conf = p.conferences_json || [];
  slot('conf').innerHTML = conf.length ? `<table class="mini"><thead><tr><th>Conference</th><th>Attendance</th><th class="num">Per month</th></tr></thead><tbody>
    ${conf.map(c => `<tr><td>${esc(c.name)}</td><td>${{ R: 'Required', RS: 'Required (some)', 'R/S': 'Required (some)', O: 'Optional' }[c.requirement] || esc(c.requirement)}</td><td class="num">${c.times_per_month ?? '—'}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Not reported</p>';
  const hosp = p.hospitals_json || [];
  slot('hosp').innerHTML = hosp.length ? `<div class="sharebars">${hosp.map(h => `<div class="sb-row"><span class="sb-label">${esc(h.name)}</span><span class="sb-track"><span class="sb-bar" style="width:${h.pct || 0}%"></span></span><span class="sb-val">${h.pct == null ? '—' : h.pct + '%'}</span></div>`).join('')}</div><p class="small muted">Share of training time</p>` : '<p class="muted">Not reported</p>';
}

// ---------------------------------------------------------------- compare
function viewCompare() {
  const ps = state.compare.map(r => state.byRid.get(r)).filter(Boolean);
  const peers = filtered();
  const head = document.createElement('section'); head.className = 'intro';
  head.innerHTML = `<h1>Compare programs</h1><div class="toolbar">
      <input list="plist" id="addp" placeholder="${ps.length >= MAX_COMPARE ? 'Comparison is full: remove one to add another' : 'Add a program by name'}" ${ps.length >= MAX_COMPARE ? 'disabled' : ''} aria-label="Add a program">
      <datalist id="plist">${state.all.filter(p => !state.compare.includes(p.rid)).map(p => `<option value="${esc(p.name)}">${esc(p.city)}, ${p.state_province}</option>`).join('')}</datalist>
      ${ps.length ? `<button class="link" id="clr">Clear all</button>` : ''}</div>`;
  main.appendChild(head);
  const add = head.querySelector('#addp');
  add.onchange = () => { const p = state.all.find(x => x.name === add.value); if (p) { toggleCompare(p.rid); route(); } };
  head.querySelector('#clr')?.addEventListener('click', () => { setCompare([]); route(); });
  if (!ps.length) {
    main.insertAdjacentHTML('beforeend', '<p class="empty">Add up to four programs here, from the program table (checkboxes) or from any program page.</p>');
    return;
  }
  const ys = ps.map(p => p.year_effective).filter(Boolean), span = ys.length ? Math.max(...ys) - Math.min(...ys) : 0;
  if (span >= 2 || ps.some(isEstimated)) {
    main.insertAdjacentHTML('beforeend', `<p class="flag">These listings report data from ${Math.min(...ys)} to ${Math.max(...ys)}${ps.some(isEstimated) ? ', and at least one year is estimated from its update date' : ''}. Numbers from different years aren’t directly comparable, especially salaries and match counts.</p>`);
  }
  const t = document.createElement('table'); t.className = 'cmp';
  const cell = html => ps.map(() => '').map((_, i) => `<td>${html(ps[i], i)}</td>`).join('');
  t.innerHTML = `<thead><tr><th></th>${ps.map((p, i) => `<th class="cmphead"><span class="letter c${i}">${LETTERS[i]}</span>
      <a href="#/program/${p.rid}">${esc(p.name)}</a><span class="ploc">${esc(p.city)}, ${p.state_province}</span>${yearChip(p, true)}
      <button class="link" data-rm="${p.rid}">Remove</button></th>`).join('')}<th class="rbh">Among ${peers.length} programs</th></tr></thead>`;
  const tb = document.createElement('tbody'); t.appendChild(tb);
  const section = title => tb.insertAdjacentHTML('beforeend', `<tr class="sechead"><th colspan="${ps.length + 2}">${title}</th></tr>`);
  const numRow = m => {
    const tr = document.createElement('tr');
    const vs = ps.map(p => p[m.key]);
    if (vs.every(v => v == null)) return;
    tr.innerHTML = `<th>${esc(m.label)}${m.desc ? `<span class="rdesc">${esc(m.desc)}</span>` : ''}</th>${ps.map((p, i) => `<td class="num">${m.fmt(vs[i])}</td>`).join('')}<td class="rb"></td>`;
    tr.querySelector('.rb').appendChild(rangeBar({ vals: vals(peers, m.key), marks: ps.map((p, i) => ({ v: vs[i], cls: 'c' + i, name: LETTERS[i] + ' · ' + p.name })), format: m.fmt, width: 240 }));
    tb.appendChild(tr);
  };
  for (const g of GROUPS) {
    section(g.title);
    g.metrics.forEach(numRow);
    if (g.id === 'outcomes') tb.insertAdjacentHTML('beforeend', `<tr><th>Where graduates go</th>${cell(p => '')}<td></td></tr>`);
    if (g.id === 'salary') tb.insertAdjacentHTML('beforeend', `<tr><th>Moonlighting</th>${cell(p => esc(p.q13_moonlighting_permitted || '—'))}<td></td></tr>`);
    if (g.id === 'faculty') tb.insertAdjacentHTML('beforeend', `<tr><th>Fellowships</th>${cell(p => FELLOWSHIPS.filter(([k]) => p['fellow_' + k]).map(([, l]) => `<span class="tag on">${l}</span>`).join(' ') || '—')}<td></td></tr>`);
  }
  section('Training');
  [['Night float, PGY-1', p => yn(p.q9_pg_1)], ['Elective rotation', p => yn(p.q7_is_a_resident_elective_rotation_offered)],
   ['Global health option', p => yn(p.q7_option_for_global_health)], ['Research project', p => esc(p.q11_research_project_required || '—')],
   ['Min. Step 2 to interview', p => esc(p.q27_usmle_step_ii || '—')], ['Student electives', p => yn(p.q28_medical_student_electives_available)],
   ['Hospitals', p => (p.hospitals_json || []).map(h => `${esc(h.name)}${h.pct != null ? ` (${h.pct}%)` : ''}`).join('<br>') || '—'],
  ].forEach(([l, f]) => tb.insertAdjacentHTML('beforeend', `<tr><th>${l}</th>${cell(f)}<td></td></tr>`));
  const wrap = document.createElement('div'); wrap.className = 'tablewrap'; wrap.appendChild(t); main.appendChild(wrap);
  // graduate destination bars
  const destRow = [...tb.querySelectorAll('tr')].find(r => r.firstElementChild?.textContent === 'Where graduates go');
  if (destRow) ps.forEach((p, i) => destRow.children[i + 1].appendChild(partBar(DESTINATIONS.map(([k, l]) => ({ v: p[k], label: l })), { width: 180 })));
  t.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { setCompare(state.compare.filter(r => r !== +b.dataset.rm)); route(); });
}

// ---------------------------------------------------------------- boot
fetch('programs.json').then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(data => {
  state.all = data; state.byRid = new Map(data.map(p => [p.rid, p]));
  state.compare = state.compare.filter(r => state.byRid.has(r));
  initShell(); route();
}).catch(err => {
  main.innerHTML = `<p class="empty">Couldn’t load programs (${esc(err.message)}). If you’re running it locally, start it with <code>python3 app/server.py</code> from the project folder.</p>`;
});
