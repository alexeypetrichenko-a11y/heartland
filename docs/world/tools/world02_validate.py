#!/usr/bin/env python3
"""
WORLD-02 draft data validator (analysis tool, standard library only).

Checks the generated drafts independently of the scripts that wrote them:
  1. every Natural Earth admin-1 unit of the six playable countries appears exactly once in the
     crosswalk and is assigned to exactly one province, and every official statistical unit belongs
     to exactly one province;
  2. every Natural Earth admin-0 entity appears exactly once in the economic-membership partition;
  3. curated sea links refer to known provinces or simulated neighbours, are not duplicated and do not
     duplicate a land border;
  4. Corsica has no land neighbour (owner decision D1);
  5. within each playable country, the land graph plus the sea links proposed for version 1 is
     connected (every simulated province reachable), and the whole scenario (provinces, simulated
     neighbours, land borders with neighbours and the proposed sea links) is one connected graph.

Run from the repository root:  python3 docs/world/tools/world02_validate.py
Exits with status 1 and lists every failure if any check fails.
"""
import csv, json, os, sys
from collections import Counter, defaultdict

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
DATA = os.path.join(ROOT, 'docs', 'world', 'data')
NE = os.path.join(ROOT, 'public', 'geography', 'natural-earth-5.1.1')
PLAYABLE = ['FRA', 'DEU', 'GBR', 'ITA', 'POL', 'TUR']

# Land borders between simulated neighbours and playable provinces, as listed in WORLD-02-PROVINCES.md §4.1
# (curated; Natural Earth admin-1 geometry is only loaded for the six playable countries).
NEIGHBOUR_LAND = {
    'IRL': ['GBR-NIR'], 'ESP': ['FRA-NAQ', 'FRA-OCC'], 'NLD': ['DEU-NRW', 'DEU-NOR'],
    'BEL': ['FRA-NE', 'DEU-NRW', 'DEU-MIT'], 'CHE': ['FRA-ARA', 'FRA-NE', 'DEU-BW', 'ITA-NO'],
    'AUT': ['DEU-BY', 'ITA-NE'], 'CZE': ['DEU-BY', 'DEU-MO', 'POL-PDZ', 'POL-POL'], 'NOR': [],
    'GRC': ['TUR-MAR'], 'BGR': ['TUR-MAR'],
}

failures = []
def check(ok, message):
    if not ok:
        failures.append(message)

rows = list(csv.DictReader(open(os.path.join(DATA, 'world02-admin1-to-province.csv'), encoding='utf-8')))
provinces = json.load(open(os.path.join(DATA, 'world02-provinces.json'), encoding='utf-8'))
adjacency = json.load(open(os.path.join(DATA, 'world02-province-adjacency.json'), encoding='utf-8'))
sea = json.load(open(os.path.join(DATA, 'world02-sea-links.json'), encoding='utf-8'))
membership = list(csv.DictReader(open(os.path.join(DATA, 'world02-economic-membership.csv'), encoding='utf-8')))
province_ids = {p['id'] for p in provinces}
simulated = {p['id'] for p in provinces if p['simulated_in_v1']}

# 1. Crosswalk: exactly-once assignment against the repository's Natural Earth indexes.
expected_units = set()
for iso3 in PLAYABLE:
    index = json.load(open(os.path.join(NE, 'regions', f'{iso3}.index.json'), encoding='utf-8'))
    expected_units |= {r['id'] for r in index['regions']}
seen = Counter(r['ne_admin1_id'] for r in rows)
check(set(seen) == expected_units, f'crosswalk units differ from Natural Earth: missing {sorted(expected_units - set(seen))[:5]}, extra {sorted(set(seen) - expected_units)[:5]}')
check(all(n == 1 for n in seen.values()), f'units listed more than once: {[u for u, n in seen.items() if n > 1][:5]}')
check(all(r['province_id'] in province_ids for r in rows), f'units without a valid province: {[r["ne_admin1_id"] for r in rows if r["province_id"] not in province_ids][:5]}')
stat_owner = defaultdict(list)
for p in provinces:
    for unit in p['statistical_units']:
        stat_owner[unit].append(p['id'])
check(all(len(v) == 1 for v in stat_owner.values()), f'statistical units in several provinces: {[u for u, v in stat_owner.items() if len(v) > 1]}')
for p in provinces:
    members = sum(1 for r in rows if r['province_id'] == p['id'])
    check(members == p['admin1_members'] and members > 0, f'{p["id"]}: {members} crosswalk rows, {p["admin1_members"]} declared')

# 2. Membership partition: every admin-0 entity exactly once.
countries = json.load(open(os.path.join(NE, 'countries.json'), encoding='utf-8'))['countries']
entity_ids = Counter(r['adm0_a3'] for r in membership)
check(len(membership) == len(countries) and len(entity_ids) == len(countries), f'membership has {len(membership)} rows for {len(countries)} entities')
check(all(n == 1 for n in entity_ids.values()), 'an entity appears more than once in the membership partition')
roles = Counter(r['tier'] for r in membership)
check(roles.get('playable') == 6, f'{roles.get("playable")} playable countries, expected 6')
neighbours = {r['adm0_a3'] for r in membership if r['tier'] == 'simulated'}
check(neighbours == set(NEIGHBOUR_LAND), f'simulated neighbours {sorted(neighbours)} differ from {sorted(NEIGHBOUR_LAND)}')

# 3. Sea links.
nodes = simulated | neighbours
pairs = Counter(tuple(sorted((l['a'], l['b']))) for l in sea)
check(all(n == 1 for n in pairs.values()), f'duplicated sea links: {[p for p, n in pairs.items() if n > 1]}')
for l in sea:
    check(l['a'] in nodes and l['b'] in nodes, f'sea link {l["a"]}–{l["b"]} refers to an unknown node')
    check(l['b'] not in adjacency.get(l['a'], {}), f'sea link {l["a"]}–{l["b"]} duplicates a land border')
    check(l['proposal'] in ('include', 'candidate'), f'sea link {l["a"]}–{l["b"]} has proposal {l["proposal"]}')

# 4. Corsica.
check('FRA-COR' in simulated, 'FRA-COR is missing or not simulated')
check(not adjacency.get('FRA-COR'), f'FRA-COR has land neighbours: {adjacency.get("FRA-COR")}')

# 5. Connectivity with land borders plus the proposed sea links.
graph = defaultdict(set)
for a, others in adjacency.items():
    for b in others:
        if a in simulated and b in simulated:
            graph[a].add(b); graph[b].add(a)
for n, provs in NEIGHBOUR_LAND.items():
    for p in provs:
        graph[n].add(p); graph[p].add(n)
included = [l for l in sea if l['proposal'] == 'include']
for l in included:
    graph[l['a']].add(l['b']); graph[l['b']].add(l['a'])

def component(start, allowed):
    seen_nodes, stack = set(), [start]
    while stack:
        cur = stack.pop()
        if cur in seen_nodes:
            continue
        seen_nodes.add(cur)
        stack += [n for n in graph[cur] if n in allowed and n not in seen_nodes]
    return seen_nodes

country_of = {p['id']: p['country'] for p in provinces}
for iso3 in PLAYABLE:
    ids = {p for p in simulated if country_of[p] == iso3}
    reach = component(next(iter(sorted(ids))), ids)
    check(reach == ids, f'{iso3}: not connected by land and proposed sea links; unreachable {sorted(ids - reach)}')
whole = component('FRA-IDF', nodes)
check(whole == nodes, f'scenario graph not connected; unreachable {sorted(nodes - whole)}')

land_edges = len({tuple(sorted((a, b))) for a, v in adjacency.items() for b in v if a in simulated and b in simulated})
neighbour_edges = sum(len(v) for v in NEIGHBOUR_LAND.values())
print(f'crosswalk: {len(rows)} units, each once; {len(stat_owner)} statistical units, each in one province')
print(f'provinces: {len(simulated)} simulated ' + ', '.join(f'{c} {sum(1 for p in simulated if country_of[p] == c)}' for c in PLAYABLE)
      + f'; not simulated: {sorted(province_ids - simulated)}')
print(f'membership: {len(membership)} entities, each once; ' + ', '.join(f'{k} {v}' for k, v in sorted(roles.items())))
print(f'links: {land_edges} province land borders, {neighbour_edges} neighbour land borders, '
      f'{len(included)} sea/fixed links proposed (+{len(sea) - len(included)} candidates)')
blocs = {r['economic_unit'] for r in membership if r['tier'] == 'bloc'}
print(f'zones: {len(simulated)} provinces + {len(neighbours)} neighbours + {len(blocs)} blocs = {len(simulated) + len(neighbours) + len(blocs)}')
if failures:
    print(f'FAILED ({len(failures)}):')
    for f in failures:
        print('  -', f)
    sys.exit(1)
print('all checks passed')
