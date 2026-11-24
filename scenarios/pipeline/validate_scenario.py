#!/usr/bin/env python3
"""
WORLD-03 validation (offline): checks the built scenario and writes a validation report.

  python3 scenarios/pipeline/validate_scenario.py [package-dir]

Checks (each reported as pass / fail / warn):
  G1  61 zones = 46 provinces + 10 neighbours + 5 blocs; ids unique; region ids differ from country ids
  G2  WORLD-02 crosswalk and partition (re-runs docs/world/tools/world02_validate.py)
  G3  Corsica: no land link; maritime links to FRA-SE, ITA-SAR and ITA-CEN
  G4  link sets: no self-links or duplicates; no pair is both land and maritime
  G5  movement links are land links between playable provinces only; no maritime or fixed link is a movement link
  G6  economic graph (land + maritime) connected; each playable country connected by land + maritime
  G7  computed land borders cover every curated WORLD-02 neighbour border
  D1  every mandatory input of the playable countries is data or estimate (never unavailable)
  D2  every value cites at least one source snapshot that exists, and every snapshot has a licence
  D3  licence status of every snapshot (warn when not verified)
  D4  zone inputs finite and positive (population, output target, advantages within the documented range)
  C1  calibration: zone output shares within ±3% (relative)
  C2  calibration: country PPP GDP shares within ±3% (relative)
  C3  calibration: tax and spending ratios within ±1 percentage point
  C4  calibration: debt ratios within ±1 percentage point
  M1  military: draft values only from the approved rule; unresolved countries carry no value
  P1  package: manifest hashes match the files; content fingerprint recomputes (when a package dir is given)
WORLD-03-FINAL packages (calibration mode 'final', e.g. 1.0.0-draft.2) add:
  C5  2023 general-government net lending within ±1 pp where comparable (non-comparable countries listed)
  C6  tariff revenue (customs duties kept by national government) within ±1 pp
  C7  initial financing cost: interest paid within ±0.5 pp of GDP of the observed 2023 value
  C8  scenario-wide dividend income (state ownership scale) within ±0.2 pp of the observed GDP-weighted D42
  D5  every source named by the budget and financing reconciliations exists and has a licence
  P2  the manifest's distributable flag agrees with the licence audit (no unverified licence in a distributable package)
"""
import hashlib, json, math, os, subprocess, sys
from collections import defaultdict

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
BUILD = os.path.join(ROOT, 'scenarios', 'europe-2023', 'build')
SRC = os.path.join(ROOT, 'scenarios', 'europe-2023', 'sources')
CURATED_NEIGHBOUR_LAND = {
    'irl': ['gbr-nir'], 'esp': ['fra-naq', 'fra-occ'], 'nld': ['deu-nrw', 'deu-nor'], 'bel': ['fra-ne', 'deu-nrw', 'deu-mit'],
    'che': ['fra-ara', 'fra-ne', 'deu-bw', 'ita-no'], 'aut': ['deu-by', 'ita-ne'], 'cze': ['deu-by', 'deu-mo', 'pol-pdz', 'pol-pol'],
    'nor': [], 'grc': ['tur-mar'], 'bgr': ['tur-mar'],
}
results = []
def check(code, ok, text, level='fail'):
    results.append({'check': code, 'result': 'pass' if ok else level, 'detail': text})

def load(name, base=BUILD):
    return json.load(open(os.path.join(base, name), encoding='utf-8'))

def main(package=None):
    geo, inputs = load('geography.json'), load('inputs.json')
    if package and os.path.exists(os.path.join(package, 'calibration-report.json')):
        cal = load('calibration-report.json', package)
    else:
        cal = load('calibration.json') if os.path.exists(os.path.join(BUILD, 'calibration.json')) else None
    final = bool(cal) and cal.get('mode') == 'final'
    REPORTED = {'netLending', 'dividends', 'interest', 'tariffRevenue'}
    zones = inputs['zones']; countries = inputs['countries']
    kinds = defaultdict(int)
    for z in zones:
        kinds[z['kind']] += 1
    ids = [z['id'] for z in zones]
    cids = {c['id'] for c in countries}
    check('G1', len(zones) == 61 and kinds == {'province': 46, 'neighbour': 10, 'bloc': 5} and len(set(ids)) == 61 and not (set(ids) & cids),
          f'{len(zones)} zones: {dict(kinds)}; region/country id overlap: {sorted(set(ids) & cids)}')
    w2 = subprocess.run([sys.executable, os.path.join(ROOT, 'docs', 'world', 'tools', 'world02_validate.py')], capture_output=True, text=True)
    check('G2', w2.returncode == 0, w2.stdout.strip().splitlines()[-1] if w2.stdout else w2.stderr[-300:])
    land = {(l['a'], l['b']) for l in geo['land']}
    sea = {(l['a'], l['b']) for l in geo['maritime']}
    move = {(l['a'], l['b']) for l in geo['movement']}
    cor_land = [p for p in land if 'fra-cor' in p]
    cor_sea = sorted(b if a == 'fra-cor' else a for a, b in sea if 'fra-cor' in (a, b))
    check('G3', not cor_land and {'fra-se', 'ita-sar', 'ita-cen'} <= set(cor_sea), f'Corsica land links {cor_land}; maritime links {cor_sea}')
    pairs = [(l['a'], l['b']) for l in geo['land']] + [(l['a'], l['b']) for l in geo['maritime']]
    check('G4', all(a < b for a, b in pairs) and len(pairs) == len(set(pairs)) and not (land & sea),
          f'{len(land)} land, {len(sea)} maritime; overlap {sorted(land & sea)[:3]}')
    kind = {z['id']: z['kind'] for z in zones}
    check('G5', move <= land and all(kind[a] == 'province' and kind[b] == 'province' for a, b in move) and not (move & sea),
          f'{len(move)} movement links, all land links between playable provinces; islands without movement links: '
          f'{sorted(z for z in ("fra-cor", "gbr-nir", "ita-sic", "ita-sar") if not any(z in p for p in move))}')
    graph = defaultdict(set)
    for a, b in land | sea:
        graph[a].add(b); graph[b].add(a)
    def reach(start, allowed):
        seen, stack = set(), [start]
        while stack:
            cur = stack.pop()
            if cur in seen:
                continue
            seen.add(cur)
            stack += [n for n in graph[cur] if n in allowed and n not in seen]
        return seen
    whole = reach(ids[0], set(ids))
    bad = []
    for c in [c for c in countries if c['kind'] == 'playable']:
        own = {z['id'] for z in zones if z['country'] == c['id']}
        if reach(next(iter(sorted(own))), own) != own:
            bad.append(c['id'])
    check('G6', whole == set(ids) and not bad, f'whole graph connected: {whole == set(ids)}; countries not connected internally: {bad}')
    missing = [f'{n}-{p}' for n, plist in CURATED_NEIGHBOUR_LAND.items() for p in plist if tuple(sorted((f'{n}-all', p))) not in land]
    extra = sorted(f'{a}/{b}' for a, b in land if (kind[a], kind[b]) in (('neighbour', 'province'), ('province', 'neighbour'))
                   and not any(f'{n}-all' in (a, b) and p in (a, b) for n, plist in CURATED_NEIGHBOUR_LAND.items() for p in plist))
    check('G7', not missing, f'curated WORLD-02 neighbour borders missing from geometry: {missing}; borders found by geometry beyond the curated list: {extra}')
    # Data
    mandatory = ['tax_income', 'tax_corporate', 'tax_consumption', 'spend_administration', 'spend_social', 'spend_military', 'spend_infrastructure', 'debt']
    gaps = [f'{c["id"]}.{k}' for c in countries if c['kind'] == 'playable' for k in mandatory if c['fiscal'].get(k, {}).get('status', 'unavailable') == 'unavailable']
    check('D1', not gaps, f'playable mandatory fiscal inputs unavailable: {gaps}')
    snapshots = {n[:-5] for n in os.listdir(SRC) if n.endswith('.json')}
    cited, uncited = set(), []
    def walk(node, path):
        if isinstance(node, dict):
            if 'sources' in node and 'status' in node and isinstance(node['sources'], list):
                for sid in node['sources']:
                    cited.add(sid)
                if node['status'] in ('data', 'estimate', 'engine-limit') and not node['sources'] and node.get('value') is not None:
                    uncited.append(path)
            for k, v in node.items():
                walk(v, f'{path}.{k}')
        elif isinstance(node, list):
            for i, v in enumerate(node):
                walk(v, f'{path}[{i}]')
    walk({'zones': zones, 'countries': countries}, '')
    unknown = sorted(cited - snapshots - {'world02-defence-cofog-2023'})
    no_licence = [s for s in snapshots if not load(f'{s}.json', SRC).get('licence')]
    check('D2', not unknown and not uncited and not no_licence, f'{len(cited)} sources cited; unknown {unknown}; values without source {uncited[:5]}; snapshots without licence {no_licence}')
    statuses = {s: load(f'{s}.json', SRC)['licence_status'] for s in sorted(snapshots)}
    unverified = {s: v for s, v in statuses.items() if not v.startswith('verified')}
    check('D3', not unverified, f'snapshots with a licence that is not verified for commercial reuse: {unverified}', level='warn')
    lo, hi = 0.1, 4.0
    bad = [z['id'] for z in zones if not (z['population']['value'] > 0 and z['output_target']['value'] > 0
           and all(lo - 1e-9 <= v <= hi + 1e-9 for k, v in z['advantage']['value'].items()))]
    check('D4', not bad, f'zones with invalid inputs: {bad}')
    # Calibration
    if cal:
        zr = [z for z in cal['zones'] if abs(z['relativeError']) > 0.03]
        check('C1', not zr, f'worst zone output share error {max(abs(z["relativeError"]) for z in cal["zones"]):.2%}; outside ±3%: {[z["id"] for z in zr]}')
        cr = [c for c in cal['countries'] if abs(c['relativeError']) > 0.03]
        check('C2', not cr, f'worst country GDP share error {max(abs(c["relativeError"]) for c in cal["countries"]):.2%}; outside ±3%: {[c["id"] for c in cr]}')
        flows = [(f['id'], r['field'], r['achieved'] - r['target']) for f in cal['fiscal'] for r in f['rows'] if r['target'] is not None and r['field'] != 'debtToGdp' and r['field'] not in REPORTED]
        fbad = [f'{a}.{b} {g * 100:+.1f}' for a, b, g in flows if abs(g) > 0.01]
        check('C3', not fbad, f'{len(flows)} tax/spending ratios; outside ±1 pp: {fbad}')
        debts = [(f['id'], r['achieved'] - r['target']) for f in cal['fiscal'] for r in f['rows'] if r['target'] is not None and r['field'] == 'debtToGdp']
        dbad = [f'{a} {g * 100:+.0f}' for a, g in debts if abs(g) > 0.01]
        check('C4', not dbad, f'{len(debts)} debt ratios; outside ±1 pp: {dbad}')
        if final:
            rows = lambda field: [(f['id'], r) for f in cal['fiscal'] for r in f['rows'] if r['field'] == field]
            nl = [(c, r['achieved'] - r['target']) for c, r in rows('netLending') if r['target'] is not None]
            nbad = [f'{c} {g * 100:+.2f}' for c, g in nl if abs(g) > 0.01]
            worst = max(nl, key=lambda x: abs(x[1]))
            check('C5', not nbad, f'{len(nl)} net-lending balances; worst {worst[0]} {worst[1] * 100:+.2f} pp; outside ±1 pp: {nbad}; not comparable: {cal.get("nonComparableBalance")}')
            tr = [(c, r['achieved'] - r['target']) for c, r in rows('tariffRevenue') if r['target'] is not None]
            check('C6', all(abs(g) <= 0.01 for _, g in tr), f'{len(tr)} tariff revenues; worst {max(abs(g) for _, g in tr) * 100:.3f} pp')
            it = [(c, r['achieved'] - r['target']) for c, r in rows('interest') if r['target'] is not None]
            ibad = [f'{c} {g * 100:+.2f}' for c, g in it if abs(g) > 0.005]
            check('C7', not ibad, f'{len(it)} interest bills; worst {max(abs(g) for _, g in it) * 100:.2f} pp; outside ±0.5 pp: {ibad}')
            last = cal['ownershipRounds'][-1] if cal.get('ownershipRounds') else None
            best = next((o for o in cal.get('ownershipRounds', []) if abs(o['scale'] - cal['ownershipScale']) < 1e-12), last)
            check('C8', best is not None and abs(best['achieved'] - best['target']) <= 0.002,
                  f'ownership scale {cal["ownershipScale"]:.4f}: dividends {best["achieved"] * 100:.2f}% vs observed {best["target"] * 100:.2f}% of GDP (GDP-weighted, excluding non-comparable)' if best else 'no ownership fit')
    else:
        check('C1', False, 'no calibration.json')
    mil = inputs['military']['countries']
    unresolved = [c for c, v in mil.items() if v['status'] == 'unresolved']
    check('M1', all(v['divisions'] is None for v in mil.values() if v['status'] == 'unresolved') and all(v['status'] in ('draft', 'unresolved') for v in mil.values()),
          f'draft: {sorted(c for c, v in mil.items() if v["status"] == "draft")}; unresolved (no value inserted): {unresolved}')
    if final:
        named, missing, no_lic = set(), [], []
        def grab(node):
            if isinstance(node, dict):
                for k, v in node.items():
                    if k in ('sources', 'source') and isinstance(v, list): named.update(x for x in v if isinstance(x, str))
                    else: grab(v)
            elif isinstance(node, list):
                for v in node: grab(v)
        grab(load('budget.json')); grab(load('financing.json'))
        for sid in sorted(named):
            path = os.path.join(SRC, f'{sid}.json')
            if not os.path.exists(path): missing.append(sid)
            elif not json.load(open(path, encoding='utf-8')).get('licence'): no_lic.append(sid)
        check('D5', not missing and not no_lic, f'{len(named)} sources named by budget/financing; missing {missing}; without licence {no_lic}')
    if package:
        manifest = json.load(open(os.path.join(package, 'manifest.json'), encoding='utf-8'))
        if 'distributable' in manifest:
            prov = json.load(open(os.path.join(package, 'provenance.json'), encoding='utf-8'))
            unverified = [l['id'] for l in prov.get('licences', []) if not str(l['licenceStatus']).startswith('verified')]
            check('P2', manifest['distributable'] == (not unverified),
                  f'distributable={manifest["distributable"]}; unverified licences: {unverified}; reasons in manifest: {manifest.get("notDistributableBecause")}')
        mism = [f['path'] for f in manifest['files'] if hashlib.sha256(open(os.path.join(package, f['path']), 'rb').read()).hexdigest() != f['sha256']]
        fp = hashlib.sha256(''.join(f'{f["path"]}:{f["sha256"]}\n' for f in sorted(manifest['files'], key=lambda f: f['path'])).encode()).hexdigest()
        check('P1', not mism and fp == manifest['contentFingerprint'], f'files {len(manifest["files"])}; hash mismatches {mism}; fingerprint {fp[:16]}')
    out = {'scenario': 'europe-2023', 'results': results,
           'summary': {k: sum(1 for r in results if r['result'] == k) for k in ('pass', 'warn', 'fail')}}
    target = package or BUILD
    with open(os.path.join(target, 'validation-report.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1); f.write('\n')
    for r in results:
        print(f'{r["check"]:<3} {r["result"].upper():<4} {r["detail"][:230]}')
    print(out['summary'])
    return out

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else None)
