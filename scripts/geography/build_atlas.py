#!/usr/bin/env python3
"""Build presentation metadata from MAP-01A geometry; requires GDAL, no app dependency."""
import colorsys
import hashlib
import json
import math
from pathlib import Path

from osgeo import gdal, ogr

ogr.UseExceptions()
gdal.PushErrorHandler('CPLQuietErrorHandler')
ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'public/geography/natural-earth-5.1.1'


def lab(rgb):
    c = [v / 255 for v in rgb]
    r, g, b = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in c]
    x, y, z = (r * .4124564 + g * .3575761 + b * .1804375) / .95047, r * .2126729 + g * .7151522 + b * .0721750, (r * .0193339 + g * .1191920 + b * .9503041) / 1.08883
    x, y, z = [v ** (1 / 3) if v > (6 / 29) ** 3 else v / (3 * (6 / 29) ** 2) + 4 / 29 for v in (x, y, z)]
    return (116 * y - 16, 500 * (x - y), 200 * (y - z))


def distance(a, b):
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))


def main_territory_bounds(polygons):
    """Frame source land area and nearby islands without changing the polygons."""
    parts = []
    for polygon in polygons:
        west, east, south, north = polygon.GetEnvelope()
        area = polygon.GetArea() * math.cos(math.radians((south + north) / 2))
        parts.append((area, west, south, east, north))
    parts.sort(reverse=True)
    largest = parts[0][0]
    mainland = largest >= .75 * sum(part[0] for part in parts)
    # For a dominant landmass include close islands, but leave distant holdings
    # out. For an archipelago, connect the main islands across wider channels.
    minimum_area = largest * (.005 if mainland else .025)
    maximum_gap = 2.5 if mainland else 8
    main, candidates = parts[:1], parts[1:]

    def separation(part, other):
        _, west, south, east, north = part
        _, w, s, e, n = other
        lat_gap = max(0, s - north, south - n)
        lon_gap = min(max(0, w - east - offset, west + offset - e) for offset in (-360, 0, 360))
        seam = lon_gap == 0 and lat_gap == 0 and ((west == -180 and e == 180) or (w == -180 and east == 180))
        latitude_scale = math.cos(math.radians((south + north + s + n) / 4))
        return 0 if seam else math.hypot(lon_gap * latitude_scale, lat_gap), seam

    while candidates:
        nearby, remaining = [], []
        for part in candidates:
            for included in main:
                gap, seam = separation(part, included)
                if seam or (part[0] >= minimum_area and gap <= maximum_gap):
                    nearby.append(part)
                    break
            else:
                remaining.append(part)
        if not nearby:
            break
        main.extend(nearby)
        candidates = remaining

    # Include coastal islets without using them to bridge to remote territories.
    coast = [part for part in candidates if any(separation(part, included)[0] <= .75 for included in main)]
    main.extend(coast)

    # The complement of the largest longitude gap is the smallest wrapped span.
    intervals = []
    for west, east in sorted((part[1], part[3]) for part in main):
        if intervals and west <= intervals[-1][1]:
            intervals[-1][1] = max(intervals[-1][1], east)
        else:
            intervals.append([west, east])
    gaps = [(intervals[0][0] + 360 - intervals[-1][1], intervals[0][0], intervals[-1][1])]
    gaps += [(right[0] - left[1], right[0], left[1] + 360) for left, right in zip(intervals, intervals[1:])]
    _, west, east = max(gaps)
    return [round(value, 6) for value in [west, min(part[2] for part in main), east, max(part[4] for part in main)]]


def build():
    countries = json.loads((DATA / 'countries.json').read_text())['countries']
    countries.sort(key=lambda c: c['id'])
    geometries, neighbors = {}, {c['id']: set() for c in countries}
    for country in countries:
        geometry = ogr.CreateGeometryFromJson(json.dumps(json.loads((DATA / country['geometry']['path']).read_text())['geometry']))
        # Only the adjacency/label analysis uses MakeValid for the documented EGY defect.
        # Original geographic assets are never changed.
        geometries[country['id']] = geometry if geometry.IsValid() else geometry.MakeValid()
    for i, a in enumerate(countries):
        for b in countries[i + 1:]:
            aw, ass, ae, an = a['bbox']
            bw, bs, be, bn = b['bbox']
            if aw > be or bw > ae or ass > bn or bs > an:
                continue
            # Includes point contacts and source overlaps as well as shared boundary lines.
            if geometries[a['id']].Intersects(geometries[b['id']]):
                neighbors[a['id']].add(b['id'])
                neighbors[b['id']].add(a['id'])
    candidates = []
    for light in (.59, .67, .75):
        for saturation in (.35, .47, .59):
            for hue in range(0, 360, 7):
                rgb = tuple(round(v * 255) for v in colorsys.hls_to_rgb(hue / 360, light, saturation))
                candidates.append((rgb, lab(rgb)))
    assigned, used = {}, set()
    # Fixed source graph + ID tie breaks yield a stable, unique color for all 258 entities.
    remaining = set(neighbors)
    while remaining:
        key = min(remaining, key=lambda k: (-sum(n in assigned for n in neighbors[k]), -len(neighbors[k]), k))
        nearby = [assigned[n][1] for n in sorted(neighbors[key]) if n in assigned]
        seed = int(hashlib.sha256(key.encode()).hexdigest()[:8], 16)
        def score(item):
            index, (rgb, value) = item
            separation = min((distance(value, other) for other in nearby), default=70)
            # Favor neighboring contrast, balanced lightness, and a deterministic tie break.
            return (min(separation, 70), -abs(value[0] - 70), -((index - seed) % len(candidates)))
        index, color = max(((i, c) for i, c in enumerate(candidates) if c[0] not in used), key=score)
        assigned[key] = color
        used.add(color[0])
        remaining.remove(key)
    pairs = sorted([a, b] for a, ns in neighbors.items() for b in ns if a < b)
    records = []
    countries_without_regions = []
    for country in countries:
        key = country['id']
        index_asset = country['regionIndex']
        regions = json.loads((DATA / index_asset['path']).read_text())['regions'] if index_asset else []
        stand_in = len(regions) == 1 and regions[0]['source']['gadm_level'] == 0 and (
            regions[0]['source']['adm1_code'] == key.split(':')[-1] + '+00?'
        )
        if stand_in or not any(region['geometryStatus'] == 'valid' for region in regions):
            countries_without_regions.append(key)
        geom = geometries[key]
        point = geom.PointOnSurface()
        rgb = assigned[key][0]
        polygons = [geom] if geom.GetGeometryName() == 'POLYGON' else list(geom)
        tiles = set()
        for polygon in polygons:
            west, east, south, north = polygon.GetEnvelope()
            for x in range(max(0, int((west + 180) // 10)), min(35, int((east + 180) // 10)) + 1):
                for y in range(max(0, int((90 - north) // 10)), min(17, int((90 - south) // 10)) + 1):
                    tiles.add(y * 36 + x)
        records.append({'id': key, 'name': country['name'], 'color': '#%02x%02x%02x' % rgb,
                        'bbox': country['bbox'], 'mainBounds': main_territory_bounds(polygons),
                        'label': [round(point.GetX(), 5), round(point.GetY(), 5)],
                        'area': round(geom.GetArea(), 5), 'path': country['geometry']['path'], 'tiles': sorted(tiles)})
    output = ROOT / 'public/atlas/political.json'
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({'schemaVersion': 1, 'datasetId': 'natural-earth-5.1.1', 'countries': records,
                                 'countriesWithoutRegions': countries_without_regions,
                                 'neighbors': pairs, 'colorMetric': 'CIELAB Delta E 1976',
                                 'minimumNeighborDeltaE': round(min(distance(assigned[a][1], assigned[b][1]) for a, b in pairs), 3)},
                                ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f'{len(records)} entities, {len(pairs)} neighboring pairs, {output.stat().st_size} bytes')


if __name__ == '__main__':
    build()
