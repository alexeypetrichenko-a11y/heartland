#!/usr/bin/env python3
"""
WORLD-03 step 2a (offline): regions and connectivity of the 61-zone European scenario.

Inputs (all in the repository):
  public/geography/natural-earth-5.1.1/         admin-1 geometry of every country (public domain)
  docs/world/data/world02-admin1-to-province.csv the approved admin-1 -> province crosswalk (46 provinces)
  docs/world/data/world02-economic-membership.csv the approved partition of the 258 globe entities
  docs/world/data/world02-sea-links.json          the approved curated sea and fixed links

It computes, from shared boundary vertices (rounded to 1e-5 degrees, at least 2 shared vertices, as in WORLD-02):
  * land borders between the 61 zones: province-province, province-neighbour, province-bloc,
    neighbour-neighbour, neighbour-bloc, bloc-bloc;
  * which zones have a coastline (boundary vertices shared with no other admin-1 unit in the world, at least
    COAST_MIN_VERTICES of them);
and writes scenarios/europe-2023/build/geography.json with three separate link sets (owner decision S-1):
  land      : land borders (economic road lanes AND the land-movement graph for playable provinces),
  maritime  : trade-only links: the curated WORLD-02 sea/fixed links proposed for v1, plus the bloc rule from
              WORLD-02 PROVINCES.md §4.3 ("blocs trade by sea lanes with coastal provinces and other blocs"),
              applied to coastal provinces and coastal neighbours,
  movement  : land movement between playable provinces only (simulated neighbours and blocs cannot be entered
              in v1, decision Z-2); maritime and fixed links are never movement links.
No distance is invented: every lane keeps the existing integration distance (0.8); great-circle distances
between zone centroids are recorded as metadata only.

Run from the repository root:  python3 scenarios/pipeline/build_geography.py
"""
import csv, json, math, os
from collections import defaultdict

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
NE = os.path.join(ROOT, 'public', 'geography', 'natural-earth-5.1.1')
W2 = os.path.join(ROOT, 'docs', 'world', 'data')
OUT = os.path.join(ROOT, 'scenarios', 'europe-2023', 'build')
COAST_MIN_VERTICES = 20
LANE_DISTANCE = 0.8          # the integration layer's existing ADJACENT_ROAD_DISTANCE; not a new parameter

PLAYABLE = {'FRA': 'France', 'DEU': 'Germany', 'GBR': 'United Kingdom', 'ITA': 'Italy', 'POL': 'Poland', 'TUR': 'Türkiye'}
BLOCS = {'bloc EUR: Rest of Europe': ('bloc-eur', 'Rest of Europe'), 'bloc EEC: Eastern Europe and Central Asia': ('bloc-eec', 'Eastern Europe and Central Asia'),
         'bloc MEA: Middle East and Africa': ('bloc-mea', 'Middle East and Africa'), 'bloc AME: Americas': ('bloc-ame', 'Americas'),
         'bloc APA: Asia-Pacific': ('bloc-apa', 'Asia-Pacific')}

def province_zone(pid):
    return pid.lower()

def load():
    crosswalk = {r['ne_admin1_id']: r['province_id'] for r in csv.DictReader(open(os.path.join(W2, 'world02-admin1-to-province.csv'), encoding='utf-8'))}
    membership = {r['adm0_a3']: r for r in csv.DictReader(open(os.path.join(W2, 'world02-economic-membership.csv'), encoding='utf-8'))}
    provinces = {p['id']: p for p in json.load(open(os.path.join(W2, 'world02-provinces.json'), encoding='utf-8'))}
    countries = json.load(open(os.path.join(NE, 'countries.json'), encoding='utf-8'))['countries']
    return crosswalk, membership, provinces, countries

def zone_of_entity(adm0, membership):
    """Natural Earth admin-0 entity -> scenario zone id (or None for 'no economy')."""
    row = membership.get(adm0)
    if row is None or row['tier'] == 'none':
        return None
    if row['tier'] == 'simulated':
        return f'{adm0.lower()}-all'
    if row['tier'] == 'bloc':
        return f'{BLOCS[row["economic_unit"]][0]}-all'
    return None   # playable: resolved per admin-1 unit through the crosswalk

def rings(geom):
    if geom['type'] == 'Polygon':
        yield from geom['coordinates']
    elif geom['type'] == 'MultiPolygon':
        for poly in geom['coordinates']:
            yield from poly

def main():
    crosswalk, membership, provinces, countries = load()
    unit_zone = {}                       # admin-1 id -> zone id
    unit_vertices = {}
    centroid_sum = defaultdict(lambda: [0.0, 0.0, 0])
    for country in countries:
        adm0 = country['source']['ADM0_A3']
        index_path = os.path.join(NE, 'regions', f'{adm0}.index.json')
        if not os.path.exists(index_path):
            continue
        index = json.load(open(index_path, encoding='utf-8'))
        paths = sorted({r['geometry']['path'] for r in index['regions'] if r.get('geometry')})
        ids = {r['id'] for r in index['regions']}
        for r in index['regions']:
            if adm0 in PLAYABLE:
                pid = crosswalk.get(r['id'])
                simulated = pid and provinces[pid]['simulated_in_v1']
                unit_zone[r['id']] = province_zone(pid) if simulated else None
            else:
                unit_zone[r['id']] = zone_of_entity(adm0, membership)
        for path in paths:
            data = json.load(open(os.path.join(NE, path), encoding='utf-8'))
            for feature in data['features']:
                rid = feature.get('id') or feature['properties'].get('id')
                if rid not in ids or feature.get('geometry') is None:
                    continue
                verts = set()
                for ring in rings(feature['geometry']):
                    for x, y in ring:
                        verts.add((round(x, 5), round(y, 5)))
                unit_vertices[rid] = verts
                zone = unit_zone.get(rid)
                if zone:
                    acc = centroid_sum[zone]
                    for x, y in verts:
                        acc[0] += x; acc[1] += y; acc[2] += 1
    by_vertex = defaultdict(set)
    for rid, verts in unit_vertices.items():
        for v in verts:
            by_vertex[v].add(rid)
    shared = defaultdict(int)
    unshared = defaultdict(int)          # zone -> boundary vertices touching no other admin-1 unit (coastline)
    for v, ids in by_vertex.items():
        if len(ids) == 1:
            zone = unit_zone.get(next(iter(ids)))
            if zone:
                unshared[zone] += 1
            continue
        zones = sorted({unit_zone.get(i) for i in ids if unit_zone.get(i)})
        for i in range(len(zones)):
            for j in range(i + 1, len(zones)):
                shared[(zones[i], zones[j])] += 1
    zones = sorted({z for z in unit_zone.values() if z})
    land = sorted((a, b) for (a, b), n in shared.items() if n >= 2)
    coastal = sorted(z for z in zones if unshared[z] >= COAST_MIN_VERTICES)

    kind = {}
    for z in zones:
        kind[z] = 'bloc' if z.startswith('bloc-') else ('neighbour' if z.endswith('-all') else 'province')
    sea = json.load(open(os.path.join(W2, 'world02-sea-links.json'), encoding='utf-8'))
    def node(code):
        return province_zone(code) if '-' in code else f'{code.lower()}-all'
    maritime = []
    for link in sea:
        if link['proposal'] != 'include':
            continue
        a, b = sorted((node(link['a']), node(link['b'])))
        maritime.append({'a': a, 'b': b, 'kind': link['kind'], 'crossing': link['crossing'], 'status': link['status'], 'rule': 'curated (WORLD-02 sea links)'})
    land_set = set(land)
    curated = {(m['a'], m['b']) for m in maritime}
    blocs = [z for z in zones if kind[z] == 'bloc']
    for bloc in blocs:
        for z in coastal:
            if kind[z] in ('province', 'neighbour') and tuple(sorted((bloc, z))) not in land_set | curated:
                a, b = sorted((bloc, z))
                maritime.append({'a': a, 'b': b, 'kind': 'sea lane', 'crossing': 'world market by sea', 'status': 'rule', 'rule': 'bloc to coastal zone (WORLD-02 PROVINCES.md §4.3)'})
        for other in blocs:
            if bloc < other and (bloc, other) not in land_set:
                maritime.append({'a': bloc, 'b': other, 'kind': 'sea lane', 'crossing': 'world market by sea', 'status': 'rule', 'rule': 'bloc to bloc (WORLD-02 PROVINCES.md §4.3)'})
    maritime.sort(key=lambda m: (m['a'], m['b']))
    movement = sorted((a, b) for a, b in land if kind[a] == 'province' and kind[b] == 'province')

    centroids = {z: (s[0] / s[2], s[1] / s[2]) for z, s in centroid_sum.items() if s[2]}
    def km(a, b):
        (x1, y1), (x2, y2) = centroids[a], centroids[b]
        p1, p2, dl = math.radians(y1), math.radians(y2), math.radians(x2 - x1)
        return round(6371 * math.acos(min(1, math.sin(p1) * math.sin(p2) + math.cos(p1) * math.cos(p2) * math.cos(dl))))

    out = {
        'zones': [{'id': z, 'kind': kind[z], 'coastal': z in coastal, 'coast_vertices': unshared[z],
                   'centroid_lon_lat': [round(c, 3) for c in centroids[z]]} for z in zones],
        'land': [{'a': a, 'b': b, 'shared_vertices': shared[(a, b)], 'distance': LANE_DISTANCE, 'great_circle_km': km(a, b)} for a, b in land],
        'maritime': [{**m, 'distance': LANE_DISTANCE, 'great_circle_km': km(m['a'], m['b'])} for m in maritime],
        'movement': [{'a': a, 'b': b} for a, b in movement],
        'method': {'vertex_rounding_degrees': 1e-5, 'min_shared_vertices': 2, 'coast_min_vertices': COAST_MIN_VERTICES, 'lane_distance': LANE_DISTANCE,
                   'note': 'Centroid = mean of boundary vertices (shape only, not population weighted). Distances are metadata; all lanes use the existing 0.8.'},
    }
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, 'geography.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write('\n')
    counts = defaultdict(int)
    for a, b in land:
        counts[f'{kind[a]}-{kind[b]}'] += 1
    print(f'{len(zones)} zones; {len(land)} land borders {dict(counts)}; {len(maritime)} maritime links; '
          f'{len(movement)} movement links; coastal: {len(coastal)}')

if __name__ == '__main__':
    main()
