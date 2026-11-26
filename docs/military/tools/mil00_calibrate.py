"""Standalone synthetic calibration. Run with Python 3.10+ from the repository root."""
from dataclasses import dataclass, replace
from itertools import permutations


@dataclass(frozen=True)
class Rules:
    defence: int = 115
    loss: int = 300
    cap: int = 600
    pace: int = 45
    retreat: int = 80


@dataclass(frozen=True)
class Division:
    label: str
    origin: str
    opening: int = 25000


def fight(attack, defend, rules=Rules(), *, reinforce=(), withdraw=0, fallback="open", attacker_fallback="open", trace=None, field=False):
    """One contested region. Labels identify reporting rows and never enter arithmetic."""
    attackers = {d.label: d.opening for d in attack}
    defenders = {d.label: d.opening for d in defend}
    opening_a = sum(attackers.values())
    opening_d = sum(defenders.values())
    progress = 0
    obstructed = [0, 0]
    pinned = [0, 0]
    prisoners = [0, 0]
    outcome = "ongoing"
    for week in range(1, 13):
        if week == withdraw and attacker_fallback == "open":
            outcome = "attacker withdrew"
            break
        if week == 3:
            opening_a += sum(d.opening for d in reinforce)
            attackers.update((d.label, d.opening) for d in reinforce)
        if trace is not None:
            trace.append((week, progress))
        a, d = sum(attackers.values()), sum(defenders.values()) * rules.defence // 100
        loss_a = min(rules.cap, rules.loss * d // a)
        loss_d = min(rules.cap, rules.loss * a // d)
        assert 0 <= loss_a <= rules.cap and 0 <= loss_d <= rules.cap
        attackers = {label: strength - strength * loss_a // 10000
                     for label, strength in attackers.items()}
        defenders = {label: strength - strength * loss_d // 10000
                     for label, strength in defenders.items()}
        swing = rules.pace * abs(a - d) // (a + d)
        progress = max(-100, min(100, progress + (swing if a >= d else -swing)))
        remaining = (sum(attackers.values()), sum(defenders.values()))
        triggered = (
            progress == -100 or 100 * remaining[0] <= rules.retreat * opening_a,
            progress == 100 or 100 * remaining[1] <= rules.retreat * opening_d,
        )
        exited = [False, False]
        routes = (attacker_fallback, fallback)
        availability_by_side = tuple(route(week) if callable(route) else route for route in routes)
        for side, availability in enumerate(availability_by_side):
            pinned[side] = pinned[side] + 1 if triggered[side] and availability == "encircled" else 0
            if pinned[side] == 2:
                prisoners[side] = remaining[side]
                exited[side] = True
            elif triggered[side] and availability == "open":
                exited[side] = True
        if all(exited):
            outcome = "both sides disengaged"
        elif exited[0]:
            outcome = "attacker surrendered" if prisoners[0] else "attacker repelled"
        elif exited[1] and not triggered[0] and not field:
            outcome = "capture after surrender" if prisoners[1] else "capture after retreat"
        elif exited[1]:
            outcome = "held, no eligible occupier"
        if any(exited):
            break
        for side, availability in enumerate(availability_by_side):
            obstructed[side] = obstructed[side] + 1 if triggered[side] and availability != "open" else 0
        if max(obstructed) == 3:
            outcome = "suspended after blocked withdrawal"
            break
        if field and week >= 8 and not any(obstructed):
            outcome = "field clash ended at round limit"
            break
    a, d = sum(attackers.values()), sum(defenders.values())
    return (week, opening_a - a, opening_d - d, a - prisoners[0], d - prisoners[1],
            tuple(prisoners), progress, outcome)


def divisions(prefix, count, origin):
    return tuple(Division(f"{prefix}{i}", origin) for i in range(count))


def assign_reciprocal(left, right):
    """25% screening gate measured against unmodified opposing commitment."""
    if left * 4 < right:
        return "right attacks"
    if right * 4 < left:
        return "left attacks"
    return "field clash"


def recommit_allowed(current, baseline, retreat_week, week):
    """Retreat removes eligibility, never losses or the readiness baseline."""
    return week >= retreat_week + 2 and 100 * current > Rules().retreat * baseline


def can_reopen_suspended_front(week, suspended_week, exit_open):
    return week >= suspended_week + 2 and exit_open


def check_unique_commitments(assignments):
    return len({division for division, _ in assignments}) == len(assignments)


def main():
    a, b = divisions("a", 3, "west"), divisions("b", 3, "center")
    converging = (a[0], replace(a[1], origin="north"), a[2])
    cases = {f"{i}v{j}": fight(a[:i], b[:j])
             for i, j in ((1, 1), (1, 2), (1, 3), (2, 2), (3, 1), (3, 2))}
    reinforcement_trace = []
    cases.update({
        "unequal": fight((replace(a[0], opening=16000),), b[:1]),
        "reinforced week 3": fight(a[:1], b[:1], reinforce=(*a[1:], Division("reserve", "north")), trace=reinforcement_trace),
        "voluntary week 3": fight(a[:1], b[:1], withdraw=3),
        "converging": fight(converging, b[:2]),
        "encircled": fight(a, b[:1], fallback="encircled"),
        "fallback unavailable": fight(a, b[:1], fallback="contested"),
        "fallback reopens week 6": fight(a, b[:1], fallback=lambda week: "contested" if week < 6 else "open"),
        "alternating blocked route": fight(a, b[:1], fallback=lambda week: "encircled" if week % 2 else "contested"),
        "attacker encircled": fight(a[:1], b, attacker_fallback="encircled"),
        "attacker fallback blocked": fight(a[:1], b, attacker_fallback="contested"),
    })
    for ids in permutations(("z", "q", "m")):
        relabeled = tuple(replace(unit, label=label) for unit, label in zip(converging, ids))
        for commands in permutations(relabeled):
            for defence in permutations(b[:2]):
                assert fight(commands, defence) == cases["converging"]
    for left, right in ((250, 25000), (6249, 25000)):
        assert assign_reciprocal(left, right) == "right attacks"
        assert assign_reciprocal(right, left) == "left attacks"
    assert assign_reciprocal(6250, 25000) == "field clash"
    assert assign_reciprocal(25000, 25000) == "field clash"
    cases["reciprocal field clash"] = fight(a[:1], b[:1], Rules(defence=100), field=True)
    assert cases["reciprocal field clash"][-1] == "both sides disengaged"
    tiny_a, tiny_b = replace(a[0], opening=1), replace(b[0], opening=1)
    tiny_clash = fight((tiny_a,), (tiny_b,), Rules(defence=100), field=True)
    assert tiny_clash[0] == 8 and tiny_clash[-1] == "field clash ended at round limit"
    asymmetric_clash = fight(a[:2], b[:1], Rules(defence=100), field=True)
    assert not asymmetric_clash[-1].startswith("capture")
    for orders in permutations((("a", "center"), ("b", "east"))):
        assert check_unique_commitments(orders)
    for orders in permutations((("a", "center"), ("a", "east"))):
        assert not check_unique_commitments(orders)
    cases["parallel front west"] = fight(a[:1], b[:1])
    cases["parallel front south"] = fight(divisions("c", 1, "south"), divisions("d", 1, "east"))
    assert cases["parallel front west"] == cases["parallel front south"] == cases["1v1"]
    assert not recommit_allowed(21000, 25000, 4, 5)
    for week in range(5, 13):
        assert not recommit_allowed(19500, 25000, 4, week)
    assert recommit_allowed(21000, 25000, 4, 6)
    assert not recommit_allowed(19500, 25000, 6, 8)
    assert reinforcement_trace[2] == (3, cases["voluntary week 3"][6])
    assert reinforcement_trace[2][1] != 0
    assert cases["1v3"][-1] == "attacker repelled"
    assert cases["voluntary week 3"][-1] == "attacker withdrew"
    assert cases["encircled"][5][1] > 0 and cases["attacker encircled"][5][0] > 0
    assert cases["fallback unavailable"][-1] == "suspended after blocked withdrawal"
    assert cases["alternating blocked route"][-1] == "suspended after blocked withdrawal"
    assert cases["attacker fallback blocked"][-1] == "suspended after blocked withdrawal"
    assert cases["fallback reopens week 6"][-1] == "capture after retreat"
    suspended = cases["fallback unavailable"][0]
    assert not can_reopen_suspended_front(suspended + 1, suspended, True)
    assert not can_reopen_suspended_front(suspended + 6, suspended, False)
    assert can_reopen_suspended_front(suspended + 2, suspended, True)
    assert cases["reinforced week 3"][-1] == "capture after retreat"
    for label, rules in (
        ("terrain 100%", Rules(defence=100)), ("terrain 130%", Rules(defence=130)),
        ("base loss 2%", Rules(loss=200)), ("base loss 4%", Rules(loss=400)),
        ("retreat 70%", Rules(retreat=70)), ("pace 35", Rules(pace=35)),
    ):
        for i, j in ((1, 1), (3, 2)):
            cases[f"{label}, {i}v{j}"] = fight(a[:i], b[:j], rules)
    print("Case | Weeks | A loss | D loss | A remaining | D remaining | Prisoners (A, D) | Progress | Outcome")
    for name, row in cases.items():
        print(" | ".join(map(str, (name, *row))))
    print("72 ID/order permutations and screening, reciprocal, parallel, commitment, withdrawal and reinforcement assertions passed.")


if __name__ == "__main__":
    main()
