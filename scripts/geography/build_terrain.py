#!/usr/bin/env python3
"""Pinned physical reference assets, processed offline with GDAL; no runtime dependencies."""
import argparse
import concurrent.futures
import gzip
import hashlib
import json
import math
from pathlib import Path
import urllib.request

from osgeo import gdal, ogr
from build import encoded, prepare_geometry

gdal.UseExceptions()
ogr.UseExceptions()
gdal.SetConfigOption('GDAL_PAM_ENABLED', 'NO')  # Registration lives in the manifest, not auxiliary XML files.
ROOT = Path(__file__).resolve().parents[2]
LOCK = json.loads(Path(__file__).with_name('terrain-sources.lock.json').read_text())


def verify(root, download):
    def one(entry):
        path = root / entry['path']
        if not path.exists() and download:
            data = urllib.request.urlopen(entry['url'], timeout=120).read()
            if hashlib.sha256(data).hexdigest() != entry['sha256']:
                raise ValueError(f"Source checksum mismatch: {entry['path']}")
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        data = path.read_bytes()
        if len(data) != entry['bytes'] or hashlib.sha256(data).hexdigest() != entry['sha256']:
            raise ValueError(f"Source checksum mismatch: {entry['path']}")
        if path.name.endswith('VERSION.txt') and data.decode().strip() != LOCK['vector']['layerVersion']:
            raise ValueError('Unexpected physical vector version')
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(one, LOCK['files']))


def build(root, output):
    assets, raster_tiles = [], []
    output.mkdir(parents=True, exist_ok=True)

    def descriptor(path):
        data = (output / path).read_bytes()
        ref = {'path': path, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
        if path.endswith('.json'):
            ref['gzipBytes'] = len(gzip.compress(data, mtime=0))
        assets.append(ref)
        return ref

    def write(path, data):
        target = output / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(encoded(data))
        return descriptor(path)

    raster = gdal.Open(str(root / 'raster/NE1_50M_SR_W.tif'))
    assert (raster.RasterXSize, raster.RasterYSize, raster.RasterCount) == (10800, 5400, 3)
    transform = raster.GetGeoTransform()
    expected = (-180, 1 / 30, 0, 90, 0, -1 / 30)
    assert max(abs(a - b) for a, b in zip(transform, expected)) < 1e-10
    assert raster.GetSpatialRef().GetAuthorityCode(None) == '4326'
    # All levels resample the source directly. No upsampling or synthetic relief.
    for level in range(4):
        width, height = 1024 * 2 ** level, 512 * 2 ** level
        resampled = gdal.Translate('', raster, format='MEM', width=width, height=height, resampleAlg='bilinear')
        if level == 0:
            gdal.Translate(str(output / 'world.webp'), resampled, format='WEBP', creationOptions=['QUALITY=82', 'LOSSLESS=FALSE'])
            overview = {**descriptor('world.webp'), 'width': width, 'height': height, 'bounds': [-180, -90, 180, 90]}
            continue
        for y in range(height // 512):
            for x in range(width // 512):
                # One level-pixel gutter prevents transparent seams during fractional camera scaling.
                left, top = max(0, x * 512 - 1), max(0, y * 512 - 1)
                right, bottom = min(width, (x + 1) * 512 + 1), min(height, (y + 1) * 512 + 1)
                path = f'raster/{level}/{x}-{y}.webp'
                (output / path).parent.mkdir(parents=True, exist_ok=True)
                gdal.Translate(str(output / path), resampled, format='WEBP', srcWin=[left, top, right - left, bottom - top],
                               creationOptions=['QUALITY=82', 'LOSSLESS=FALSE'])
                bounds = [x * 512 / width * 360 - 180, 90 - (y + 1) * 512 / height * 180,
                          (x + 1) * 512 / width * 360 - 180, 90 - y * 512 / height * 180]
                image_bounds = [left / width * 360 - 180, 90 - bottom / height * 180, right / width * 360 - 180, 90 - top / height * 180]
                raster_tiles.append({**descriptor(path), 'level': level, 'x': x, 'y': y, 'bounds': bounds,
                                     'imageBounds': image_bounds, 'width': right - left, 'height': bottom - top})

    quality = {'sourceTopologyIssues': [], 'precisionExceptions': [], 'polygonCount': 0, 'ringCount': 0, 'coordinateCount': 0, 'missingGeometry': []}
    vector_counts, source_counts, hydrology = {}, {}, {}
    for scale in ['110m', '50m', '10m']:
        features = []
        counts = {}
        for kind, source in [('river', 'rivers_lake_centerlines'), ('lake', 'lakes')]:
            ds = ogr.Open(str(root / f'{scale}_physical/ne_{scale}_{source}.shp'))
            rows = ds.GetLayer(0)
            assert rows.GetSpatialRef().GetAuthorityCode(None) == '4326'
            counts[kind] = rows.GetFeatureCount()
            for row in rows:
                source_geom = row.GetGeometryRef()
                source_id = row['ne_id']
                # Some source NE_IDs repeat. Keep every record and retain its pinned-layer FID.
                feature_id = f'ne:physical:{scale}:{kind}:{source_id}:{row.GetFID()}'
                assert source_id is not None
                if source_geom is None or source_geom.IsEmpty():
                    quality['missingGeometry'].append({'id': feature_id, 'name': row['name'], 'sourceId': source_id, 'sourceFeatureId': row.GetFID()})
                    continue
                if kind == 'lake':
                    geometry, bbox, status = prepare_geometry(source_geom, feature_id, f'ne_{scale}_{source}', quality)
                else:
                    geometry = json.loads(source_geom.ExportToJson(['COORDINATE_PRECISION=6']))
                    env = source_geom.GetEnvelope()
                    bbox, status = [env[0], env[2], env[1], env[3]], 'valid' if source_geom.IsValid() else 'source-invalid'
                features.append({'id': feature_id, 'sourceId': source_id, 'sourceFeatureId': row.GetFID(), 'name': row['name'], 'kind': kind,
                                 'rank': row['scalerank'], 'bbox': bbox, 'geometryStatus': status, 'geometry': geometry})
        assert len({f['id'] for f in features}) == len(features)
        source_counts[scale] = counts
        vector_counts[scale] = {kind: sum(f['kind'] == kind for f in features) for kind in counts}
        if scale != '10m':
            hydrology[scale] = write(f'hydrology-{scale}.json', {'schemaVersion': 1, 'features': features})
        else:
            chunks = []
            for y in range(6):
                for x in range(12):
                    bounds = [x * 30 - 180, 60 - y * 30, x * 30 - 150, 90 - y * 30]
                    w, s, e, n = bounds
                    records = [f for f in features if f['bbox'][0] <= e and f['bbox'][2] >= w and f['bbox'][1] <= n and f['bbox'][3] >= s]
                    if records:
                        ref = write(f'hydrology/{x}-{y}.json', {'schemaVersion': 1, 'features': records})
                        chunks.append({**ref, 'bounds': bounds, 'featureCount': len(records)})
            hydrology['10m'] = chunks
    manifest = {'schemaVersion': 1, 'datasetId': 'natural-earth-physical-v1', 'crs': 'OGC:CRS84', 'bounds': [-180, -90, 180, 90],
                'source': {'raster': LOCK['raster'], 'vector': LOCK['vector'], 'license': LOCK['license'], 'licenseUrl': LOCK['licenseUrl']},
                'raster': {'sourceWidth': 10800, 'sourceHeight': 5400, 'sourceGeoTransform': list(transform), 'overview': overview,
                           'tiles': raster_tiles, 'maximumLevel': 3, 'resampling': 'bilinear', 'encoding': 'WebP quality 82', 'gutterPixels': 1},
                'hydrology': hydrology, 'sourceFeatureCounts': source_counts, 'featureCounts': vector_counts, 'geometryQuality': quality,
                'unsupported': ['Separate classified forest/desert/grassland polygons', 'Plains as a geomorphological class',
                                'Current land-cover change', 'Ground-scale elevation/river precision', 'Military terrain effects'],
                'assets': assets, 'totalAssetBytes': sum(a['bytes'] for a in assets)}
    (output / 'manifest.json').write_bytes(encoded(manifest))
    print(json.dumps({'assets': len(assets) + 1, 'bytes': manifest['totalAssetBytes'] + (output / 'manifest.json').stat().st_size,
                      'rasterTiles': len(raster_tiles), 'hydrologyChunks': len(hydrology['10m']), 'featureCounts': vector_counts,
                      'sourceTopologyIssues': quality['sourceTopologyIssues']}, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', required=True, type=Path)
    parser.add_argument('--output-dir', type=Path, default=ROOT / 'public/atlas/physical-v1')
    parser.add_argument('--download', action='store_true')
    args = parser.parse_args()
    verify(args.source_dir, args.download)
    build(args.source_dir, args.output_dir)
