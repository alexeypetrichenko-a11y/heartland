"""WORLD-05-FINAL: deterministic initial placement of divisions (approved rule P-1). Standard library only.

place(owner, population, movement, counts, frontier_bonus=1.0) -> {province: divisions}, details

  owner        {province_id: country_id} for the playable provinces
  population   {province_id: population}
  movement     [(a, b), ...] land movement links between playable provinces (links.movement)
  counts       {country_id: divisions}

Rule P-1 (owner decision P-1, provisional gameplay configuration; illustrative, not an order of battle):
  1. A country's reachable provinces form the movement component holding most of its provinces (ties: larger
     population). Provinces outside it (islands without a movement link) get no division: sea links are not army
     paths, so a division placed there could never leave.
  2. Each reachable province gets one division.
  3. The remaining divisions follow population x (1 + frontier_bonus x frontier), frontier = 1 when the province has a
     movement link to another country's province; largest-remainder rounding; ties by larger remainder, then larger
     population, then province id. frontier_bonus = 1 is P-1; 0 is the P-0 variant.
The rule depends only on land movement links, so it is independent of any future naval transport or transit rule.
"""


def components(owner, movement):
    adj = {p: set() for p in owner}
    for a, b in movement:
        adj[a].add(b); adj[b].add(a)
    comp = {}
    for p in sorted(owner):
        if p in comp:
            continue
        stack, seen = [p], set()
        while stack:
            x = stack.pop()
            if x not in seen:
                seen.add(x); stack.extend(sorted(adj[x] - seen))
        label = min(seen)
        for x in seen:
            comp[x] = label
    return adj, comp


def place(owner, population, movement, counts, frontier_bonus=1.0):
    adj, comp = components(owner, movement)
    frontier = {p: sorted({owner[q] for q in adj[p] if owner[q] != owner[p]}) for p in owner}
    alloc, reachable = {}, {}
    for country in sorted(counts):
        mine = sorted(p for p in owner if owner[p] == country)
        groups = {}
        for p in mine:
            groups.setdefault(comp[p], []).append(p)
        core = sorted(max(groups.values(), key=lambda ps: (len(ps), sum(population[x] for x in ps), min(ps))))
        n = counts[country]
        if n < len(core):
            raise ValueError(f'{country}: {n} divisions for {len(core)} reachable provinces')
        for p in mine:
            alloc[p] = 1 if p in core else 0
            reachable[p] = p in core
        rest = n - len(core)
        weight = {p: population[p] * (1 + frontier_bonus * (1 if frontier[p] else 0)) for p in core}
        total = sum(weight.values())
        quota = {p: rest * weight[p] / total for p in core}
        for p in core:
            alloc[p] += int(quota[p])
        left = rest - sum(int(q) for q in quota.values())
        for p in sorted(core, key=lambda p: (-(quota[p] - int(quota[p])), -population[p], p))[:left]:
            alloc[p] += 1
    details = {p: {'reachable': reachable[p], 'frontierWith': frontier[p]} for p in sorted(owner)}
    return dict(sorted(alloc.items())), details
