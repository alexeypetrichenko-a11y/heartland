#!/usr/bin/env python3
"""
WORLD-02 draft province builder (analysis tool, standard library only).

Reads the repository's Natural Earth 5.1.1 admin-1 indexes and geometry chunks for the six playable
countries, assigns every admin-1 unit to an official statistical region (Eurostat NUTS 2024 for
FR, DE, IT, PL, TR; ONS ITL1 for the UK) and to a proposed province, attaches Eurostat population on
1 January 2025 where available, computes land adjacency from shared boundary vertices, and writes:

  docs/world/data/world02-admin1-to-province.csv   one row per Natural Earth admin-1 unit
  docs/world/data/world02-provinces.json           one entry per proposed province
  docs/world/data/world02-province-adjacency.json  land adjacency between provinces (incl. across borders)
  docs/world/data/world02-sea-links.json           curated sea and fixed links (not derived from geometry)

Check the outputs with:  python3 docs/world/tools/world02_validate.py

Run from the repository root:  python3 docs/world/tools/world02_provinces.py
Nothing here is a production scenario asset; all outputs are review drafts.
"""
import csv, json, os, re, unicodedata
from collections import defaultdict

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
NE = os.path.join(ROOT, 'public', 'geography', 'natural-earth-5.1.1')
OUT = os.path.join(ROOT, 'docs', 'world', 'data')
POP = json.load(open(os.path.join(OUT, 'world02-eurostat-nuts-population-2025.json'), encoding='utf-8'))
ONS = json.load(open(os.path.join(OUT, 'world02-ons-itl1-population-mid2025.json'), encoding='utf-8'))['itl1']

# ----------------------------------------------------------------------------------------------
# Proposed provinces: id -> (name, country, statistical units). Units are NUTS 2024 codes (EU, TR)
# or ITL1 codes (UK). A province is always a union of whole official statistical regions, so
# official data can be summed exactly.
PROVINCES = {
    # France: 13 metropolitan NUTS-1 regions grouped into 9 (Corsica on its own, owner decision D1);
    # overseas departments (FRY) kept separate and not simulated.
    'FRA-IDF': ('Île-de-France', 'FRA', ['FR1']),
    'FRA-NE': ('Nord-Est (Hauts-de-France, Grand Est)', 'FRA', ['FRE', 'FRF']),
    'FRA-OUE': ('Ouest (Normandie, Bretagne, Pays de la Loire)', 'FRA', ['FRD', 'FRH', 'FRG']),
    'FRA-CEN': ('Centre (Centre-Val de Loire, Bourgogne-Franche-Comté)', 'FRA', ['FRB', 'FRC']),
    'FRA-NAQ': ('Nouvelle-Aquitaine', 'FRA', ['FRI']),
    'FRA-OCC': ('Occitanie', 'FRA', ['FRJ']),
    'FRA-ARA': ('Auvergne-Rhône-Alpes', 'FRA', ['FRK']),
    'FRA-SE': ("Provence-Alpes-Côte d'Azur", 'FRA', ['FRL']),
    'FRA-COR': ('Corse', 'FRA', ['FRM']),
    'FRA-OM': ('Overseas departments (not simulated in v1)', 'FRA', ['FRY']),
    # Germany: 16 Länder (NUTS-1) grouped into 7.
    'DEU-NOR': ('Norddeutschland (Schleswig-Holstein, Hamburg, Bremen, Niedersachsen)', 'DEU', ['DEF', 'DE6', 'DE5', 'DE9']),
    'DEU-NRW': ('Nordrhein-Westfalen', 'DEU', ['DEA']),
    'DEU-MIT': ('Mitte-West (Hessen, Rheinland-Pfalz, Saarland)', 'DEU', ['DE7', 'DEB', 'DEC']),
    'DEU-BW': ('Baden-Württemberg', 'DEU', ['DE1']),
    'DEU-BY': ('Bayern', 'DEU', ['DE2']),
    'DEU-NO': ('Nordost (Berlin, Brandenburg, Mecklenburg-Vorpommern)', 'DEU', ['DE3', 'DE4', 'DE8']),
    'DEU-MO': ('Mitteldeutschland (Sachsen, Sachsen-Anhalt, Thüringen)', 'DEU', ['DED', 'DEE', 'DEG']),
    # United Kingdom: 12 ITL1 regions grouped into 8.
    'GBR-SCO': ('Scotland', 'GBR', ['TLM']),
    'GBR-NIR': ('Northern Ireland', 'GBR', ['TLN']),
    'GBR-WLS': ('Wales', 'GBR', ['TLL']),
    'GBR-NTH': ('North of England (North East, North West, Yorkshire and the Humber)', 'GBR', ['TLC', 'TLD', 'TLE']),
    'GBR-MID': ('Midlands (East Midlands, West Midlands)', 'GBR', ['TLF', 'TLG']),
    'GBR-LON': ('London', 'GBR', ['TLI']),
    'GBR-SE': ('South East and East of England', 'GBR', ['TLJ', 'TLH']),
    'GBR-SW': ('South West', 'GBR', ['TLK']),
    # Italy: 5 NUTS-1 regions; the Islands region is split into its two NUTS-2 islands.
    'ITA-NO': ('Nord-Ovest', 'ITA', ['ITC']),
    'ITA-NE': ('Nord-Est', 'ITA', ['ITH']),
    'ITA-CEN': ('Centro', 'ITA', ['ITI']),
    'ITA-SUD': ('Sud', 'ITA', ['ITF']),
    'ITA-SIC': ('Sicilia', 'ITA', ['ITG1']),
    'ITA-SAR': ('Sardegna', 'ITA', ['ITG2']),
    # Poland: the 7 NUTS-1 macroregions.
    'POL-MAZ': ('Makroregion województwo mazowieckie', 'POL', ['PL9']),
    'POL-POL': ('Makroregion południowy', 'POL', ['PL2']),
    'POL-PZA': ('Makroregion północno-zachodni', 'POL', ['PL4']),
    'POL-PDZ': ('Makroregion południowo-zachodni', 'POL', ['PL5']),
    'POL-PN': ('Makroregion północny', 'POL', ['PL6']),
    'POL-CEN': ('Makroregion centralny', 'POL', ['PL7']),
    'POL-WSC': ('Makroregion wschodni', 'POL', ['PL8']),
    # Türkiye: 12 NUTS-1 (İBBS-1) regions grouped into 9.
    'TUR-IST': ('İstanbul', 'TUR', ['TR1']),
    'TUR-MAR': ('Marmara (Batı Marmara, Doğu Marmara)', 'TUR', ['TR2', 'TR4']),
    'TUR-EGE': ('Ege', 'TUR', ['TR3']),
    'TUR-BAN': ('Batı Anadolu', 'TUR', ['TR5']),
    'TUR-AKD': ('Akdeniz', 'TUR', ['TR6']),
    'TUR-OAN': ('Orta Anadolu', 'TUR', ['TR7']),
    'TUR-KAR': ('Karadeniz (Batı Karadeniz, Doğu Karadeniz)', 'TUR', ['TR8', 'TR9']),
    'TUR-DOG': ('Doğu Anadolu (Kuzeydoğu, Ortadoğu Anadolu)', 'TUR', ['TRA', 'TRB']),
    'TUR-GDA': ('Güneydoğu Anadolu', 'TUR', ['TRC']),
}
NOT_SIMULATED = {'FRA-OM'}

# ----------------------------------------------------------------------------------------------
# Curated sea and fixed links (not derived from geometry, which only yields land borders).
# (province or neighbour A, B, kind, crossing, status). Status says how the link was checked;
# "to verify" means it rests on general knowledge and must be checked against operator timetables
# before a scenario is built. 'include' = proposed for version 1; 'candidate' = documented, not proposed.
# Neighbour codes (IRL, ESP, ...) are the simulated countries (one zone each).
SEA_LINKS = [
    # Corsica (D1): no land link to anything.
    ('FRA-COR', 'FRA-SE', 'ferry', 'Ajaccio/Bastia – Marseille, Toulon, Nice', 'operating 2026 (Corsica Linea, Corsica Ferries; checked via search 2026-11)', 'include'),
    ('FRA-COR', 'ITA-SAR', 'ferry', 'Bonifacio – Santa Teresa Gallura (Strait of Bonifacio)', 'operating 2026 (Moby / Ichnusa public-service route; checked via search 2026-11)', 'include'),
    ('FRA-COR', 'ITA-CEN', 'ferry', 'Bastia – Livorno (Tuscany)', 'operating 2026, year-round (Corsica Ferries, Moby; checked via search 2026-11)', 'include'),
    ('FRA-COR', 'ITA-NO', 'ferry', 'Bastia – Savona / Genoa (Liguria)', 'seasonal in 2026 (checked via search 2026-11)', 'candidate'),
    # United Kingdom
    ('GBR-SE', 'FRA-NE', 'fixed link', 'Channel Tunnel, Folkestone (Kent) – Coquelles (Pas-de-Calais)', 'fixed infrastructure', 'include'),
    ('GBR-SE', 'FRA-OUE', 'ferry', 'Portsmouth / Poole – Caen, Cherbourg, Le Havre, St-Malo', 'to verify', 'include'),
    ('GBR-NIR', 'GBR-SCO', 'ferry', 'Belfast / Larne – Cairnryan', 'operating 2026 (Stena Line, P&O; checked via search 2026-11)', 'include'),
    ('GBR-NIR', 'GBR-NTH', 'ferry', 'Belfast – Liverpool (North West England)', 'operating 2026 (Stena Line; checked via search 2026-11)', 'include'),
    ('GBR-WLS', 'IRL', 'ferry', 'Holyhead / Fishguard / Pembroke – Dublin / Rosslare', 'to verify', 'include'),
    ('GBR-NTH', 'NLD', 'ferry', 'Hull – Rotterdam', 'to verify', 'include'),
    ('GBR-SE', 'NLD', 'ferry', 'Harwich – Hook of Holland', 'to verify', 'candidate'),
    ('GBR-SCO', 'NOR', 'sea lane', 'North Sea energy and shipping (no passenger ferry assumed)', 'to verify', 'include'),
    # Italy
    ('ITA-SIC', 'ITA-SUD', 'ferry', 'Messina – Villa San Giovanni (Strait of Messina)', 'to verify', 'include'),
    ('ITA-SAR', 'ITA-CEN', 'ferry', 'Olbia / Cagliari – Civitavecchia, Livorno', 'to verify', 'include'),
    ('ITA-SAR', 'ITA-NO', 'ferry', 'Olbia / Porto Torres – Genoa', 'to verify', 'include'),
    ('ITA-SAR', 'ITA-SUD', 'ferry', 'Cagliari – Naples', 'to verify', 'candidate'),
    ('ITA-SIC', 'ITA-CEN', 'ferry', 'Palermo – Civitavecchia', 'to verify', 'candidate'),
    ('ITA-SUD', 'GRC', 'ferry', 'Bari / Brindisi – Patras / Igoumenitsa', 'to verify', 'include'),
    ('ITA-NO', 'ESP', 'ferry', 'Genoa / Savona – Barcelona', 'to verify', 'candidate'),
    # France
    ('FRA-OUE', 'IRL', 'ferry', 'Cherbourg / Roscoff – Rosslare / Cork', 'to verify', 'include'),
    # Türkiye
    ('TUR-EGE', 'GRC', 'ferry', 'Aegean coastal crossings (e.g. Çeşme – Chios)', 'to verify', 'include'),
]

# ITL1 labels (ONS); population for UK provinces is not taken from Eurostat (no UK data after 2019).
ITL1 = {'TLC': 'North East', 'TLD': 'North West', 'TLE': 'Yorkshire and The Humber', 'TLF': 'East Midlands',
        'TLG': 'West Midlands', 'TLH': 'East of England', 'TLI': 'London', 'TLJ': 'South East', 'TLK': 'South West',
        'TLL': 'Wales', 'TLM': 'Scotland', 'TLN': 'Northern Ireland'}
# Natural Earth GBR `region` attribute (older NUTS-2010-style names) -> ITL1. Scotland, Wales and
# Northern Ireland are assigned by the `geonunit` field instead, because names such as "North Eastern"
# (Scotland) and "North East" (England) are easily confused.
GBR_REGION = {'North East': 'TLC', 'North West': 'TLD', 'Yorkshire and the Humber': 'TLE', 'East Midlands': 'TLF',
              'West Midlands': 'TLG', 'East': 'TLH', 'Greater London': 'TLI', 'South East': 'TLJ', 'South West': 'TLK'}
GBR_GEOUNIT = {'Scotland': 'TLM', 'Wales': 'TLL', 'Northern Ireland': 'TLN'}
DEU_ISO = {'DE-BW': 'DE1', 'DE-BY': 'DE2', 'DE-BE': 'DE3', 'DE-BB': 'DE4', 'DE-HB': 'DE5', 'DE-HH': 'DE6', 'DE-HE': 'DE7',
           'DE-MV': 'DE8', 'DE-NI': 'DE9', 'DE-NW': 'DEA', 'DE-RP': 'DEB', 'DE-SL': 'DEC', 'DE-SN': 'DED', 'DE-ST': 'DEE',
           'DE-SH': 'DEF', 'DE-TH': 'DEG'}
POL_ISO = {'PL-MA': 'PL21', 'PL-SL': 'PL22', 'PL-WP': 'PL41', 'PL-ZP': 'PL42', 'PL-LB': 'PL43', 'PL-DS': 'PL51',
           'PL-OP': 'PL52', 'PL-KP': 'PL61', 'PL-WN': 'PL62', 'PL-PM': 'PL63', 'PL-LD': 'PL71', 'PL-SK': 'PL72',
           'PL-LU': 'PL81', 'PL-PK': 'PL82', 'PL-PD': 'PL84', 'PL-MZ': 'PL9'}
ITA_REGION = {'Piemonte': 'ITC1', "Valle d'Aosta": 'ITC2', 'Liguria': 'ITC3', 'Lombardia': 'ITC4', 'Abruzzo': 'ITF1',
              'Molise': 'ITF2', 'Campania': 'ITF3', 'Apulia': 'ITF4', 'Basilicata': 'ITF5', 'Calabria': 'ITF6',
              'Sicily': 'ITG1', 'Sardegna': 'ITG2', 'Trentino-Alto Adige': 'ITH1+ITH2', 'Veneto': 'ITH3',
              'Friuli-Venezia Giulia': 'ITH4', 'Emilia-Romagna': 'ITH5', 'Toscana': 'ITI1', 'Umbria': 'ITI2',
              'Marche': 'ITI3', 'Lazio': 'ITI4'}
FRA_REGION = {'Île-de-France': 'FR1', 'Centre-Val de Loire': 'FRB', 'Bourgogne-Franche-Comté': 'FRC', 'Normandie': 'FRD',
              'Hauts-de-France': 'FRE', 'Grand Est': 'FRF', 'Pays de la Loire': 'FRG', 'Bretagne': 'FRH',
              'Nouvelle-Aquitaine': 'FRI', 'Occitanie': 'FRJ', 'Auvergne-Rhône-Alpes': 'FRK',
              "Provence-Alpes-Côte-d'Azur": 'FRL', 'Corse': 'FRM', 'Guadeloupe': 'FRY', 'Martinique': 'FRY',
              'Guyane française': 'FRY', 'Réunion': 'FRY', 'Mayotte': 'FRY'}


# Natural Earth spellings that differ from the official name (recorded as flags, never silently corrected).
NE_NAME_ALIASES = {'TUR': {'Zinguldak': 'Zonguldak', 'Kinkkale': 'Kırıkkale', 'K. Maras': 'Kahramanmaraş'}}


def norm(text):
    text = (text or '').replace('ı', 'i').replace('İ', 'I')
    text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]', '', text)


def nuts3_labels(prefix):
    return {norm(v['label']): code for code, v in POP.items() if code.startswith(prefix) and v['level'] == 'nuts3'}


def province_of(unit):
    for pid, (_, _, units) in PROVINCES.items():
        for u in units:
            if unit == u or unit.startswith(u):
                return pid
    return None


rows = []
geometry = {}
for iso3 in ['FRA', 'DEU', 'GBR', 'ITA', 'POL', 'TUR']:
    index = json.load(open(os.path.join(NE, 'regions', f'{iso3}.index.json'), encoding='utf-8'))['regions']
    labels3 = nuts3_labels({'FRA': 'FR', 'ITA': 'IT', 'TUR': 'TR'}.get(iso3, '##'))
    for r in index:
        s = r['source']
        unit, method, flags = None, '', []
        if s.get('gadm_level') not in (1, None):
            flags.append(f"NE gadm_level={s.get('gadm_level')}")
        if iso3 == 'FRA':
            unit = labels3.get(norm(r['name']))
            method = 'NUTS-3 name match'
            if not unit:
                unit, method = FRA_REGION.get(s.get('region')), 'NE region attribute -> NUTS-1'
                flags.append('department name not matched to NUTS-3 (NE spelling); assigned by region')
            if s.get('type') == 'Overseas département':
                flags.append('overseas department (FRY)')
        elif iso3 == 'TUR':
            alias = NE_NAME_ALIASES['TUR'].get(r['name'])
            unit = labels3.get(norm(alias or r['name']))
            method = 'NUTS-3 (province) name match'
            if alias:
                method += ' via alias'
                flags.append(f'NE spelling "{r["name"]}" differs from official "{alias}"')
        elif iso3 == 'DEU':
            unit, method = DEU_ISO.get(s.get('iso_3166_2')), 'ISO 3166-2 -> NUTS-1 (Land)'
        elif iso3 == 'POL':
            unit, method = POL_ISO.get(s.get('iso_3166_2')), 'ISO 3166-2 -> NUTS-2 (voivodeship)'
            if s.get('iso_3166_2') == 'PL-MZ':
                flags.append('Mazowieckie = two NUTS-2 regions (PL91 + PL92)')
        elif iso3 == 'ITA':
            unit = labels3.get(norm(r['name']))
            method = 'NUTS-3 name match'
            region_unit = ITA_REGION.get(s.get('region'))
            if not unit:
                unit, method = (region_unit or '').split('+')[0] or None, 'NE region attribute -> NUTS-2'
                flags.append('province not matched to a NUTS-3 code (2016-2024 province reforms); assigned by region')
        elif iso3 == 'GBR':
            geo = s.get('geonunit')
            unit = GBR_GEOUNIT.get(geo) or GBR_REGION.get(s.get('region'))
            method = 'NE geonunit -> ITL1' if geo in GBR_GEOUNIT else 'NE region attribute -> ITL1'
        pid = province_of(unit) if unit else None
        if not pid:
            flags.append('UNASSIGNED')
        label = POP.get(unit, {}).get('label') if unit in POP else ITL1.get(unit, '')
        rows.append({'country': iso3, 'ne_admin1_id': r['id'], 'ne_id': s.get('ne_id'), 'name': r['name'],
                     'iso_3166_2': s.get('iso_3166_2') or '', 'ne_type': s.get('type_en') or s.get('type') or '',
                     'ne_region': s.get('region') or '', 'ne_geonunit': s.get('geonunit') or '',
                     'statistical_unit': unit or '', 'statistical_label': label or '', 'match_method': method,
                     'province_id': pid or '', 'geometry_status': r.get('geometryStatus'), 'flags': '; '.join(flags)})
        path = r.get('geometry', {}).get('path') if r.get('geometry') else None
        if path:
            geometry.setdefault(path, set()).add(r['id'])

# ----------------------------------------------------------------------------------------------
# Land adjacency from shared boundary vertices (rounded to 1e-5 degrees, about 1 m). Natural Earth
# admin-1 polygons of neighbouring units share their common boundary vertices.
def rings(geom):
    if geom['type'] == 'Polygon':
        yield from geom['coordinates']
    elif geom['type'] == 'MultiPolygon':
        for poly in geom['coordinates']:
            yield from poly

unit_vertices = {}
for path in geometry:
    data = json.load(open(os.path.join(NE, path), encoding='utf-8'))
    for feature in data['features']:
        rid = feature.get('id') or feature['properties'].get('id')
        if rid is None or feature.get('geometry') is None:
            continue
        verts = set()
        for ring in rings(feature['geometry']):
            for x, y in ring:
                verts.add((round(x, 5), round(y, 5)))
        unit_vertices[rid] = verts

by_vertex = defaultdict(set)
for rid, verts in unit_vertices.items():
    for v in verts:
        by_vertex[v].add(rid)
pair_shared = defaultdict(int)
for v, ids in by_vertex.items():
    if len(ids) > 1:
        ids = sorted(ids)
        for i in range(len(ids)):
            for j in range(i + 1, len(ids)):
                pair_shared[(ids[i], ids[j])] += 1

province_by_unit = {row['ne_admin1_id']: row['province_id'] for row in rows}
adjacent = defaultdict(lambda: defaultdict(int))
for (a, b), n in pair_shared.items():
    pa, pb = province_by_unit.get(a), province_by_unit.get(b)
    if n >= 2 and pa and pb and pa != pb:
        adjacent[pa][pb] += n
        adjacent[pb][pa] += n

# ----------------------------------------------------------------------------------------------
# Province summaries, land connectivity per country (components of the land graph).
provinces = []
for pid, (name, iso3, units) in PROVINCES.items():
    members = [row for row in rows if row['province_id'] == pid]
    if iso3 == 'GBR':
        values = [ONS[u] for u in units if u in ONS]
        source = 'ONS mid-year estimates, 30 Jun 2025 (OGL v3)'
    else:
        values = [POP[u]['pop2025'] for u in units if u in POP]
        source = 'Eurostat demo_r_pjanaggr3, 1 Jan 2025'
    pop = sum(values) if len(values) == len(units) else None
    provinces.append({'id': pid, 'name': name, 'country': iso3, 'statistical_units': units,
                      'statistical_system': 'ITL1 (ONS)' if iso3 == 'GBR' else 'NUTS 2024 (Eurostat)',
                      'admin1_members': len(members), 'population': pop, 'population_reference_date': ('2025-06-30' if iso3 == 'GBR' else '2025-01-01') if pop else None,
                      'population_source': source if pop else 'not available',
                      'simulated_in_v1': pid not in NOT_SIMULATED,
                      'land_neighbours': sorted(adjacent.get(pid, {}).keys())})

for iso3 in ['FRA', 'DEU', 'GBR', 'ITA', 'POL', 'TUR']:
    ids = [p['id'] for p in provinces if p['country'] == iso3 and p['simulated_in_v1']]
    seen, components = set(), []
    for start in ids:
        if start in seen:
            continue
        stack, comp = [start], []
        while stack:
            cur = stack.pop()
            if cur in seen:
                continue
            seen.add(cur); comp.append(cur)
            stack += [n for n in adjacent.get(cur, {}) if n in ids and n not in seen]
        components.append(sorted(comp))
    main = max(components, key=len)
    for p in provinces:
        if p['country'] == iso3 and p['simulated_in_v1']:
            p['land_connected_to_mainland'] = p['id'] in main

os.makedirs(OUT, exist_ok=True)
with open(os.path.join(OUT, 'world02-admin1-to-province.csv'), 'w', newline='', encoding='utf-8') as f:
    writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
    writer.writeheader(); writer.writerows(rows)
json.dump(provinces, open(os.path.join(OUT, 'world02-provinces.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump({p: dict(sorted(n.items())) for p, n in sorted(adjacent.items())},
          open(os.path.join(OUT, 'world02-province-adjacency.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump([{'a': a, 'b': b, 'kind': kind, 'crossing': crossing, 'status': status, 'proposal': proposal}
           for a, b, kind, crossing, status, proposal in SEA_LINKS],
          open(os.path.join(OUT, 'world02-sea-links.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
unassigned = [r for r in rows if not r['province_id']]
print(f'{len(rows)} admin-1 units, {len(provinces)} provinces, {len(unassigned)} unassigned')
for r in unassigned:
    print('  UNASSIGNED', r['country'], r['name'], r['iso_3166_2'], r['ne_region'], r['ne_geonunit'])
