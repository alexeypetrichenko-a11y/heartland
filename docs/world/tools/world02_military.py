#!/usr/bin/env python3
"""
WORLD-02 (D3) abstract military forces from open defence expenditure (analysis tool, standard library only).

Reads docs/world/data/world02-defence-cofog-2023.json (OECD / Eurostat COFOG division 02 "Defence" by
transaction, total-economy compensation and employees) and docs/world/data/world02-ppp-fx-2023.json
(World Bank PPP factors), and prints two transparent sizing rules side by side:

  Rule W (wage-equivalent personnel):
      w_c  = compensation of employees, whole economy / employees, whole economy   (national average pay)
      PE_c = defence compensation of employees (COFOG 02, D1) / w_c                (personnel equivalents)
      divisions_c = round(PE_c / X)
  Rule P (PPP spending):
      S_c  = defence total expenditure (COFOG 02) / PPP factor                      (international $)
      divisions_c = round(S_c / Y)

X and Y are ASSUMPTIONS (game scale), not data; they are set so that both rules give the same total
over the countries with data. Everything else is sourced. Türkiye has no open COFOG-by-transaction
data (Eurostat and OECD Table 11 both exclude it), so it is reported as a gap, not estimated.

Run from the repository root:  python3 docs/world/tools/world02_military.py
Nothing here is a scenario asset; division counts are illustrative.
"""
import json, os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
DATA = os.path.join(ROOT, 'docs', 'world', 'data')
d = json.load(open(os.path.join(DATA, 'world02-defence-cofog-2023.json'), encoding='utf-8'))
ppp = json.load(open(os.path.join(DATA, 'world02-ppp-fx-2023.json'), encoding='utf-8'))['world_bank_wdi']['series']
PPP, GDP_LCU = ppp['PA.NUS.PPP']['values'], ppp['NY.GDP.MKTP.CN']['values']
FX = {c: ppp['NY.GDP.MKTP.CN']['values'][c] / ppp['NY.GDP.MKTP.CD']['values'][c] for c in PPP}

X_PERSONNEL_PER_DIVISION = 25.0   # assumption: thousand personnel equivalents per game division
NAMES = {'FRA': 'France', 'DEU': 'Germany', 'GBR': 'United Kingdom', 'ITA': 'Italy', 'POL': 'Poland', 'TUR': 'Türkiye'}

rows = []
for c in ['FRA', 'DEU', 'GBR', 'ITA', 'POL', 'TUR']:
    g = d['defence_cofog_GF02']['values'].get(c)
    d1_all = d['compensation_of_employees_total_economy_D1']['values'].get(c)
    emp = d['employees_total_economy']['values'].get(c)
    if not g or not d1_all or not emp:
        rows.append({'c': c, 'gap': [k for k, v in (('defence by transaction', g), ('employees', emp)) if not v]})
        continue
    wage = d1_all / emp                      # million LCU per thousand employees = thousand LCU per employee
    pe = g['D1'] / wage                      # thousand personnel equivalents
    spend_ppp = g['OTE'] / PPP[c] / 1e3      # billion international $
    spend_fx = g['OTE'] / FX[c] / 1e3        # billion US$ at market rates
    equip_ppp = (g['P2'] + g['P51G']) / PPP[c] / 1e3
    rows.append({'c': c, 'wage': wage, 'pe': pe, 'spend_ppp': spend_ppp, 'spend_fx': spend_fx, 'equip_ppp': equip_ppp,
                 'share_gdp': g['OTE'] / (GDP_LCU[c] / 1e6), 'mix': {k: g[k] / g['OTE'] for k in ('D1', 'P2', 'P51G')}})

have = [r for r in rows if 'gap' not in r]
total_pe = sum(r['pe'] for r in have)
total_ppp = sum(r['spend_ppp'] for r in have)
total_fx = sum(r['spend_fx'] for r in have)
y_per_division = total_ppp / (total_pe / X_PERSONNEL_PER_DIVISION)   # makes rule P total equal rule W total

print('2023 | Defence % GDP | Pay D1 / Purchases P2 / Investment P51G (% of defence) | Avg pay per employee (th. LCU) | '
      'Personnel equiv. (th.) | Spending bn intl$ (PPP) | Spending bn US$ (market) | Share: personnel / PPP / market | Divisions W / P / market')
for r in rows:
    if 'gap' in r:
        print(f"{NAMES[r['c']]:<15} | GAP: no open {', '.join(r['gap'])} for 2023 in Eurostat or OECD")
        continue
    w = round(r['pe'] / X_PERSONNEL_PER_DIVISION)
    p = round(r['spend_ppp'] / y_per_division)
    m = round(r['spend_fx'] / (total_fx / (total_pe / X_PERSONNEL_PER_DIVISION)))
    mix = r['mix']
    print(f"{NAMES[r['c']]:<15} | {r['share_gdp']:5.2%} | {mix['D1']:4.0%} / {mix['P2']:4.0%} / {mix['P51G']:4.0%} | {r['wage']:8.2f} | "
          f"{r['pe']:6.0f} | {r['spend_ppp']:6.1f} | {r['spend_fx']:6.1f} | "
          f"{r['pe'] / total_pe:5.1%} / {r['spend_ppp'] / total_ppp:5.1%} / {r['spend_fx'] / total_fx:5.1%} | {w} / {p} / {m}")
print(f"Assumptions: X = {X_PERSONNEL_PER_DIVISION:g} thousand personnel equivalents per division; Y = {y_per_division:.2f} bn intl$ per division "
      f"(chosen so rule P gives the same total, {round(total_pe / X_PERSONNEL_PER_DIVISION)} divisions, as rule W).")
