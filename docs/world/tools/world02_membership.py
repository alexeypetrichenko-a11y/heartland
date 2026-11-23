#!/usr/bin/env python3
"""
WORLD-02 draft economic membership (analysis tool, standard library only).

Assigns every one of the 258 Natural Earth admin-0 entities to exactly ONE economic representation:
  playable  - one of the six playable countries (regional zones)
  simulated - a simplified neighbour/partner country (one national zone)
  bloc:<ID> - a rest-of-world bloc (one aggregate zone)
  none      - no economic representation (uninhabited or no meaningful economy)
Every entity stays visible on the globe whatever its economic representation. Because the mapping is
a partition (each entity exactly once), no country's population or output can be counted twice.

Run from the repository root: python3 docs/world/tools/world02_membership.py
Writes docs/world/data/world02-economic-membership.csv.
"""
import csv, json, os
from collections import Counter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
catalog = json.load(open(os.path.join(ROOT, 'public', 'geography', 'natural-earth-5.1.1', 'countries.json'), encoding='utf-8'))
items = catalog['countries'] if isinstance(catalog, dict) else catalog

PLAYABLE = {'FRA', 'DEU', 'GBR', 'ITA', 'POL', 'TUR'}
SIMULATED = {'IRL', 'ESP', 'NLD', 'BEL', 'CHE', 'AUT', 'CZE', 'NOR', 'GRC', 'BGR'}
BLOCS = {
    'EUR': 'Rest of Europe',
    'EEC': 'Eastern Europe and Central Asia',
    'MEA': 'Middle East and Africa',
    'AME': 'Americas',
    'APA': 'Asia-Pacific',
}
EEC = {'RUS', 'UKR', 'BLR', 'MDA', 'GEO', 'ARM', 'AZE', 'KAZ', 'UZB', 'TKM', 'KGZ', 'TJK'}
# Explicit assignments that geography alone would get wrong or that need a recorded reason.
OVERRIDES = {
    'CYP': ('bloc:EUR', 'EU member state; Natural Earth places it in Western Asia'),
    'CYN': ('bloc:EUR', 'Northern Cyprus: see WORLD-02-TERRITORIES.md; economically grouped with Cyprus region, no ownership implied'),
    'CNM': ('none', 'UN buffer zone in Cyprus'),
    'ESB': ('bloc:EUR', 'UK Sovereign Base Area (Dhekelia); not part of UK provinces'),
    'WSB': ('bloc:EUR', 'UK Sovereign Base Area (Akrotiri); not part of UK provinces'),
    'GRL': ('bloc:EUR', 'Greenland (Kingdom of Denmark); grouped with Europe by political association'),
    'GIB': ('bloc:EUR', 'Gibraltar: British Overseas Territory claimed by Spain; not part of UK provinces'),
    'IMN': ('bloc:EUR', 'Crown dependency; not part of UK statistics (ITL)'),
    'JEY': ('bloc:EUR', 'Crown dependency; not part of UK statistics (ITL)'),
    'GGY': ('bloc:EUR', 'Crown dependency; not part of UK statistics (ITL)'),
    'ATA': ('none', 'Antarctica (Antarctic Treaty)'),
    'ATF': ('none', 'French Southern and Antarctic Lands: no permanent population'),
    'IOT': ('none', 'British Indian Ocean Territory: no permanent civilian population; see territories'),
    'SGS': ('none', 'South Georgia and the South Sandwich Islands: no permanent population'),
    'HMD': ('none', 'Heard Island and McDonald Islands: uninhabited'),
    'CLP': ('none', 'Clipperton Island: uninhabited'),
    'BJN': ('none', 'Bajo Nuevo Bank: uninhabited, disputed'),
    'SER': ('none', 'Serranilla Bank: uninhabited, disputed'),
    'SCR': ('none', 'Scarborough Reef: uninhabited, disputed'),
    'SPI': ('none', 'Southern Patagonian Ice Field: uninhabited, under survey'),
    'BRT': ('none', 'Bir Tawil: uninhabited, unclaimed'),
    'KAS': ('none', 'Siachen Glacier: disputed, no civilian economy'),
    'IOA': ('none', 'Indian Ocean Territories (Australia)'),
    'ATC': ('none', 'Ashmore and Cartier Islands: uninhabited'),
    'CSI': ('none', 'Coral Sea Islands: uninhabited'),
    'PGA': ('none', 'Spratly Islands: disputed, no civilian economy'),
    'USG': ('none', 'Guantanamo Bay Naval Base'),
    'IRN': ('bloc:MEA', 'Iran: Natural Earth subregion Southern Asia; grouped with the Middle East (borders Türkiye)'),
    'KAB': ('bloc:EEC', 'Baikonur Cosmodrome lease area (Kazakhstan)'),
}


def assign(e):
    s = e['source']
    code = s['ADM0_A3']
    if code in PLAYABLE:
        return 'playable', code, ''
    if code in SIMULATED:
        return 'simulated', code, ''
    if code in OVERRIDES:
        rep, note = OVERRIDES[code]
        return rep.split(':')[0], (rep.split(':')[1] if ':' in rep else ''), note
    if code in EEC:
        return 'bloc', 'EEC', ''
    cont, sub = e.get('continent'), e.get('subregion')
    if cont == 'Europe':
        return 'bloc', 'EUR', ''
    if cont == 'Africa' or sub == 'Western Asia' or (cont == 'Seven seas (open ocean)' and sub in ('Eastern Africa', 'Western Africa')):
        return 'bloc', 'MEA', ''
    if cont in ('North America', 'South America') or sub == 'Central America':
        return 'bloc', 'AME', ''
    if cont in ('Asia', 'Oceania') or sub in ('Southern Asia',):
        return 'bloc', 'APA', ''
    return 'UNASSIGNED', '', f'{cont}/{sub}'


rows = []
for e in items:
    s = e['source']
    tier, unit, note = assign(e)
    rows.append({'adm0_a3': s['ADM0_A3'], 'name': e['name'], 'sovereign': s['SOVEREIGNT'], 'ne_type': s['TYPE'],
                 'continent': e.get('continent'), 'subregion': e.get('subregion'), 'tier': tier,
                 'economic_unit': unit if tier in ('playable', 'simulated') else (f'bloc {unit}: {BLOCS[unit]}' if tier == 'bloc' else ''),
                 'note': note})
out = os.path.join(ROOT, 'docs', 'world', 'data', 'world02-economic-membership.csv')
with open(out, 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
    w.writeheader(); w.writerows(sorted(rows, key=lambda r: (r['tier'], r['economic_unit'], r['adm0_a3'])))
print(len(rows), 'entities;', Counter(r['tier'] for r in rows), Counter(r['economic_unit'] for r in rows if r['tier'] == 'bloc'))
for r in rows:
    if r['tier'] == 'UNASSIGNED':
        print('UNASSIGNED', r['adm0_a3'], r['name'], r['note'])
codes = [r['adm0_a3'] for r in rows]
assert len(codes) == len(set(codes)), 'an entity is listed twice'
