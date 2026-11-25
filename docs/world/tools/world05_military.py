#!/usr/bin/env python3
"""
WORLD-05 (offline, deterministic): Türkiye's Rule W input and a division-placement proposal for the 46 provinces.

Reads
  docs/world/data/world02-defence-cofog-2023.json   the five countries' COFOG 02 x D1 inputs (WORLD-02, unchanged)
  docs/world/data/world02-ppp-fx-2023.json           PPP factors (WORLD-02, unchanged) for the Rule P cross-check
  docs/world/data/world05-turkiye-inputs.json        Türkiye candidate inputs (world05_turkiye_inputs.py)
  scenarios/europe-2023/1.0.0-draft.2/scenario.json  provinces, populations, movement links, draft counts (read only)
and writes docs/world/data/world05-military-proposal.json. Prints a summary.

Division count (approved rule D3 = Rule W; the scale X is provisional, decision M-2):
  divisions = round(defence compensation of employees / (whole-economy compensation / employees) / X), X = 25,000.
  Türkiye uses three documented substitutions (decision M-3): central-government budget defence pay (personnel +
  state social security contributions) for COFOG 02 x D1; Labour Force Survey employees for national-accounts
  employees; and a Ministry source whose reuse licence is not verified (W5-L1).

Placement (proposal P-1; nothing here is gameplay):
  1. A country's core is the movement component (land movement links, scenario.json links.movement) holding most of
     its provinces. Provinces outside it are islands with no movement link; they receive no division, because a
     division placed there could never leave (sea links are not army paths, WORLD-02 S-1).
  2. Every core province receives one division, so no reachable province starts empty.
  3. The remaining divisions go by the largest-remainder method to weights population x (1 + B x frontier), where
     frontier = 1 for a province with a movement link to another playable country, B = 1 (P-1). P-0 sets B = 0.
     Ties: larger remainder, then larger population, then province id. Every division has the same manpower (X).
Run from the repository root:  python3 docs/world/tools/world05_military.py
"""
import json, os, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
DATA = os.path.join(ROOT, 'docs', 'world', 'data')
PKG = os.path.join(ROOT, 'scenarios', 'europe-2023', '1.0.0-draft.2', 'scenario.json')
OUT = os.path.join(DATA, 'world05-military-proposal.json')
X = 25.0                 # thousand personnel equivalents per division (provisional, decision M-2)
Y = 4.65                 # bn international $ per division, Rule P cross-check (WORLD-02 §7.2, kept fixed)
FRONTIER_BONUS = {'P-1': 1.0, 'P-0': 0.0}
ISO = {'fra': 'FRA', 'deu': 'DEU', 'gbr': 'GBR', 'ita': 'ITA', 'pol': 'POL', 'tur': 'TUR'}

load = lambda p: json.load(open(p, encoding='utf-8'))
w02 = load(os.path.join(DATA, 'world02-defence-cofog-2023.json'))
ppp = load(os.path.join(DATA, 'world02-ppp-fx-2023.json'))['world_bank_wdi']['series']['PA.NUS.PPP']['values']
tr = load(os.path.join(DATA, 'world05-turkiye-inputs.json'))
scen = load(PKG)

# ---- division counts --------------------------------------------------------------------------------------
counts = {}
for c, iso in ISO.items():
    if c == 'tur':
        e = tr['eurostat']; b = tr['muhasebat_central_budget_defence']['defence']
        gg = tr['muhasebat_general_government_gfs']['functions']['defence']
        wage = e['compensation_of_employees_D1']['value'] / e['employees_lfs_15plus']['value']    # thousand TRY
        pay = b['personnel'] + b['state_social_security_contributions']                          # million TRY
        pe = pay / wage                                                                           # thousand
        counts[c] = {'status': 'proposal (needs M-2, M-3 and licence decision W5-L1)',
                     'defence_pay_million_lcu': pay, 'average_pay_thousand_lcu': wage,
                     'personnel_equivalents': round(pe * 1000), 'divisions': round(pe / X),
                     'rule_p_cross_check': round(gg / ppp[iso] / 1e3 / Y),
                     'sources': ['world05-turkiye-inputs: muhasebat_central_budget_defence (NOT VERIFIED)',
                                 'world05-turkiye-inputs: eurostat nama_10_gdp D1, lfsa_eegan2 (verified)'],
                     'substitutions': ['central-government budget, cash basis, instead of general government COFOG 02 x D1 (ESA)',
                                       'Labour Force Survey employees instead of national-accounts employees',
                                       'defence total for Rule P from the general-government GFS functional table (COFOG 702)']}
    else:
        g = w02['defence_cofog_GF02']['values'][iso]
        wage = w02['compensation_of_employees_total_economy_D1']['values'][iso] / w02['employees_total_economy']['values'][iso]
        pe = g['D1'] / wage
        counts[c] = {'status': 'draft (draft.2, unchanged)', 'personnel_equivalents': round(pe * 1000),
                     'divisions': round(pe / X), 'rule_p_cross_check': round(g['OTE'] / ppp[iso] / 1e3 / Y)}
for c in ISO:
    if c != 'tur':
        draft = scen['military']['countries'][c]
        if (draft['divisions'], draft['personnel_equivalents']) != (counts[c]['divisions'], counts[c]['personnel_equivalents']):
            sys.exit(f'{c}: does not reproduce draft.2 ({draft}) -> {counts[c]}')

# ---- geography ----------------------------------------------------------------------------------------------
prov = [r for r in scen['regions'] if r['kind'] == 'province']
owner = {r['id']: r['ownerId'] for r in prov}
pop = {rid: z['population'] for rid, z in scen['economy']['regions'].items() if rid in owner}
name = {r['id']: r['name'] for r in prov}
adj = {p: set() for p in owner}
for e in scen['links']['movement']:
    adj[e['a']].add(e['b']); adj[e['b']].add(e['a'])
component = {}
for p in sorted(owner):
    if p in component:
        continue
    stack, comp = [p], set()
    while stack:
        x = stack.pop()
        if x not in comp:
            comp.add(x); stack.extend(adj[x] - comp)
    label = min(comp)
    for x in comp:
        component[x] = label
frontier = {p: sorted({owner[q] for q in adj[p] if owner[q] != owner[p]}) for p in owner}


def place(country, divisions, bonus):
    mine = sorted(p for p in owner if owner[p] == country)
    by_comp = {}
    for p in mine:
        by_comp.setdefault(component[p], []).append(p)
    core = set(max(by_comp.values(), key=lambda ps: (len(ps), sum(pop[x] for x in ps))))
    alloc = {p: 0 for p in mine}
    eligible = sorted(core)
    if divisions < len(eligible):
        sys.exit(f'{country}: fewer divisions than core provinces')
    for p in eligible:
        alloc[p] = 1
    rest = divisions - len(eligible)
    weight = {p: pop[p] * (1 + bonus * (1 if frontier[p] else 0)) for p in eligible}
    total = sum(weight.values())
    quota = {p: rest * weight[p] / total for p in eligible}
    for p in eligible:
        alloc[p] += int(quota[p])
    left = rest - sum(int(q) for q in quota.values())
    for p in sorted(eligible, key=lambda p: (-(quota[p] - int(quota[p])), -pop[p], p))[:left]:
        alloc[p] += 1
    return alloc, core


plans = {}
for variant, bonus in FRONTIER_BONUS.items():
    plan = {}
    for c in ISO:
        alloc, core = place(c, counts[c]['divisions'], bonus)
        for p, n in alloc.items():
            plan[p] = {'country': c, 'name': name[p], 'divisions': n, 'population_m': round(pop[p], 3),
                       'reachable': p in core, 'frontier_with': frontier[p],
                       'note': '' if p in core else 'no movement link: an island division could never leave'}
    plans[variant] = plan

# ---- balance indicators -------------------------------------------------------------------------------------
def borders(plan):
    pairs = {}
    for p in sorted(owner):
        for q in sorted(adj[p]):
            if owner[q] != owner[p] and p < q:
                key = '-'.join(sorted((owner[p], owner[q])))
                pairs.setdefault(key, []).append((p, q))
    out = {}
    for key, links in sorted(pairs.items()):
        a, b = key.split('-')
        side = lambda c: sorted({x for l in links for x in l if owner[x] == c})
        out[key] = {'links': [f'{p}|{q}' for p, q in links],
                    f'{a}_frontier_divisions': sum(plan[x]['divisions'] for x in side(a)),
                    f'{b}_frontier_divisions': sum(plan[x]['divisions'] for x in side(b)),
                    f'{a}_total': counts[a]['divisions'], f'{b}_total': counts[b]['divisions']}
    return out


comps = {}
for p, label in component.items():
    comps.setdefault(label, set()).add(p)
theatres = [{'provinces': len(ps), 'countries': sorted({owner[p] for p in ps}),
             'divisions': sum(counts[c]['divisions'] for c in sorted({owner[p] for p in ps})) if len({owner[p] for p in ps}) > 1 else None,
             'members': sorted(ps) if len(ps) <= 3 else None}
            for ps in sorted(comps.values(), key=lambda s: (-len(s), min(s)))]

out = {
    'note': 'WORLD-05 proposal, review only. Not a scenario package and not gameplay. Placement is illustrative.',
    'rule': {'count': 'Rule W (approved D3): round(defence pay / own average pay / X)', 'X_thousand_personnel_equivalents': X,
             'X_status': 'provisional, decision M-2', 'Y_bn_intl_dollars_rule_p': Y,
             'placement': 'P-1: one division per reachable province, remainder by population x (1 + frontier), largest remainder',
             'variants': {'P-1': 'frontier weight x2 (recommended)', 'P-0': 'population only'},
             'manpower_per_division': 'uniform, X x 1,000 personnel equivalents (divisions have manpower only)'},
    'counts': counts,
    'total_divisions': sum(v['divisions'] for v in counts.values()),
    'movement_theatres': theatres,
    'placement': plans,
    'frontiers': {v: borders(plans[v]) for v in plans},
}
with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(out, f, indent=1, ensure_ascii=False, sort_keys=True)
    f.write('\n')

print('Counts (Rule W, X = 25,000):', {c: v['divisions'] for c, v in counts.items()}, 'total', out['total_divisions'])
t = counts['tur']
print(f"Türkiye: pay {t['defence_pay_million_lcu']:,.0f} m TRY / avg pay {t['average_pay_thousand_lcu']:.2f} th TRY = "
      f"{t['personnel_equivalents']:,} PE -> {t['divisions']} divisions (Rule P cross-check {t['rule_p_cross_check']})")
print('Rule P cross-check:', {c: v['rule_p_cross_check'] for c, v in counts.items()})
for v in plans:
    print(f'\n{v}:')
    for c in ISO:
        row = ' '.join(f"{p.split('-')[1]}={plans[v][p]['divisions']}" for p in sorted(plans[v]) if plans[v][p]['country'] == c)
        print(f'  {c}: {row}')
    for k, b in out['frontiers'][v].items():
        print('  frontier', k, {kk: vv for kk, vv in b.items() if kk != 'links'})
print('\nTheatres:', [(th['provinces'], th['countries']) for th in theatres])
print(f'wrote {os.path.relpath(OUT, ROOT)}')
