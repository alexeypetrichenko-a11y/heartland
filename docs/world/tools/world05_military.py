#!/usr/bin/env python3
"""
WORLD-05-FINAL (offline, deterministic): military initialisation summary for europe-2023 1.0.0-draft.3.

Reads scenarios/europe-2023/build-licensed/inputs.json (licence-clean: approved Rule W counts for five countries, the
documented gameplay assumption for Türkiye, P-1 placement) and build/geography.json, recomputes the placement with the
pipeline's own function (scenarios/pipeline/military_placement.py) for P-1 and, for comparison, P-0, and writes
docs/world/data/world05-military-proposal.json: counts, placement per province, frontier balance and movement theatres.
No restricted value is read or written (the Ministry inputs of Rule W for Türkiye stay out of the repository, R-1).

Run from the repository root:  python3 docs/world/tools/world05_military.py
"""
import importlib.util, json, os, sys

sys.dont_write_bytecode = True
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
spec = importlib.util.spec_from_file_location('military_placement', os.path.join(ROOT, 'scenarios', 'pipeline', 'military_placement.py'))
mp = importlib.util.module_from_spec(spec); spec.loader.exec_module(mp)
inputs = json.load(open(os.path.join(ROOT, 'scenarios', 'europe-2023', 'build-licensed', 'inputs.json'), encoding='utf-8'))
geo = json.load(open(os.path.join(ROOT, 'scenarios', 'europe-2023', 'build', 'geography.json'), encoding='utf-8'))
OUT = os.path.join(ROOT, 'docs', 'world', 'data', 'world05-military-proposal.json')

zones = [z for z in inputs['zones'] if z['kind'] == 'province']
owner = {z['id']: z['country'] for z in zones}
population = {z['id']: z['population']['value'] for z in zones}
name = {z['id']: z['name'] for z in zones}
movement = [(l['a'], l['b']) for l in geo['movement']]
mil = inputs['military']
counts = {c: v['divisions'] for c, v in mil['countries'].items()}
plans = {v: mp.place(owner, population, movement, counts, b)[0] for v, b in (('P-1', 1.0), ('P-0', 0.0))}
_, details = mp.place(owner, population, movement, counts, 1.0)
if plans['P-1'] != mil['placement']['byRegion']:
    sys.exit('P-1 placement differs from build-licensed/inputs.json')

adj, comp = mp.components(owner, movement)
frontiers = {}
for v, alloc in plans.items():
    pairs = {}
    for a, b in sorted(movement):
        if owner[a] != owner[b]:
            pairs.setdefault('-'.join(sorted((owner[a], owner[b]))), set()).update((a, b))
    frontiers[v] = {k: {c: sum(alloc[p] for p in sorted(ps) if owner[p] == c) for c in k.split('-')} for k, ps in sorted(pairs.items())}
groups = {}
for p, label in comp.items():
    groups.setdefault(label, set()).add(p)
theatres = [{'provinces': len(ps), 'countries': sorted({owner[p] for p in ps}),
             'divisions_if_shared': sum(counts[c] for c in sorted({owner[p] for p in ps})) if len({owner[p] for p in ps}) > 1 else None,
             'members': sorted(ps) if len(ps) <= 3 else None} for ps in sorted(groups.values(), key=lambda s: (-len(s), min(s)))]
out = {
    'note': 'WORLD-05-FINAL military initialisation (europe-2023 1.0.0-draft.3). Illustrative gameplay configuration, not a historical order of battle.',
    'parameter_personnel_equivalents_per_division': 25000,
    'counts': {c: {'divisions': v['divisions'], 'personnel_equivalents': v['personnel_equivalents'], 'status': v['status'], 'method': v['method']}
               for c, v in mil['countries'].items()},
    'total_divisions': sum(counts.values()),
    'placement': {v: {p: {'country': owner[p], 'name': name[p], 'divisions': alloc[p], 'population_m': round(population[p], 3), **details[p]}
                      for p in sorted(alloc)} for v, alloc in plans.items()},
    'frontier_divisions': frontiers,
    'movement_theatres': theatres,
}
with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(out, f, indent=1, ensure_ascii=False, sort_keys=True)
    f.write('\n')
print('counts:', counts, 'total', out['total_divisions'])
for v, alloc in plans.items():
    print(v, {c: ' '.join(f"{p.split('-', 1)[1]}={alloc[p]}" for p in sorted(alloc) if owner[p] == c) for c in sorted(counts)})
    print('   frontiers:', frontiers[v])
print('theatres:', [(t['provinces'], t['countries']) for t in theatres])
print(f'wrote {os.path.relpath(OUT, ROOT)}')
