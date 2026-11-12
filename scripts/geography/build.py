#!/usr/bin/env python3
"""Reproduce the pinned Natural Earth assets. Requires Python + GDAL; no app dependency."""
import argparse
import collections
import concurrent.futures
import gzip
import hashlib
import json
import math
from pathlib import Path
import re
import urllib.request

from osgeo import gdal, ogr

ogr.UseExceptions()
gdal.PushErrorHandler("CPLQuietErrorHandler")
REPO = Path(__file__).resolve().parents[2]
LOCK = json.loads((Path(__file__).with_name("sources.lock.json")).read_text())
VERSION = LOCK["datasetVersion"]
CHUNK_TARGET = 256 * 1024


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n").encode()


def verify_sources(root, download):
    def verify(entry):
        path = root / entry["path"]
        if not path.exists() and download:
            path.parent.mkdir(parents=True, exist_ok=True)
            with urllib.request.urlopen(entry["url"], timeout=120) as response:
                data = response.read()
            if hashlib.sha256(data).hexdigest() != entry["sha256"]:
                raise ValueError(f"Source checksum mismatch: {entry['path']}")
            path.write_bytes(data)
        data = path.read_bytes()
        if len(data) != entry["bytes"] or hashlib.sha256(data).hexdigest() != entry["sha256"]:
            raise ValueError(f"Source checksum mismatch: {entry['path']}")
        if path.name.endswith("VERSION.txt") and data.decode().strip() != VERSION:
            raise ValueError(f"Unexpected layer version: {path}")
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(verify, LOCK["files"]))


def layer(root, scale, admin, name, extension="shp"):
    dataset = ogr.Open(str(root / f"{scale}_cultural/ne_{scale}_admin_{admin}_{name}.{extension}"))
    return dataset, dataset.GetLayer(0)


def ring_area(ring):
    # Subtract the origin to avoid cancellation for small offshore rings.
    x, y = ring[0]
    return math.fsum((a[0] - x) * (b[1] - y) - (b[0] - x) * (a[1] - y)
                     for a, b in zip(ring, ring[1:])) / 2


def polygons(geometry):
    if geometry["type"] == "Polygon":
        return [geometry["coordinates"]]
    if geometry["type"] == "MultiPolygon":
        return geometry["coordinates"]
    raise ValueError(f"Unexpected geometry: {geometry['type']}")


def validate_and_orient(geometry):
    for polygon in polygons(geometry):
        if not polygon:
            raise ValueError("Empty polygon")
        for i, ring in enumerate(polygon):
            if len(ring) < 4 or ring[0] != ring[-1] or len(set(map(tuple, ring))) < 3:
                raise ValueError("Collapsed or open ring")
            for point in ring:
                if len(point) != 2 or not all(math.isfinite(v) for v in point):
                    raise ValueError("Invalid coordinate")
                if not (-180 <= point[0] <= 180 and -90 <= point[1] <= 90):
                    raise ValueError("Coordinate outside WGS84 bounds")
            area = ring_area(ring)
            if not area:
                raise ValueError("Zero-area ring")
            # RFC 7946 exterior CCW, interior CW; reverse only vertex order.
            if (area > 0) != (i == 0):
                ring.reverse()


def prepare_geometry(source, feature_id, dataset, quality):
    source_valid = bool(source.IsValid())
    source_reason = gdal.GetLastErrorMsg() if not source_valid else None
    original_rings = [[len(r) for r in p] for p in polygons(json.loads(source.ExportToJson()))]
    original_parts = [len(p) for p in original_rings]
    for precision in [6, 9, 12, 15, 17]:
        geometry = json.loads(source.ExportToJson([f"COORDINATE_PRECISION={precision}"]))
        try:
            validate_and_orient(geometry)
        except ValueError:
            continue
        processed = ogr.CreateGeometryFromJson(json.dumps(geometry))
        valid = bool(processed.IsValid())
        if source_valid and not valid:
            continue  # Retain precision rather than silently introducing topology damage.
        assert original_parts == [len(p) for p in polygons(geometry)], "Lost polygon or ring"
        assert original_rings == [[len(r) for r in p] for p in polygons(geometry)], "Lost source vertices"
        if not source_valid:
            quality["sourceTopologyIssues"].append({"id": feature_id, "dataset": dataset,
                "reason": source_reason, "processedValid": valid})
        if precision != 6:
            quality["precisionExceptions"].append({"id": feature_id, "dataset": dataset, "decimals": precision})
        envelope = processed.GetEnvelope()
        bbox = [envelope[0], envelope[2], envelope[1], envelope[3]]
        quality["polygonCount"] += len(original_parts)
        quality["ringCount"] += sum(original_parts)
        quality["coordinateCount"] += sum(len(r) for p in polygons(geometry) for r in p)
        return geometry, bbox, "valid" if valid else "source-invalid"
    raise ValueError(f"Cannot preserve valid ring structure: {dataset}/{feature_id}")


def source_properties(feature, keys):
    available = feature.keys()
    result = {key: feature[key] for key in keys if key in available}
    for key in available:
        if key.startswith(("FCLASS_", "ADM0_A3_")) and feature[key] is not None:
            result[key] = feature[key]
    return result


def build(root, output):
    assets = {}
    quality = {"sourceTopologyIssues": [], "precisionExceptions": [], "polygonCount": 0, "ringCount": 0, "coordinateCount": 0}

    def write(path, value):
        data = encoded(value)
        target = output / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        descriptor = {"path": path, "bytes": len(data), "gzipBytes": len(gzip.compress(data, mtime=0)),
                      "sha256": hashlib.sha256(data).hexdigest()}
        assets[path] = descriptor
        return descriptor

    country_keys = ["NE_ID", "ADM0_A3", "SOV_A3", "SOVEREIGNT", "TYPE", "LEVEL", "featurecla", "ISO_A2", "ISO_A3",
                    "GEOUNIT", "GU_A3", "SUBUNIT", "SU_A3", "BRK_A3", "BRK_NAME", "BRK_GROUP", "NOTE_ADM0", "NOTE_BRK", "WIKIDATAID"]
    region_keys = ["ne_id", "adm1_code", "adm0_a3", "sov_a3", "iso_3166_2", "iso_a2", "code_hasc", "fips", "type", "type_en",
                   "gadm_level", "geonunit", "gu_a3", "region", "region_sub", "note", "check_me", "wikidataid", "featurecla"]
    countries = {}
    ds, rows = layer(root, "10m", 0, "countries")
    for feature in rows:
        code = feature["ADM0_A3"]
        assert re.fullmatch(r"[A-Z0-9]{3}", code) and code not in countries
        feature_id = f"ne:admin0:{code}"
        geometry, bbox, status = prepare_geometry(feature.GetGeometryRef(), feature_id, "ne_10m_admin_0_countries", quality)
        ref = write(f"countries/{code}.geojson", {"type": "Feature", "id": feature_id,
            "properties": {"countryId": feature_id}, "geometry": geometry})
        countries[code] = {"id": feature_id, "name": feature["ADMIN"], "names": {"short": feature["NAME"],
            "english": feature["NAME_EN"], "long": feature["NAME_LONG"]}, "continent": feature["CONTINENT"],
            "regionUN": feature["REGION_UN"], "subregion": feature["SUBREGION"], "source": source_properties(feature, country_keys),
            "bbox": bbox, "geometryStatus": status, "geometry": ref, "availableOverviews": [], "regionCount": 0, "regionIndex": None}
    print(f"Admin-0 detail: {len(countries)}", flush=True)

    overviews = {}
    for scale in ["110m", "50m"]:
        ds, rows = layer(root, scale, 0, "countries")
        features = []
        for feature in rows:
            country = countries[feature["ADM0_A3"]]
            country["availableOverviews"].append(scale)
            geometry, _, _ = prepare_geometry(feature.GetGeometryRef(), country["id"], f"ne_{scale}_admin_0_countries", quality)
            features.append({"type": "Feature", "id": country["id"], "properties": {"countryId": country["id"]}, "geometry": geometry})
        features.sort(key=lambda f: f["id"])
        overviews[scale] = {"featureCount": len(features), "asset": write(f"overview-{scale}.geojson", {"type": "FeatureCollection", "features": features})}
        print(f"Admin-0 {scale}: {len(features)}", flush=True)

    grouped = collections.defaultdict(list)
    ds, rows = layer(root, "10m", 1, "states_provinces")
    ids = set()
    for feature in rows:
        code = feature["adm0_a3"]
        country = countries[code]  # No inferred political/ISO joins or synthetic parents.
        feature_id = f"ne:admin1:{feature['ne_id']}"
        assert feature_id not in ids and feature["ne_id"] > 0
        ids.add(feature_id)
        geometry, bbox, status = prepare_geometry(feature.GetGeometryRef(), feature_id, "ne_10m_admin_1_states_provinces", quality)
        record = {"id": feature_id, "countryId": country["id"], "name": feature["name"], "names": {"english": feature["name_en"],
            "local": feature["name_local"], "alternative": feature["name_alt"]}, "source": source_properties(feature, region_keys),
            "bbox": bbox, "geometryStatus": status}
        polygon = {"type": "Feature", "id": feature_id, "properties": {"countryId": country["id"]}, "geometry": geometry}
        grouped[code].append((record, polygon))
        if len(ids) % 500 == 0:
            print(f"Admin-1: {len(ids)}", flush=True)

    missing_names, nonstandard, oversized = [], [], []
    for code in sorted(grouped):
        records, chunk = [], []
        chunk_bytes, chunk_number = 64, 0

        def finish_chunk():
            nonlocal chunk, chunk_bytes, chunk_number
            if not chunk:
                return
            ref = write(f"regions/{code}-{chunk_number:03}.geojson", {"type": "FeatureCollection", "features": [p for _, p in chunk]})
            for record, _ in chunk:
                record["geometry"] = ref
                records.append(record)
            if ref["bytes"] > CHUNK_TARGET:
                assert len(chunk) == 1
                oversized.append({"id": chunk[0][0]["id"], "asset": ref})
            chunk, chunk_bytes, chunk_number = [], 64, chunk_number + 1

        for record, polygon in sorted(grouped[code], key=lambda item: item[0]["id"]):
            size = len(encoded(polygon))
            if chunk and chunk_bytes + size > CHUNK_TARGET:
                finish_chunk()
            chunk.append((record, polygon))
            chunk_bytes += size
            if record["name"] is None:
                missing_names.append(record["id"])
            if not re.fullmatch(r"[A-Z0-9]{3}-\d+", record["source"]["adm1_code"]):
                nonstandard.append({"id": record["id"], "sourceCode": record["source"]["adm1_code"], "name": record["name"]})
        finish_chunk()
        countries[code]["regionCount"] = len(records)
        countries[code]["regionIndex"] = write(f"regions/{code}.index.json", {"schemaVersion": 1, "countryId": countries[code]["id"], "regions": records})

    investigated = []
    for scale in ["110m", "50m"]:
        ds, rows = layer(root, scale, 1, "states_provinces", "dbf")
        counts = collections.Counter(feature["adm0_a3"] for feature in rows)
        investigated.append({"scale": scale, "featureCount": sum(counts.values()), "countries": dict(sorted(counts.items()))})
    coverage = {"countryCount": len(countries), "regionCount": len(ids), "countriesWithRegionFeatures": len(grouped),
        "countriesWithoutRegionFeatures": [countries[c]["id"] for c in sorted(countries) if c not in grouped],
        "unnamedRegions": sorted(missing_names), "nonstandardRegionCodes": nonstandard,
        "regionSourceLevels": dict(sorted(collections.Counter(str(r["source"]["gadm_level"]) for group in grouped.values() for r, _ in group).items())),
        "investigatedAdmin1": investigated, "oversizedRegionFeatures": oversized}
    quality_ref = write("quality.json", {"coverage": coverage, "geometry": quality})
    catalog = write("countries.json", {"schemaVersion": 1, "countries": [countries[c] for c in sorted(countries)]})
    inventory = [assets[path] for path in sorted(assets)]
    inventory_ref = write("inventory.json", {"assets": inventory})
    manifest = {"schemaVersion": 1, "datasetId": f"natural-earth-{VERSION}", "crs": "OGC:CRS84", "coordinateOrder": ["longitude", "latitude"],
        "source": {"name": "Natural Earth", "datasetVersion": VERSION, "repositoryTag": LOCK["repositoryTag"],
                   "repositoryCommit": LOCK["repositoryCommit"], "license": LOCK["license"], "licenseUrl": LOCK["licenseUrl"],
                   "boundaryPolicy": "Natural Earth default de facto; not gameplay sovereignty or ownership", "boundaryPolicyUrl": LOCK["boundaryPolicyUrl"]},
        "countries": {"count": len(countries), "asset": catalog}, "regions": {"count": len(ids), "countryIndexes": len(grouped)},
        "overviews": overviews, "quality": quality_ref, "inventory": inventory_ref,
        "processing": {"coordinateDecimals": 6, "precisionExceptionsInQualityReport": True, "simplification": "none", "winding": "RFC 7946",
                       "polygonOrRingRemoval": "none", "regionChunkTargetBytes": CHUNK_TARGET, "oversizedSingleFeaturesInQualityReport": True},
        "dataAssets": {"count": len(inventory), "bytes": sum(a["bytes"] for a in inventory), "gzipBytes": sum(a["gzipBytes"] for a in inventory)}}
    write("manifest.json", manifest)
    print(json.dumps({"coverage": coverage, "dataAssets": manifest["dataAssets"], "sourceTopologyIssues": len(quality["sourceTopologyIssues"]),
                      "precisionExceptions": len(quality["precisionExceptions"]), "overviews": overviews}, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, required=True, help="Verified raw-source cache outside shipped assets")
    parser.add_argument("--output-dir", type=Path, default=REPO / f"public/geography/natural-earth-{VERSION}")
    parser.add_argument("--download", action="store_true", help="Download missing files from immutable URLs in sources.lock.json")
    args = parser.parse_args()
    verify_sources(args.source_dir, args.download)
    build(args.source_dir, args.output_dir)
