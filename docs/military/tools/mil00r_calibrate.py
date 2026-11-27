"""MIL-00R-DESIGN calibration: military manpower recovery and replenishment.

Standalone and deterministic (standard library only). Run from the repository root with Python 3.10+:

    python3 docs/military/tools/mil00r_calibrate.py            # tables
    python3 docs/military/tools/mil00r_calibrate.py --json OUT  # also write the results as JSON

Inputs, read only: the immutable europe-2023 1.0.0-draft.3 package (starting forces, provincial
population, military budget shares) and the WORLD-02 defence extract (Eurostat and OECD, both cleared
for redistribution). No restricted dataset is read.

Combat uses the approved MIL-00 arithmetic exactly as PR #41's resolver applies it: retreat is judged
against each division's retained readiness baseline, not against its strength at commitment.

Every recovery parameter below is an illustrative proposal for owner review. None is adopted.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import asdict, dataclass, replace

sys.dont_write_bytecode = True   # importing the MIL-00 harness must not leave a __pycache__ in the repository
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, HERE)
from mil00_calibrate import Division as Mil00Division, fight  # noqa: E402  (approved MIL-00 harness)

PACKAGE = os.path.join(ROOT, 'scenarios', 'europe-2023', '1.0.0-draft.3', 'scenario.json')
DEFENCE = os.path.join(ROOT, 'docs', 'world', 'data', 'world02-defence-cofog-2023.json')
FULL = 25000                 # approved full strength of a division (M-2)
LABOUR_PARTICIPATION = 0.48  # economy-engine default (src/config/defaults.ts)
HORIZONS = (52, 104, 156)


# ---------------------------------------------------------------- approved MIL-00 combat (PR #41)
@dataclass(frozen=True)
class Land:
    base_loss: int = 300
    max_loss: int = 600
    defence: int = 115
    retreat: int = 80
    pace: int = 45
    breakthrough: int = 100


LAND = Land()


@dataclass
class Unit:
    side: str
    manpower: int = FULL
    baseline: int = FULL
    eligible_week: int = 1     # earliest week of a new commitment (retreat in W -> W + 2)
    priority: int = 1          # 0 refit first, 1 normal, 2 hold
    engaged: bool = False
    released: int = 0          # week the unit last left combat (replacements start the week after)


class Front:
    """One assault front, settled one week at a time exactly as resolveStrategicLand does."""

    def __init__(self, attackers: list[Unit], defenders: list[Unit]):
        self.sides = (attackers, defenders)
        self.progress = 0
        self.weeks = 0
        self.lost = [0, 0]
        for unit in attackers + defenders:
            unit.engaged = True

    def round(self, rules: Land = LAND) -> str | None:
        att, dfn = self.sides
        a = sum(u.manpower for u in att)
        d = sum(u.manpower for u in dfn) * rules.defence // 100
        if not a or not d:
            return 'ended'
        rates = (min(rules.max_loss, rules.base_loss * d // a), min(rules.max_loss, rules.base_loss * a // d))
        for side, units in enumerate(self.sides):
            for unit in units:
                amount = unit.manpower * rates[side] // 10000
                unit.manpower -= amount
                self.lost[side] += amount
        swing = rules.pace * abs(a - d) // (a + d)
        self.progress = max(-rules.breakthrough, min(rules.breakthrough, self.progress + (swing if a >= d else -swing)))
        self.weeks += 1
        qualifies = [
            (-self.progress if side == 0 else self.progress) >= rules.breakthrough
            or 100 * sum(u.manpower for u in units) <= rules.retreat * sum(u.baseline for u in units)
            for side, units in enumerate(self.sides)
        ]
        if qualifies[0]:
            return 'repelled'
        if qualifies[1]:
            return 'captured'
        return None


def close(front: Front, outcome: str, week: int) -> None:
    """Retreating sides lose eligibility for one full recovery week (approved: earliest recommitment W + 2)."""
    for side, units in enumerate(front.sides):
        retreating = (side == 0 and outcome == 'repelled') or (side == 1 and outcome == 'captured')
        for unit in units:
            unit.engaged = False
            unit.released = week
            if retreating:
                unit.eligible_week = week + 2


def offensive_ready(unit: Unit, week: int, threshold: int) -> bool:
    """PR #41 rule is threshold 80 with a strict comparison; MIL-00R proposes a higher, inclusive bar."""
    if week < unit.eligible_week:
        return False
    if threshold == LAND.retreat:
        return 100 * unit.manpower > LAND.retreat * unit.baseline
    return 100 * unit.manpower >= threshold * unit.baseline


# ---------------------------------------------------------------- country data (draft.3, read only)
def countries() -> dict[str, dict]:
    package = json.load(open(PACKAGE, encoding='utf-8'))
    defence = json.load(open(DEFENCE, encoding='utf-8'))['defence_cofog_GF02']['values']
    population: dict[str, float] = {}
    for region in package['regions']:
        if region['kind'] == 'province':
            population[region['ownerId']] = population.get(region['ownerId'], 0.0) + package['economy']['regions'][region['id']]['population']
    out = {}
    for cid, forces in package['military']['countries'].items():
        iso3 = next(c['iso3'] for c in package['countries'] if c['id'] == cid)
        row = defence.get(iso3)
        out[cid] = {
            'divisions': forces['divisions'],
            'rule_w_personnel_equivalents': forces['personnel_equivalents'],
            'forces_status': forces['status'],
            'population_m': round(population[cid], 3),
            'military_share_gdp': package['economy']['countries'][cid]['spendMilitary'],
            'defence_pay_share': round(row['D1'] / row['OTE'], 3) if row else None,
        }
    return out


# ---------------------------------------------------------------- recovery alternatives
@dataclass(frozen=True)
class Params:
    """Illustrative proposals (owner decisions R-1 to R-12), never adopted values."""
    absorb: float = 0.10          # replacements one division can absorb per week, share of baseline
    offensive: int = 90           # % of baseline needed to volunteer for a new attack or reinforcement
    training_weeks: int = 12      # B, C: weeks from recruitment to trained replacement
    depot: float = 0.02           # B, C: trained replacements available at match start, share of establishment
    intake: float = 0.0025        # B, C: weekly training intake capacity, share of establishment ("Replace losses")
    surge_intake: float = 0.005   # B, C: weekly intake under "Surge"
    cost: float = 1.0             # one-time cost per replacement, in years of the military budget per PE
    surge_cost: float = 1.5       # cost multiplier for accelerated "Surge" recruitment
    pool: float = 0.01            # B, C: recruitable manpower without general mobilisation, share of population
    surge_pool: float = 0.02      # B, C: recruitable manpower under "Surge"
    surge_depot: float = 0.05     # B, C: extra trained replacements kept ready under "Surge", share of establishment
    default_pay_share: float = 0.35  # economy-engine militaryPayShare, used where no defence pay data exist (Türkiye)
    budget_a: float = 0.10        # A: replacement budget per year, share of the annual military budget
    wounded: float = 0.35         # C: share of losses returning to duty
    wounded_weeks: int = 8        # C: weeks before they return
    equipment: float = 0.03       # C: equipment sets in store at start, share of establishment
    equipment_rate: float = 0.002  # C: equipment sets produced per week, share of establishment


P0 = Params()


def share(available: int, requests: list[int]) -> list[int]:
    """Proportional and permutation-invariant: floor shares, the remainder stays where it was."""
    total = sum(requests)
    if total <= available:
        return list(requests)
    return [available * r // total for r in requests]


class Recovery:
    """One country's replacement system. `model` is none, A, B or C; `policy` is off, replace or surge.

    The establishment is the force on the map (divisions x 25,000). The military budget already pays it,
    so refilling vacancies adds no recurring pay; each replacement only carries a one-time cost.
    """

    def __init__(self, model: str, country: dict, params: Params = P0, policy: str = 'replace'):
        self.model, self.params, self.policy = model, params, policy
        self.establishment = country['divisions'] * FULL
        self.population = round(country['population_m'] * 1_000_000)
        surge = policy == 'surge'
        self.depot = int(self.establishment * params.depot) if model in ('B', 'C') else 0
        self.funded = self.establishment + self.depot             # paid by the existing military budget
        self.depot_target = self.depot + (int(self.establishment * params.surge_depot) if surge else 0)
        self.pay_share = country['defence_pay_share'] or params.default_pay_share
        self.recurring = 0.0      # extra pay for personnel above the funded strength, in annual military budgets
        self.pipeline = [0] * params.training_weeks
        self.pool_start = int(self.population * (params.surge_pool if surge else params.pool))
        self.pool = self.pool_start
        self.intake_cap = int(self.establishment * (params.surge_intake if surge else params.intake))
        self.unit_cost = params.cost * (params.surge_cost if surge else 1.0)   # years of military budget per PE
        self.budget_a = int(self.establishment * params.budget_a / 52 / params.cost)  # A: PE funded per week
        self.returning = [0] * params.wounded_weeks
        self.equipment = int(self.establishment * params.equipment)
        self.equipment_rate = int(self.establishment * params.equipment_rate)
        self.recruited = 0        # people taken from the civilian labour force (incremental mobilisation)
        self.replaced = 0
        self.spent = 0.0          # one-time cost, in annual military budgets

    def cost(self, pe: int) -> float:
        """One-time cost of `pe` replacements as a share of the annual military budget."""
        return pe * self.unit_cost / self.establishment

    def recruit(self, in_service: int) -> None:
        """Week start, frozen state: replace losses and top the depot up; no new divisions in MIL-00R v1.
        Personnel above the funded strength (Surge only) are paid on top of the military budget."""
        if self.model not in ('B', 'C'):
            return
        held = in_service + self.depot + sum(self.pipeline) + sum(self.returning)
        excess = max(0, held - self.funded)
        cost = excess * self.pay_share / self.establishment / 52
        self.recurring += cost
        self.spent += cost
        if self.policy == 'off':
            self.pipeline.append(0)
            return
        gap = self.establishment + self.depot_target - held
        intake = max(0, min(gap, self.intake_cap, self.pool))
        self.pool -= intake
        self.pipeline.append(intake)
        self.recruited += intake
        self.spent += self.cost(intake)

    def graduate(self) -> None:
        if self.model in ('B', 'C'):
            self.depot += self.pipeline.pop(0)
        if self.model == 'C':
            self.depot += self.returning.pop(0)
            self.returning.append(0)
            self.equipment += self.equipment_rate

    def record_losses(self, lost: int) -> None:
        if self.model == 'C':
            self.returning[-1] += lost * round(self.params.wounded * 100) // 100

    def supply(self) -> int:
        """Replacements that can be handed out this week."""
        if self.model == 'A':
            return self.budget_a
        if self.model == 'B':
            return self.depot
        if self.model == 'C':
            return min(self.depot, self.equipment)
        return 0

    def issue(self, amount: int) -> None:
        if self.model == 'A':
            self.spent += self.cost(amount)
        elif self.model in ('B', 'C'):
            self.depot -= amount
            if self.model == 'C':
                self.equipment -= amount
        self.replaced += amount

    def allocate(self, units: list[Unit], week: int) -> None:
        """After combat: refit units that are not engaged and did not leave combat this week, by priority tier."""
        available = self.supply()
        for tier in (0, 1):
            group = [u for u in units if u.priority == tier and not u.engaged and u.released < week
                     and 0 < u.manpower < u.baseline]
            requests = [min(u.baseline - u.manpower, int(u.baseline * self.params.absorb)) for u in group]
            grants = share(available, requests)
            for unit, grant in zip(group, grants):
                unit.manpower += grant
            available -= sum(grants)
            self.issue(sum(grants))


# ---------------------------------------------------------------- experiments
def principal_cases() -> list[dict]:
    """Fresh units: the PR #41 mirror must reproduce the approved MIL-00 calibration exactly."""
    rows = []
    for a, d in ((1, 1), (1, 2), (1, 3), (2, 2), (3, 1), (3, 2)):
        att, dfn = [Unit('X') for _ in range(a)], [Unit('Y') for _ in range(d)]
        front, outcome = Front(att, dfn), None
        while outcome is None:
            outcome = front.round()
        reference = fight(tuple(Mil00Division(f'a{i}', 'w') for i in range(a)), tuple(Mil00Division(f'b{i}', 'c') for i in range(d)))
        assert (front.weeks, front.lost[0], front.lost[1]) == reference[:3], (a, d)
        rows.append({'case': f'{a}v{d}', 'weeks': front.weeks, 'attacker_loss': front.lost[0], 'defender_loss': front.lost[1], 'outcome': outcome})
    return rows


def reentry() -> list[dict]:
    """A repelled division re-attacks a fresh defender at different strengths (baseline 25,000)."""
    rows = []
    for strength in (20001, 21250, 22500, 23750, 25000):
        att, dfn = Unit('X', manpower=strength), Unit('Y')
        front, outcome = Front([att], [dfn]), None
        while outcome is None:
            outcome = front.round()
        rows.append({'reentry': strength, 'share': round(100 * strength / FULL, 1), 'weeks_fought': front.weeks,
                     'attacker_loss': front.lost[0], 'defender_loss': front.lost[1], 'progress': front.progress, 'outcome': outcome})
    return rows


def repelled_formation(country: dict, model: str, params: Params = P0, policy: str = 'replace') -> dict:
    """The MIL-00-ENGINE case: 1 v 1, attacker repelled in week 7 with 19,417, then left to recover."""
    rec = Recovery(model, country, params, policy)
    att, dfn = Unit('X'), Unit('Y')
    front, rest = Front([att], [dfn]), rec.establishment - FULL     # the rest of the army stays at full strength
    marks: dict = {'model': model, 'policy': policy}
    for week in range(1, 157):
        rec.recruit(att.manpower + rest)
        if front is not None:
            before = front.lost[0]
            outcome = front.round()
            rec.record_losses(front.lost[0] - before)
            if outcome:
                close(front, outcome, week)
                marks['repelled_week'], marks['repelled_strength'] = week, att.manpower
                front = None
        rec.graduate()
        rec.allocate([att], week)
        for threshold in sorted({80, 85, 90, params.offensive}):
            if f'ready_{threshold}' not in marks and front is None and offensive_ready(att, week + 1, threshold):
                marks[f'ready_{threshold}'] = week + 1
        if 'full' not in marks and front is None and att.manpower >= FULL:
            marks['full'] = week + 1
        if week in HORIZONS:
            marks[f'w{week}'] = {'manpower': att.manpower, 'can_attack_now': offensive_ready(att, week + 1, LAND.retreat),
                                 'can_attack_proposed': offensive_ready(att, week + 1, params.offensive)}
    marks['cost_share_of_annual_military_budget'] = round(rec.spent, 5)
    marks['cost_share_of_gdp'] = round(rec.spent * country['military_share_gdp'], 7)
    marks['recruited'] = rec.recruited
    marks['depot_start'] = int(rec.establishment * params.depot) if model in ('B', 'C') else 0
    return marks


def campaign(country_x: dict, country_y: dict, model: str, params: Params = P0, k: int = 3, j: int = 2,
             policy: str = 'replace', defender: str = 'fresh', attack_at: int = 100, weeks: int = 156) -> dict:
    """X attacks with k divisions once all are eligible and at least `attack_at`% of baseline (100: fully
    refitted, a sensible player; 0: as soon as the eligibility bar allows).

    defender='fresh': every assault meets j full-strength defenders (Y has deep reserves: X's hardest case).
    defender='rotating': Y alternates two groups of j divisions. After a capture the beaten group refits in the
    rear and the other group holds the next region. Both sides use the same recovery model.
    With no recovery the current PR #41 bar (above 80%) applies; otherwise params.offensive.
    """
    rx, ry = Recovery(model, country_x, params, policy), Recovery(model, country_y, params, policy)
    xs = [Unit('X') for _ in range(k)]
    groups = [[Unit('Y') for _ in range(j)] for _ in range(2)]
    holding = 0
    rest_x, rest_y = rx.establishment - k * FULL, ry.establishment - 2 * j * FULL
    bar = LAND.retreat if model == 'none' else params.offensive
    front, captures, assaults, out = None, 0, 0, {}
    for week in range(1, weeks + 1):
        rx.recruit(sum(u.manpower for u in xs) + rest_x)
        ry.recruit(sum(u.manpower for g in groups for u in g) + rest_y)
        if front is None and all(offensive_ready(u, week, bar) and 100 * u.manpower >= attack_at * u.baseline for u in xs) \
                and (model != 'none' or week == 1 or attack_at == 0):
            if defender == 'fresh':
                groups[holding] = [Unit('Y') for _ in range(j)]
            front, assaults = Front(xs, groups[holding]), assaults + 1
        if front is not None:
            before = list(front.lost)
            outcome = front.round()
            rx.record_losses(front.lost[0] - before[0])
            ry.record_losses(front.lost[1] - before[1])
            if outcome:
                close(front, outcome, week)
                if outcome == 'captured':
                    captures += 1
                    holding = 1 - holding if defender == 'rotating' else holding
                front = None
        rx.graduate()
        ry.graduate()
        rx.allocate(xs, week)
        if defender == 'rotating':
            ry.allocate(groups[0] + groups[1], week)
        if week in HORIZONS:
            out[f'w{week}'] = {
                'assaults': assaults, 'captures': captures,
                'x_share_of_full': round(sum(u.manpower for u in xs) / (k * FULL), 3),
                'x_ready': front is None and all(offensive_ready(u, week + 1, bar) for u in xs),
                'y_share_of_full': round(sum(u.manpower for g in groups for u in g) / (2 * j * FULL), 3) if defender == 'rotating' else None,
                'x_replaced': rx.replaced, 'x_recruited': rx.recruited, 'x_depot': rx.depot,
                'x_cost_military_budget': round(rx.spent, 4), 'x_cost_gdp': round(rx.spent * country_x['military_share_gdp'], 6),
            }
    return {'model': model, 'policy': policy, 'k': k, 'j': j, 'defender': defender, 'offensive_bar': bar, 'attack_at': attack_at, **out}


def national_attrition(country: dict, model: str, fronts: int, params: Params = P0, policy: str = 'replace',
                       weekly_loss: int = 798) -> dict:
    """Sustained losses: `fronts` engagements, each costing `weekly_loss` PE a week (the 1 v 1 attacker average,
    5,583 / 7). One division per front is out of the line refitting, so absorption allows `fronts` x 2,500."""
    rec = Recovery(model, country, params, policy)
    backlog, lost_total, out = 0, 0, {}
    labour = country['population_m'] * 1_000_000 * LABOUR_PARTICIPATION
    for week in range(1, 157):
        rec.recruit(rec.establishment - backlog)
        loss = fronts * weekly_loss
        backlog += loss
        lost_total += loss
        rec.record_losses(loss)
        rec.graduate()
        grant = min(backlog, rec.supply(), fronts * int(FULL * params.absorb))
        rec.issue(grant)
        backlog -= grant
        if week in HORIZONS:
            out[f'w{week}'] = {
                'replaced_share': round(rec.replaced / lost_total, 3),
                'backlog_share_of_establishment': round(backlog / rec.establishment, 3),
                'cost_gdp_per_year': round(rec.spent * country['military_share_gdp'] * 52 / week, 5),
                'cost_military_budget_per_year': round(rec.spent * 52 / week, 4),
                'labour_withdrawn_share': round(rec.recruited / labour, 5),
                'pool_left_share': round(rec.pool / rec.pool_start, 3) if model in ('B', 'C') and rec.pool_start else None,
            }
    return {'model': model, 'policy': policy, 'fronts': fronts, **out}


def sensitivity(country: dict) -> list[dict]:
    rows = []
    variants = [
        ('proposal P0', P0),
        ('training 6 weeks', replace(P0, training_weeks=6)), ('training 26 weeks', replace(P0, training_weeks=26)),
        ('absorb 5% / week', replace(P0, absorb=0.05)), ('absorb 20% / week', replace(P0, absorb=0.20)),
        ('no starting depot', replace(P0, depot=0.0)), ('depot 5%', replace(P0, depot=0.05)),
        ('intake 0.125% / week', replace(P0, intake=0.00125)), ('intake 0.5% / week', replace(P0, intake=0.005)),
        ('offensive bar 80%', replace(P0, offensive=80)), ('offensive bar 85%', replace(P0, offensive=85)),
        ('cost 0.5 years', replace(P0, cost=0.5)), ('cost 2 years', replace(P0, cost=2.0)),
    ]
    for label, params in variants:
        rf = repelled_formation(country, 'B', params)
        cp = campaign(country, country, 'B', params)
        cr = campaign(country, country, 'B', params, defender='rotating')
        na = national_attrition(country, 'B', 3, params)
        rows.append({
            'variant': label,
            'repelled_ready_week': rf.get(f'ready_{params.offensive}'), 'repelled_full_week': rf.get('full'),
            'fresh_captures_52_104_156': [cp[f'w{h}']['captures'] for h in HORIZONS],
            'rotating_captures_52_104_156': [cr[f'w{h}']['captures'] for h in HORIZONS],
            'fresh_cost_military_budget_156': cp['w156']['x_cost_military_budget'],
            'three_fronts_replaced_156': na['w156']['replaced_share'],
            'three_fronts_cost_gdp_per_year': na['w156']['cost_gdp_per_year'],
        })
    return rows


def complexity() -> list[dict]:
    """Counted from the sketches in this file and MIL-00R-DESIGN.md (state is per country / per division)."""
    return [
        {'alternative': 'A', 'country_state': 1, 'division_state': 1, 'parameters': 4, 'player_controls': 2, 'new_data': 'none'},
        {'alternative': 'B', 'country_state': 4, 'division_state': 1, 'parameters': 10, 'player_controls': 2, 'new_data': 'none'},
        {'alternative': 'C', 'country_state': 9, 'division_state': 4, 'parameters': 18, 'player_controls': 5,
         'new_data': 'age structure (Eurostat, cleared); equipment inventories and reserve strengths (IISS, SIPRI: restricted)'},
    ]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--json')
    args = parser.parse_args()
    data = countries()
    fra = data['fra']
    small = {'divisions': 3, 'rule_w_personnel_equivalents': 75000, 'forces_status': 'synthetic', 'population_m': 8.6,
             'military_share_gdp': 0.018, 'defence_pay_share': None}
    results: dict = {'params_P0': asdict(P0), 'countries': data, 'synthetic_small': small}
    results['principal_cases'] = principal_cases()
    results['reentry'] = reentry()
    results['repelled_formation'] = [repelled_formation(fra, m, P0, p) for m, p in
                                     (('none', 'replace'), ('A', 'replace'), ('B', 'off'), ('B', 'replace'), ('B', 'surge'), ('C', 'replace'))]
    results['repelled_formation_by_country'] = {cid: repelled_formation(c, 'B') for cid, c in {**data, 'small': small}.items()}
    variants = (('none', 'replace'), ('A', 'replace'), ('B', 'off'), ('B', 'replace'), ('B', 'surge'), ('C', 'replace'))
    results['campaign_fresh_3v2'] = [campaign(fra, fra, m, P0, policy=p) for m, p in variants]
    results['campaign_rotating_3v2'] = [campaign(fra, fra, m, P0, policy=p, defender='rotating') for m, p in variants]
    results['campaign_fresh_1v1'] = [campaign(fra, fra, m, P0, k=1, j=1, policy=p) for m, p in variants]
    results['campaign_fresh_3v2_attack_when_eligible'] = [campaign(fra, fra, m, P0, policy=p, attack_at=0) for m, p in variants]
    results['national_attrition'] = {
        cid: [national_attrition(c, m, f, P0, p) for m, p in (('A', 'replace'), ('B', 'off'), ('B', 'replace'), ('B', 'surge'), ('C', 'replace'))
              for f in (1, 3, 6)]
        for cid, c in {**data, 'small': small}.items()}
    results['sustainable_fronts'] = {
        cid: {'replace': round(int(c['divisions'] * FULL * P0.intake) / 798, 2), 'surge': round(int(c['divisions'] * FULL * P0.surge_intake) / 798, 2),
              'intake_per_week_replace': int(c['divisions'] * FULL * P0.intake), 'depot_start': int(c['divisions'] * FULL * P0.depot),
              'replacement_cost_gdp_per_division': round(FULL * P0.cost / (c['divisions'] * FULL) * c['military_share_gdp'], 6)}
        for cid, c in {**data, 'small': small}.items()}
    results['sensitivity_fra'] = sensitivity(fra)
    results['complexity'] = complexity()

    # Deterministic: a second run gives byte-identical results.
    again = json.dumps({'a': [repelled_formation(fra, 'B'), campaign(fra, fra, 'C'), national_attrition(fra, 'B', 3)]}, sort_keys=True)
    assert again == json.dumps({'a': [repelled_formation(fra, 'B'), campaign(fra, fra, 'C'), national_attrition(fra, 'B', 3)]}, sort_keys=True)
    none = results['repelled_formation'][0]
    assert none['repelled_strength'] == 19417 and not any(none[f'w{h}']['can_attack_now'] for h in HORIZONS)

    print('Principal cases (PR #41 mirror = approved MIL-00):', ', '.join(f"{r['case']} {r['weeks']}w {r['attacker_loss']}/{r['defender_loss']}" for r in results['principal_cases']))
    print('\nRe-entry vs a fresh defender | weeks fought | attacker loss | outcome')
    for r in results['reentry']:
        print(f"{r['reentry']:>6} ({r['share']}%) | {r['weeks_fought']} | {r['attacker_loss']} | {r['outcome']}")
    print('\nRepelled formation (France) | ready 80% | ready 90% | full | w52 / w104 / w156 manpower | cost % mil. budget')
    for r in results['repelled_formation']:
        print(f"{r['model']} {r['policy']} | {r.get('ready_80')} | {r.get('ready_90')} | {r.get('full')} | "
              f"{r['w52']['manpower']} / {r['w104']['manpower']} / {r['w156']['manpower']} | {100 * r['cost_share_of_annual_military_budget']:.2f}")
    for key in ('campaign_fresh_3v2', 'campaign_rotating_3v2', 'campaign_fresh_1v1', 'campaign_fresh_3v2_attack_when_eligible'):
        print(f'\n{key} (France data) | assaults w52/w104/w156 | captures w52/w104/w156 | X strength w156 | X cost % mil. budget w156')
        for r in results[key]:
            print(f"{r['model']} {r['policy']} | " + ' / '.join(str(r[f'w{h}']['assaults']) for h in HORIZONS) + ' | '
                  + ' / '.join(str(r[f'w{h}']['captures']) for h in HORIZONS) + f" | {r['w156']['x_share_of_full']} | {100 * r['w156']['x_cost_military_budget']:.1f}")
    print('\nSustained attrition, B replace / B surge, 3 fronts: replaced share at w156 | cost % GDP per year | labour withdrawn')
    for cid, rows in results['national_attrition'].items():
        b = next(r for r in rows if r['model'] == 'B' and r['policy'] == 'replace' and r['fronts'] == 3)
        s = next(r for r in rows if r['model'] == 'B' and r['policy'] == 'surge' and r['fronts'] == 3)
        print(f"{cid} | {b['w156']['replaced_share']} / {s['w156']['replaced_share']} | "
              f"{100 * b['w156']['cost_gdp_per_year']:.3f} / {100 * s['w156']['cost_gdp_per_year']:.3f} | "
              f"{100 * b['w156']['labour_withdrawn_share']:.2f}% / {100 * s['w156']['labour_withdrawn_share']:.2f}%")
    print('\nSensitivity (France, model B):')
    for r in results['sensitivity_fra']:
        print(f"{r['variant']} | ready {r['repelled_ready_week']} full {r['repelled_full_week']} | fresh {r['fresh_captures_52_104_156']} rotating {r['rotating_captures_52_104_156']} | "
              f"3 fronts replaced {r['three_fronts_replaced_156']} cost {100 * r['three_fronts_cost_gdp_per_year']:.3f}% GDP/yr")
    if args.json:
        with open(args.json, 'w', encoding='utf-8') as handle:
            json.dump(results, handle, indent=1, sort_keys=True)
            handle.write('\n')
    print('\nPrincipal-case reproduction, determinism and the 19,417 no-recovery case passed.')


if __name__ == '__main__':
    main()
