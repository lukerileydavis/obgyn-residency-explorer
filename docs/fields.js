// Field metadata: labels, formats and grouping for every metric the UI shows.

export const fmt = {
  int: v => v == null ? '—' : Math.round(v).toLocaleString(),
  dec1: v => v == null ? '—' : (+v).toFixed(1),
  pct: v => v == null ? '—' : (v * 100).toFixed(v < 0.1 ? 1 : 0) + '%',
  pct1: v => v == null ? '—' : (v * 100).toFixed(1) + '%',
  pct100: v => v == null ? '—' : Math.round(v) + '%',
  money: v => v == null ? '—' : '$' + Math.round(v).toLocaleString(),
  moneyk: v => v == null ? '—' : '$' + (v / 1000).toFixed(1) + 'k',
  weeks: v => v == null ? '—' : (+v) + ' wk',
};

const M = (key, label, f, extra = {}) => ({ key, label, fmt: f, ...extra });

export const PROC_OB = [
  ['spontaneous_vaginal_deliveries', 'Spontaneous vaginal deliveries'],
  ['cesarean_deliveries', 'Cesarean deliveries'],
  ['operative_vaginal_deliveries', 'Operative vaginal deliveries'],
  ['obstetric_ultrasound', 'Obstetric ultrasound'],
];
export const PROC_GYN = [
  ['abdominal_hysterectomy', 'Abdominal hysterectomy'],
  ['vaginal_hysterectomy', 'Vaginal hysterectomy'],
  ['laparoscopic_hysterectomy', 'Laparoscopic hysterectomy'],
  ['incontinence_and_pelvic_floor_procedures', 'Incontinence & pelvic floor'],
  ['cystoscopy', 'Cystoscopy'],
  ['laparoscopy', 'Laparoscopy'],
  ['hysteroscopy', 'Hysteroscopy'],
  ['abortions', 'Abortions'],
  ['transvaginal_ultrasound', 'Transvaginal ultrasound'],
  ['surgery_for_invasive_cancer', 'Surgery for invasive cancer'],
];
export const FACULTY = [
  ['general_ob_gyn', 'General Ob/Gyn'],
  ['maternal_fetal_medicine', 'Maternal-fetal medicine'],
  ['gynecologic_oncology', 'Gynecologic oncology'],
  ['female_pelvic_medicine_reconstructive_surgery_ur', 'Urogynecology (FPMRS)'],
  ['reproductive_endocrinology_infertility', 'REI'],
  ['family_planning', 'Complex family planning'],
  ['minimally_invasive_surgery', 'Minimally invasive surgery'],
  ['pediatric_adolescent_gynecology', 'Pediatric & adolescent gyn'],
  ['global_health', 'Global health'],
  ['infectious_diseases', 'Infectious diseases'],
  ['reproductive_genetics', 'Reproductive genetics'],
  ['other', 'Other MD'],
  ['phd', 'PhD faculty'],
];
export const FELLOWSHIPS = [
  ['maternal_fetal_medicine', 'MFM'],
  ['gynecologic_oncology', 'Gyn onc'],
  ['female_pelvic_medicine_reconstructive_surgery', 'Urogyn'],
  ['reproductive_endocrinology_infertility', 'REI'],
  ['family_planning', 'Family planning'],
  ['minimally_invasive_surgery', 'MIGS'],
  ['pediatric_adolescent_gynecology', 'PAG'],
  ['infectious_diseases', 'ID'],
  ['reproductive_genetics', 'Repro genetics'],
  ['other', 'Other'],
];
export const BENEFITS = [
  ['health_insurance', 'Health insurance'], ['disability', 'Disability'], ['life_insurance', 'Life insurance'],
  ['malpractice_insurance', 'Malpractice'], ['matching_retirement', 'Matching retirement'], ['meals_on_call', 'Meals on call'],
  ['resident_counseling', 'Resident counseling'], ['book_fund', 'Book fund'], ['acog_jr_fellow_dues', 'ACOG dues'],
  ['education_travel_fund', 'Education travel fund'],
];
export const DESTINATIONS = [
  ['q20_pct_private_practice', 'Private practice'],
  ['q20_pct_academic', 'Academic generalist'],
  ['q20_pct_fellowship', 'Fellowship'],
  ['q20_pct_other', 'Other'],
];

// Groups drive the distributions page, scatter selects, and the compare table.
export const GROUPS = [
  { id: 'match', title: 'Match', note: 'Last year’s match results as reported by the program (survey question 26).', metrics: [
    M('interview_pct', 'Interview %', fmt.pct, { desc: 'Interviews granted ÷ applications' }),
    M('match_rate', 'Acceptance rate', fmt.pct1, { desc: 'Positions matched ÷ applications' }),
    M('match_rate_interviewed', 'Acceptance rate if interviewed', fmt.pct, { desc: 'Positions matched ÷ interviews granted' }),
    M('apps_per_position', 'Applications per position', fmt.int, { desc: 'Applications ÷ positions offered' }),
    M('q26_number_of_applications', 'Applications', fmt.int),
    M('q26_number_of_interviews_granted', 'Interviews granted', fmt.int),
    M('q26_positions_offered', 'Positions offered', fmt.int),
  ]},
  { id: 'residents', title: 'Current residents', note: 'Averages describe residents currently in the program, not last year’s applicants.', metrics: [
    M('avg_usmle_step2', 'Average Step 2 score', fmt.int),
    M('avg_usmle_step1', 'Average Step 1 score', fmt.int, { desc: 'Few programs report this since Step 1 went pass/fail' }),
    M('pct_aoa', 'AOA members', fmt.pct100),
    M('residents_total', 'Residents, all years', fmt.int),
    M('residents_pct_female', 'Female residents', fmt.pct),
    M('residents_pct_img', 'International graduates', fmt.pct),
    M('residents_pct_do', 'DO residents', fmt.pct),
  ]},
  { id: 'outcomes', title: 'Outcomes', metrics: [
    M('abog_first_attempt_pass_pct', 'ABOG written, first-attempt pass', fmt.pct100, { desc: 'Past three years' }),
    ...DESTINATIONS.map(([k, l]) => M(k, `Graduates → ${l.toLowerCase()}`, fmt.pct100, { desc: 'Typical % of graduates' })),
  ]},
  { id: 'salary', title: 'Salary & vacation', note: 'Salaries are in the dollars of each program’s data year and are not adjusted for inflation or cost of living.', metrics: [
    M('q10_pg_1_salary', 'PGY-1 salary', fmt.money),
    M('q10_pg_2_salary', 'PGY-2 salary', fmt.money),
    M('q10_pg_3_salary', 'PGY-3 salary', fmt.money),
    M('q10_pg_4_salary', 'PGY-4 salary', fmt.money),
    M('salary_avg', 'Average salary, PGY-1 to 4', fmt.money),
    M('q10_pg_1_vacation', 'PGY-1 paid vacation', fmt.weeks),
    M('benefits_count', 'Benefits offered (of 10)', fmt.int),
  ]},
  { id: 'procedures', title: 'Procedures', note: 'Program median for graduating residents as primary surgeon, total across four years (ACGME case logs).', metrics: [
    M('proc_ob_total', 'All tracked OB procedures', fmt.int),
    M('proc_gyn_total', 'All tracked GYN procedures', fmt.int),
    ...PROC_OB.map(([k, l]) => M('q25_' + k, l, fmt.int, { sub: 'OB' })),
    ...PROC_GYN.map(([k, l]) => M('q25_' + k, l, fmt.int, { sub: 'GYN' })),
  ]},
  { id: 'faculty', title: 'Faculty', note: 'Full-time faculty only, not part-time, volunteer, or clinical faculty.', metrics: [
    M('faculty_md_total', 'Full-time MD faculty', fmt.int),
    M('faculty_subspecialties_covered', 'Subspecialties with faculty (of 10)', fmt.int),
    ...FACULTY.map(([k, l]) => M('q22_' + k, l, fmt.int, { sub: 'faculty' })),
    M('fellowships_offered', 'Fellowships offered', fmt.int),
  ]},
];

export const METRICS = Object.fromEntries(GROUPS.flatMap(g => g.metrics.map(m => [m.key, { ...m, group: g.id }])));
