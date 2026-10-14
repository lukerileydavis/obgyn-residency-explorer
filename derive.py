"""Create the `programs_v` view: every column of `programs` plus derived fields.

A view (not new columns) so build_db.py / geocode.py can be re-run without losing anything;
re-run this after changing the formulas. Safe to run repeatedly.

Year fields
  year_effective  data_year when reported, else the year of last_updated
  year_source     'data_year' | 'last_updated' | NULL
Match fields (q26, "last year's match results"); NULL when an input is missing or zero
  interview_pct              interviews / applications
  match_rate                 matched / applications
  match_rate_interviewed     matched / interviews
  apps_per_position          applications / positions offered
  match_flag                 text when the q26 numbers are internally inconsistent
"""
import sqlite3, sys

DB = sys.argv[1] if len(sys.argv) > 1 else 'residency.db'

PROC = ['spontaneous_vaginal_deliveries', 'cesarean_deliveries', 'operative_vaginal_deliveries', 'obstetric_ultrasound']
GYN = ['abdominal_hysterectomy', 'vaginal_hysterectomy', 'laparoscopic_hysterectomy', 'incontinence_and_pelvic_floor_procedures',
       'cystoscopy', 'laparoscopy', 'hysteroscopy', 'abortions', 'transvaginal_ultrasound', 'surgery_for_invasive_cancer']
FAC = ['general_ob_gyn', 'female_pelvic_medicine_reconstructive_surgery_ur', 'gynecologic_oncology', 'maternal_fetal_medicine',
       'reproductive_endocrinology_infertility', 'family_planning', 'global_health', 'infectious_diseases',
       'minimally_invasive_surgery', 'pediatric_adolescent_gynecology', 'reproductive_genetics', 'other']
FELLOW = ['female_pelvic_medicine_reconstructive_surgery', 'family_planning', 'gynecologic_oncology', 'infectious_diseases',
          'maternal_fetal_medicine', 'reproductive_endocrinology_infertility', 'reproductive_genetics',
          'pediatric_adolescent_gynecology', 'minimally_invasive_surgery', 'other']
BENEFITS = ['health_insurance', 'disability', 'life_insurance', 'malpractice_insurance', 'matching_retirement', 'meals_on_call',
            'resident_counseling', 'book_fund', 'acog_jr_fellow_dues', 'education_travel_fund']


def ratio(n, d):
    return f'CASE WHEN {d} > 0 AND {n} IS NOT NULL THEN 1.0 * {n} / {d} END'


def total(cols):
    """Sum that is NULL only when every input is NULL (a blank cell in a filled-in table counts as 0)."""
    return f"CASE WHEN COALESCE({', '.join(cols)}) IS NOT NULL THEN {' + '.join(f'COALESCE({c},0)' for c in cols)} END"


apps, ivs, matched, offered = ('q26_number_of_applications', 'q26_number_of_interviews_granted',
                               'q26_positions_matched', 'q26_positions_offered')
# some programs leave a PGY "total" blank but fill female/male, so fall back to female + male per level
res_total = [f'COALESCE(q17_pg_{i}_total, CASE WHEN q17_pg_{i}_female IS NOT NULL OR q17_pg_{i}_male IS NOT NULL '
             f'THEN COALESCE(q17_pg_{i}_female,0) + COALESCE(q17_pg_{i}_male,0) END)' for i in range(1, 5)]
pg = lambda f: [f'q17_pg_{i}_{f}' for i in range(1, 5)]

SQL = f"""
CREATE VIEW programs_v AS
SELECT p.*,
  COALESCE(data_year, CAST(substr(last_updated, 1, 4) AS INTEGER)) AS year_effective,
  CASE WHEN data_year IS NOT NULL THEN 'data_year' WHEN last_updated IS NOT NULL THEN 'last_updated' END AS year_source,

  {ratio(ivs, apps)} AS interview_pct,
  {ratio(matched, apps)} AS match_rate,
  {ratio(matched, ivs)} AS match_rate_interviewed,
  {ratio(matched, offered)} AS fill_rate,
  {ratio(apps, offered)} AS apps_per_position,
  {ratio(ivs, offered)} AS interviews_per_position,
  CASE WHEN {matched} > {offered} THEN 'more positions matched than offered'
       WHEN {ivs} > {apps} THEN 'more interviews than applications'
       WHEN {matched} > {ivs} THEN 'more matched than interviewed' END AS match_flag,

  {total(res_total)} AS residents_total,
  {ratio(total(pg('female')), f"({total(pg('female'))} + {total(pg('male'))})")} AS residents_pct_female,
  {ratio(total(pg('img')), total(res_total))} AS residents_pct_img,
  {ratio(total(pg('do')), total(res_total))} AS residents_pct_do,

  q10_pg_1_salary AS salary_pgy1,
  (COALESCE(q10_pg_1_salary,0)+COALESCE(q10_pg_2_salary,0)+COALESCE(q10_pg_3_salary,0)+COALESCE(q10_pg_4_salary,0))
    / NULLIF((q10_pg_1_salary IS NOT NULL)+(q10_pg_2_salary IS NOT NULL)+(q10_pg_3_salary IS NOT NULL)+(q10_pg_4_salary IS NOT NULL), 0) AS salary_avg,
  q10_pg_1_vacation AS vacation_pgy1_weeks,

  {total(['q25_' + c for c in PROC])} AS proc_ob_total,
  {total(['q25_' + c for c in GYN])} AS proc_gyn_total,
  {total(['q25_' + c for c in ('abdominal_hysterectomy', 'vaginal_hysterectomy', 'laparoscopic_hysterectomy')])} AS proc_hysterectomy_total,

  {total(['q22_' + c for c in FAC])} AS faculty_md_total,
  {' + '.join(f'(COALESCE(q22_{c},0) > 0)' for c in FAC if c not in ('general_ob_gyn', 'other'))} AS faculty_subspecialties_covered,
  {' + '.join(f'COALESCE(fellow_{c},0)' for c in FELLOW)} AS fellowships_offered,
  {' + '.join(f'COALESCE(q14_{c},0)' for c in BENEFITS)} AS benefits_count,

  CASE WHEN q13_moonlighting_permitted IS NULL OR trim(q13_moonlighting_permitted) = '' THEN NULL
       WHEN lower(q13_moonlighting_permitted) LIKE 'no%' OR lower(q13_moonlighting_permitted) = 'n'
         OR lower(q13_moonlighting_permitted) LIKE 'not %' OR lower(q13_moonlighting_permitted) LIKE 'external - no%' THEN 'no'
       WHEN lower(q13_moonlighting_permitted) = 'yes' THEN 'yes'
       ELSE 'limited' END AS moonlighting
FROM programs p
"""

if __name__ == '__main__':
    con = sqlite3.connect(DB)
    con.execute('DROP VIEW IF EXISTS programs_v')
    con.execute(SQL)
    con.commit()
    n, flagged = con.execute('select count(*), count(match_flag) from programs_v').fetchone()
    print(f'programs_v: {n} rows, {flagged} with a match_flag')
