#!/usr/bin/env python3
"""
ECON-08 (offline, deterministic): 2023 sovereign financing inputs for the European scenario.

Writes scenarios/europe-2023/build/financing.json with, per country:
  effective_rate   average interest rate paid on outstanding debt = interest paid (ESA D41, payable) / gross debt.
                   Instrument: the whole stock, all maturities, coupons fixed when the bonds were issued. Maps to
                   the engine's `averageRate` (CountrySpec.effectiveRate).
  yield_10y        10-year benchmark yield (EMU convergence-criterion series, annual average). Instrument: NEW
                   long-term debt. Maps to the engine's `marketRate` (rate on new borrowing), but only as a
                   spread over Germany for euro-area members: their yields share one currency and one monetary
                   policy, so the spread measures sovereign risk. Outside the euro area, yields also carry
                   currency and inflation premia that a one-currency engine cannot represent; they are recorded,
                   not fitted.
  deficit          general government net borrowing / GDP (TE - TR), which drives the engine's deficit premium.
and the spread-parameter fit: the engine's own formula
  spread = spreadLinear * max(0, d - spreadDebtThreshold) + spreadQuad * max(0, d - spreadQuadThreshold)^2
           + spreadDeficit * max(0, deficit - 0.03)
fitted by grid search (least squares) to the euro-area spreads over Germany, with spreadDebtThreshold (0.6) and
spreadQuad (0.25) kept at the engine defaults. The central-bank policy rate is NOT an input here: in the engine
it applies to central-bank loans and firm credit, not to bonds.

Run from the repository root:  python3 scenarios/pipeline/build_financing.py [--licensed]

--licensed (WORLD-05-FINAL, package 1.0.0-draft.3) writes build-licensed/financing.json; Türkiye's debt and interest then
come from Eurostat (balance sheet) and the World Bank (IMF GFS, CC BY-4.0 label) instead of the restricted Treasury and Court
of Accounts snapshots. Every other country, and the spread fit, are unchanged.
"""
import json, os, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, 'scenarios', 'europe-2023', 'sources')
LICENSED = '--licensed' in sys.argv
BUILD = os.path.join(ROOT, 'scenarios', 'europe-2023', 'build-licensed' if LICENSED else 'build')
S = lambda n: json.load(open(os.path.join(SRC, f'{n}.json'), encoding='utf-8'))['values']
EURO_AREA = {'DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'AT', 'IE', 'EL'}   # members in 2023 among the scenario's countries
GEO = {'fra': 'FR', 'deu': 'DE', 'ita': 'IT', 'pol': 'PL', 'irl': 'IE', 'esp': 'ES', 'nld': 'NL', 'bel': 'BE', 'che': 'CH',
       'aut': 'AT', 'cze': 'CZ', 'nor': 'NO', 'grc': 'EL', 'bgr': 'BG'}
DEFAULTS = {'spreadLinear': 0.02, 'spreadDebtThreshold': 0.6, 'spreadQuadThreshold': 0.9, 'spreadQuad': 0.25, 'spreadDeficit': 0.5}

def main():
    gov, gdp, debt, yields = S('es_government'), S('es_national_gdp'), S('es_debt'), S('es_bond_yields')
    out = {}
    for cid, geo in GEO.items():
        g = gdp[f'B1GQ|{geo}']
        interest = gov[f'D41PAY|{geo}'] / g
        d = (S('es_debt_quarterly')['NO'] if geo == 'NO' else debt.get(geo)) if geo != 'CH' else None
        d = None if d is None else d / 100
        out[cid] = {
            'debt': d, 'interest_paid_pct_gdp': interest, 'deficit': (gov[f'TE|{geo}'] - gov[f'TR|{geo}']) / g,
            'effective_rate': interest / d if d else None, 'yield_10y': yields[geo] / 100 if geo in yields else None,
            'euro_area': geo in EURO_AREA,
            'sources': ['es_government', 'es_national_gdp', 'es_debt_quarterly' if geo == 'NO' else 'es_debt', 'es_bond_yields'],
        }
    uk_gdp = S('oecd_gdp')['GBR']
    out['gbr'] = {'debt': S('ons_uk_debt')['GBR|gross_consolidated_debt_pct_GDP'] / 100, 'interest_paid_pct_gdp': S('oecd_uk_government')['GBR|D41'] / uk_gdp,
                  'deficit': None, 'yield_10y': None, 'euro_area': False, 'sources': ['oecd_uk_government', 'oecd_gdp', 'ons_uk_debt']}
    out['gbr']['effective_rate'] = out['gbr']['interest_paid_pct_gdp'] / out['gbr']['debt']
    if LICENSED:
        nat, liab, wdi = S('es_tr_national'), S('es_tr_gov_liabilities'), S('wdi_tur_gfs')
        out['tur'] = {'debt': (liab['F2|TR'] + liab['F3|TR'] + liab['F4|TR']) / nat['B1GQ|TR'],
                      'interest_paid_pct_gdp': wdi['TUR|GC.XPN.INTP.ZS'] / 100 * wdi['TUR|GC.XPN.TOTL.GD.ZS'] / 100,
                      'deficit': None, 'yield_10y': None, 'euro_area': False, 'sources': ['es_tr_gov_liabilities', 'es_tr_national', 'wdi_tur_gfs'],
                      'method': 'debt: consolidated general government liabilities F2+F3+F4 (market value) / GDP (Eurostat); interest: WDI interest share x expense (IMF GFS, central government)'}
    else:
        tr_gdp = S('oecd_gdp')['TUR'] * 1000
        out['tur'] = {'debt': S('tr_treasury_debt')['TUR|EU_defined_GG_debt_pct_GDP'] / 100, 'interest_paid_pct_gdp': S('tr_sayistay_government')['TUR|interest'] / tr_gdp,
                      'deficit': None, 'yield_10y': None, 'euro_area': False, 'sources': ['tr_sayistay_government', 'oecd_gdp', 'tr_treasury_debt']}
    out['tur']['effective_rate'] = out['tur']['interest_paid_pct_gdp'] / out['tur']['debt']
    # Fit on the euro area.
    ref = out['deu']['yield_10y']
    rows = [(cid, v['debt'], v['deficit'], v['yield_10y'] - ref) for cid, v in out.items() if v['euro_area']]
    def model(p, d, dfc):
        return p['spreadLinear'] * max(0, d - p['spreadDebtThreshold']) + p['spreadQuad'] * max(0, d - p['spreadQuadThreshold']) ** 2 \
            + p['spreadDeficit'] * max(0, dfc - 0.03)
    def rms(p):
        return (sum((model(p, d, dfc) - s) ** 2 for _, d, dfc, s in rows) / len(rows)) ** 0.5
    best = None
    for a in range(0, 51):
        for q in range(90, 301, 5):
            for k in (0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5):
                p = {**DEFAULTS, 'spreadLinear': a / 1000, 'spreadQuadThreshold': q / 100, 'spreadDeficit': k}
                e = rms(p)
                if best is None or e < best[0] - 1e-15:
                    best = (e, p)
    fitted = best[1]
    for cid, v in out.items():
        if v['debt'] is not None and v['deficit'] is not None:
            v['spread_model_default'] = model(DEFAULTS, v['debt'], v['deficit'])
            v['spread_model_fitted'] = model(fitted, v['debt'], v['deficit'])
        if v['euro_area']:
            v['spread_observed'] = v['yield_10y'] - ref
    doc = {'reference': 'Germany 10-year yield 2023 (the engine world rate stands for it)', 'reference_yield': ref,
           'fit': {'countries': [r[0] for r in rows], 'default_params': DEFAULTS, 'default_rms': rms(DEFAULTS), 'fitted_params': fitted, 'fitted_rms': best[0],
                   'method': 'grid search, least squares on euro-area spreads over Germany; spreadDebtThreshold and spreadQuad kept at defaults'},
           'countries': out}
    with open(os.path.join(BUILD, 'financing.json'), 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=1); f.write('\n')
    print(f'fit: {fitted} rms {best[0] * 100:.2f} pp (defaults {rms(DEFAULTS) * 100:.2f} pp)')
    for cid, v in out.items():
        print(f'{cid:4} debt {v["debt"] if v["debt"] is None else round(v["debt"], 3)} effective {v["effective_rate"] if v["effective_rate"] is None else round(v["effective_rate"] * 100, 2)}% '
              f'interest/GDP {v["interest_paid_pct_gdp"] * 100:.2f}% yield {v["yield_10y"] if v["yield_10y"] is None else round(v["yield_10y"] * 100, 2)} euro {v["euro_area"]}')

if __name__ == '__main__':
    main()
