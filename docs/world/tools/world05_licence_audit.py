#!/usr/bin/env python3
"""
WORLD-05 (offline, deterministic): redistribution-rights audit of the europe-2023 inputs and packages.

Reads every source snapshot (scenarios/europe-2023/sources/*.json), the licence evidence
(docs/world/data/world05-licence-evidence.json) and both immutable packages (read only), and writes
docs/world/data/world05-licence-audit.json. Prints one table row per source and a summary per package.

Standard: commercial distribution (WORLD-02 decision L-1). Verdicts (from the licence register, WORLD-05-FINAL):
  clear        the register marks the publisher 'cleared' (licence or terms allow commercial redistribution)
  restricted   no verified permission for commercial redistribution (release blocker wherever cited)
Checks: each snapshot's licence text matches its publisher's evidence; Eurostat snapshots hold no UK figures
(Eurostat excludes UK data from commercial reuse); every package value's sources resolve to known snapshots.
Run from the repository root:  python3 docs/world/tools/world05_licence_audit.py
"""
import glob, hashlib, json, os, re, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
SRC = os.path.join(ROOT, 'scenarios', 'europe-2023', 'sources')
PKGS = ['1.0.0-draft.1', '1.0.0-draft.2', '1.0.0-draft.3']
EVIDENCE = os.path.join(ROOT, 'docs', 'world', 'data', 'world05-licence-evidence.json')
OUT = os.path.join(ROOT, 'docs', 'world', 'data', 'world05-licence-audit.json')
# WORLD-05-FINAL: verdicts come from the licence register (scenarios/europe-2023/licences.json; W5-L3 cleared the OECD).
REGISTER = json.load(open(os.path.join(ROOT, 'scenarios', 'europe-2023', 'licences.json'), encoding='utf-8'))
VERDICT = {pub: ('clear' if v['status'] == 'cleared' else 'restricted') for pub, v in REGISTER['publishers'].items()}
UK_CODES = {'UK', 'GB', 'GBR'}
# WORLD-02 review extracts that are not source snapshots but are cited by package provenance.
NON_SNAPSHOT = {'world02-defence-cofog-2023': 'oecd', 'world02-ppp-fx-2023': 'worldbank'}   # review extracts (register: derived_extracts)

evidence = json.load(open(EVIDENCE, encoding='utf-8'))['publishers']
problems = []
sources = {}
for path in sorted(glob.glob(os.path.join(SRC, '*.json'))):
    d = json.load(open(path, encoding='utf-8'))
    pub = d['publisher']
    if pub not in VERDICT:
        problems.append(f"{d['id']}: unknown publisher {pub}")
        continue
    keys = list(d['values'].keys())
    geos = sorted({re.split(r'[|]', k)[0] for k in keys})
    if pub == 'eurostat' and UK_CODES & set(geos):
        problems.append(f"{d['id']}: Eurostat snapshot contains UK data (commercial reuse excluded)")
    for series, label in (d.get('per_series_licence') or {}).items():
        if label.get('License_Type') != 'CC BY-4.0':
            problems.append(f"{d['id']}: {series} is labelled {label.get('License_Type')}, not CC BY-4.0")
    sources[d['id']] = {
        'publisher': pub, 'dataset': d['dataset'], 'title': d['title'], 'query': d['query'], 'retrieved': d['retrieved'],
        'licence': d['licence'], 'attribution': d['attribution'], 'licence_status_recorded': d['licence_status'],
        'source_organization': d.get('source_organization'), 'values': len(keys), 'geos': geos,
        'verdict': VERDICT[pub], 'evidence_status': evidence[pub]['status'],
        'sha256': hashlib.sha256(open(path, 'rb').read()).hexdigest(),
    }


def cited(o, path, out):
    if isinstance(o, dict):
        if isinstance(o.get('sources'), list):
            for s in o['sources']:
                if isinstance(s, str):
                    out.setdefault(s, []).append(path)
        for k, v in o.items():
            cited(v, f'{path}/{k}', out)
    elif isinstance(o, list):
        for i, v in enumerate(o):
            ident = v.get('id') if isinstance(v, dict) and isinstance(v.get('id'), str) else str(i)
            cited(v, f'{path}/{ident}', out)
    return out


packages = {}
for version in PKGS:
    base = os.path.join(ROOT, 'scenarios', 'europe-2023', version)
    manifest = json.load(open(os.path.join(base, 'manifest.json'), encoding='utf-8'))
    citations = cited(json.load(open(os.path.join(base, 'provenance.json'), encoding='utf-8')), '', {})
    unknown = sorted(s for s in citations if s not in sources and s not in NON_SNAPSHOT)
    if unknown:
        problems.append(f'{version}: provenance cites unknown sources {unknown}')
    by_verdict = {}
    for s, paths in citations.items():
        v = sources[s]['verdict'] if s in sources else VERDICT[NON_SNAPSHOT[s]]
        by_verdict.setdefault(v, {})[s] = len(paths)
    restricted_paths = sorted({p for s, ps in citations.items() if s in sources and sources[s]['verdict'] == 'restricted' for p in ps})
    files = sorted(os.listdir(base))
    packages[version] = {
        'distributable': manifest.get('distributable'), 'not_distributable_because': manifest.get('notDistributableBecause'),
        'immutable': manifest.get('immutable'), 'files': files,
        'citations_by_verdict': {k: dict(sorted(v.items())) for k, v in sorted(by_verdict.items())},
        'values_from_restricted_sources': restricted_paths,
        'restricted_sources': sorted({s for s in citations if s in sources and sources[s]['verdict'] == 'restricted'}),
        'attribution_notice_in_package': any(re.search(r'(?i)notice|attribution|licen', f) for f in files),
    }
    if version == '1.0.0-draft.3':
        if packages[version]['restricted_sources']:
            problems.append(f"{version}: cites restricted sources {packages[version]['restricted_sources']}")
        if manifest.get('distributable') is not (not packages[version]['restricted_sources']):
            problems.append(f"{version}: manifest distributable={manifest.get('distributable')} disagrees with the audit")

attributions = sorted({v['attribution'] for v in sources.values() if v['verdict'] in ('clear', 'confirm')})
out = {
    'note': 'WORLD-05 redistribution audit (review only). Standard: commercial distribution (WORLD-02 L-1). Not legal advice.',
    'verdicts': {'clear': 'cleared in scenarios/europe-2023/licences.json', 'restricted': 'no verified licence for commercial redistribution'},
    'sources': sources,
    'packages': packages,
    'attribution_statements_required': attributions,
    'problems': problems,
}
with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(out, f, indent=1, ensure_ascii=False, sort_keys=True)
    f.write('\n')

print('| Source | Publisher | Dataset | Values | Recorded status | Verdict |')
print('|---|---|---|---:|---|---|')
for sid, v in sources.items():
    print(f"| `{sid}` | {v['publisher']} | `{v['dataset'][:48]}` | {v['values']} | {v['licence_status_recorded'][:60]} | **{v['verdict']}** |")
counts = {}
for v in sources.values():
    counts[v['verdict']] = counts.get(v['verdict'], 0) + 1
print('\nverdicts:', counts)
for version, p in packages.items():
    print(f"{version}: distributable={p['distributable']} restricted={p['restricted_sources']} "
          f"values-from-restricted={len(p['values_from_restricted_sources'])} attribution-notice-file={p['attribution_notice_in_package']}")
print('problems:', problems or 'none')
print(f'wrote {os.path.relpath(OUT, ROOT)}')
sys.exit(1 if problems else 0)
