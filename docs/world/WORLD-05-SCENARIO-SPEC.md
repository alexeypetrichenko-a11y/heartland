# WORLD-05-FINAL — Military initialisation specification (europe-2023 1.0.0-draft.3)

**Status:** implemented as scenario data in `scenarios/europe-2023/1.0.0-draft.3/scenario.json`, section `military`. **Military gameplay is not enabled** by this package, and no movement rule changes. This document is the contract between the scenario pipeline and the game. For the hand-off to Codex's military mobility study, see [WORLD-05-CODEX-HANDOFF.md](WORLD-05-CODEX-HANDOFF.md).

All starting forces and their placement are an **illustrative gameplay configuration, not a historical order of battle**. The game must label them so.

## 1. Approved rules

| Decision | Rule | In draft.3 |
|---|---|---|
| D3, M-2 | **Rule W:** divisions = round(defence compensation of employees, COFOG 02 D1 ÷ the country's own whole-economy average pay ÷ 25,000) | FRA 15, DEU 13, GBR 14, ITA 15, POL 13: unchanged from draft.2, `status: data` |
| M-3 | Türkiye by Rule W with the Ministry budget inputs, **subject to licence clearance** | **Not cleared**, so not used. See §2 |
| P-1 | Frontier-weighted placement (provisional gameplay configuration) | applied to all 46 provinces |
| P-2 | The UK, Türkiye and four islands cannot engage under current movement rules | accepted for the prototype only, recorded in `placement.isolation` |

## 2. Türkiye: gameplay assumption until M-3 is cleared

No licence-clean 2023 source gives Türkiye's defence pay or defence spending:
- SIPRI (through the World Bank) carries third-party terms;
- NATO publishes no reuse terms;
- the Ministry tables have no reuse licence;
- Eurostat and the OECD have no Turkish defence data.

The 16 divisions of the approved M-3 calculation therefore stay out of the package.

**Assumption (`status: assumption`).** Türkiye's personnel equivalents per inhabitant equal the **median of the other five countries' Rule W values**, multiplied by the population of its nine provinces (Eurostat). That gives 491,934 personnel equivalents, or **20 divisions**.
- **Why this proxy:**
  - It uses only licence-clean inputs.
  - It keeps Rule W's scale.
  - It is close to the size of Türkiye's forces in public reporting, which Rule W undercounts because conscripts earn far less than the average wage.
- **Alternatives** (owner decision W5F-M1):
  - median of the five counts: 14 divisions;
  - Rule W once route C clears the Ministry inputs: 16 divisions.
- **Effect on balance in the prototype: none,** because Türkiye has no movement link to another playable country (P-2).

## 3. Data contract (`scenario.json` → `military`)

```jsonc
"military": {
  "status": "illustrative starting forces ... Not a historical order of battle. Military gameplay is not enabled by this package.",
  "parameter": { "value": 25000, "status": "design", "method": "Game-scale parameter approved by the owner (M-2)" },
  "countries": {
    "<country id>": {
      "divisions": 15,                    // integer > 0, the starting count
      "personnel_equivalents": 382086,    // integer; divisions = round(personnel_equivalents / 25000)
      "status": "data" | "assumption",    // data = Rule W from cleared sources; assumption = documented gameplay value
      "method": "...", "sources": ["..."] // snapshot ids (scenarios/europe-2023/sources) and review extracts
      // Türkiye adds "reason" and "replaces"
    }
  },
  "placement": {
    "rule": "P-1",
    "status": "provisional gameplay configuration (owner decision P-1); illustrative, not a historical order of battle",
    "byRegion": { "<province id>": 2 },   // all 46 playable provinces, integer >= 0
    "regions": { "<province id>": { "reachable": true, "frontierWith": ["fra"] } },
    "isolation": "..."
  }
}
```

**Guaranteed by the data** (validator checks M1 and M2, both pass for draft.3):
- **Totals.** For every country, `sum(byRegion over its provinces) == countries[c].divisions`. Total 90.
- **No province is stranded or empty.** A province holds at least one division if, and only if, it is `reachable`, meaning it belongs to its country's main land-movement area (`links.movement`). Corsica, Northern Ireland, Sicily and Sardinia hold 0.
- **Uniform manpower.** Every division has the same manpower, `parameter.value` personnel equivalents. Divisions have manpower only, as in the current model.
- **Deterministic.** The placement is computed by `scenarios/pipeline/military_placement.py`, never by hand, and the validator recomputes the totals.

**Independence from future mobility rules.** The placement depends only on `links.movement` (land). It does not read maritime links, ports or transit, so a future naval transport or transit rule needs no change here:
- A new rule may change which provinces are reachable, and therefore which can be attacked. Starting positions stay valid until a new package version recomputes them.
- If such a rule makes islands reachable, the next package version's placement would give them a garrison by the same rule.

## 4. P-1 placement (draft.3)

| Country | Total | Divisions per province |
|---|---:|---|
| France | 15 | NE 3 · IDF 2 · OUE 2 · NAQ 2 · ARA 2 · SE 2 · CEN 1 · OCC 1 · COR 0 |
| Germany | 13 | NRW 2 · NOR 2 · MIT 2 · BW 2 · MO 2 · NO 2 · BY 1 |
| United Kingdom | 14 | NTH 3 · SE 3 · LON 2 · MID 2 · SW 2 · SCO 1 · WLS 1 · NIR 0 |
| Italy | 15 | NO 6 · CEN 3 · NE 3 · SUD 3 · SIC 0 · SAR 0 |
| Poland | 13 | MAZ 2 · POL 2 · PN 2 · PZA 2 · PDZ 2 · WSC 2 · CEN 1 |
| Türkiye | 20 (assumption) | IST 3 · MAR 3 · EGE 2 · AKD 2 · BAN 2 · GDA 2 · KAR 2 · DOG 2 · OAN 2 |

**Frontier divisions:**

| Frontier | P-1 | P-0 (population only) |
|---|---|---|
| Germany – France | 4 – 3 | 4 – 2 |
| Germany – Poland | 4 – 4 | 3 – 4 |
| France – Italy | 4 – 6 | 3 – 4 |

Full data, including the P-0 comparison: [`data/world05-military-proposal.json`](data/world05-military-proposal.json), written by `tools/world05_military.py`.
