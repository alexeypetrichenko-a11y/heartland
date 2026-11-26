"""Standalone synthetic calibration. Run with Python 3.10+ from the repository root."""
from dataclasses import dataclass, replace
from itertools import permutations


@dataclass(frozen=True)
class Rules:
    defence: int = 115
    loss: int = 300
    cap: int = 600
    pace: int = 45
    retreat: int = 70


@dataclass(frozen=True)
class Division:
    label: str
    origin: str
    opening: int = 25000


def fight(attack, defend, rules=Rules(), *, reinforce=(), withdraw=0, fallback="open"):
    """One contested region. Labels identify reporting rows and never enter arithmetic."""
    attackers = {d.label: d.opening for d in attack}
    defenders = {d.label: d.opening for d in defend}
    opening_a = sum(attackers.values())
    opening_d = sum(defenders.values())
    progress = pinned = 0
    prisoners = 0
    outcome = "ongoing"
    for week in range(1, 13):
        if week == withdraw:
            outcome = "attacker withdrew"
            break
        if week == 3:
            opening_a += sum(d.opening for d in reinforce)
            attackers.update((d.label, d.opening) for d in reinforce)
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
        if progress == -100 or 100 * sum(attackers.values()) <= rules.retreat * opening_a:
            outcome = "attacker repelled"
            break
        if progress == 100 or 100 * sum(defenders.values()) <= rules.retreat * opening_d:
            if fallback == "open":
                outcome = "capture after retreat"
                break
            if fallback == "encircled":
                pinned += 1
                if pinned == 2:
                    prisoners = sum(defenders.values())
                    outcome = "capture after surrender"
                    break
    a, d = sum(attackers.values()), sum(defenders.values())
    return (week, opening_a - a, opening_d - d, a, d - prisoners, prisoners, progress, outcome)


def divisions(prefix, count, origin):
    return tuple(Division(f"{prefix}{i}", origin) for i in range(count))


def simultaneous(orders):
    """Synthetic frozen ownership and unique weekly commitment check."""
    targets = {target for _, target, _ in orders}
    assert len({division.label for division, _, _ in orders}) == len(orders)
    assert len(targets) == len(orders)
    results = {}
    for division, target, garrison in orders:
        if division.origin not in targets:
            results[target] = fight((division,), (garrison,))
    return results


def main():
    a, b = divisions("a", 3, "west"), divisions("b", 3, "center")
    converging = (a[0], replace(a[1], origin="north"), a[2])
    cases = {f"{i}v{j}": fight(a[:i], b[:j])
             for i, j in ((1, 1), (1, 2), (1, 3), (2, 2), (3, 1), (3, 2))}
    cases.update({
        "unequal": fight((replace(a[0], opening=16000),), b[:1]),
        "reinforced week 3": fight(a[:1], b[:1], reinforce=(*a[1:], Division("reserve", "north"))),
        "voluntary week 3": fight(a[:1], b[:1], withdraw=3),
        "converging": fight(converging, b[:2]),
        "encircled": fight(a, b[:1], fallback="encircled"),
        "fallback unavailable": fight(a, b[:1], fallback="contested"),
    })
    for ids in permutations(("z", "q", "m")):
        relabeled = tuple(replace(unit, label=label) for unit, label in zip(converging, ids))
        for commands in permutations(relabeled):
            for defence in permutations(b[:2]):
                assert fight(commands, defence) == cases["converging"]
    first = (a[0], "center", b[0])
    reciprocal = (b[0], "west", a[0])
    other = (Division("c", "south"), "east", Division("d", "east"))
    for order in permutations((first, reciprocal)):
        assert simultaneous(order) == {}
    for order in permutations((first, other)):
        assert simultaneous(order) == {"center": cases["1v1"], "east": cases["1v1"]}
    assert cases["1v3"][-1] == "attacker repelled"
    assert cases["voluntary week 3"][-1] == "attacker withdrew"
    assert cases["encircled"][5] > 0 and cases["fallback unavailable"][-1] == "ongoing"
    assert cases["reinforced week 3"][-1] == "capture after retreat"
    for label, rules in (
        ("terrain 100%", Rules(defence=100)), ("terrain 130%", Rules(defence=130)),
        ("base loss 2%", Rules(loss=200)), ("base loss 4%", Rules(loss=400)),
        ("retreat 80%", Rules(retreat=80)), ("pace 35", Rules(pace=35)),
    ):
        for i, j in ((1, 1), (3, 2)):
            cases[f"{label}, {i}v{j}"] = fight(a[:i], b[:j], rules)
    print("Case | Weeks | A loss | D loss | A remaining | D remaining | Prisoners | Progress | Outcome")
    for name, row in cases.items():
        print(" | ".join(map(str, (name, *row))))
    print("72 ID/order permutations, two simultaneous order permutations and two reciprocal holds passed.")


if __name__ == "__main__":
    main()
