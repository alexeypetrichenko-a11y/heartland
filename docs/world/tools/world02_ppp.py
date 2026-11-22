#!/usr/bin/env python3
"""
WORLD-02 PPP versus market-exchange-rate comparison for 2023 (analysis tool, standard library only).

Reads docs/world/data/world02-ppp-fx-2023.json (raw World Bank WDI and Eurostat API values, retrieved
22 November 2026) and prints, for the six playable countries:
  - GDP in national currency (LCU), at market exchange rates (US$) and at PPP (international $);
  - the PPP conversion factor, the exchange rate implied by WDI (GDP in LCU / GDP in US$) and the
    price level ratio (PPP / exchange rate);
  - each country's share of the six-country total under both conversions;
  - a cross-check of the World Bank price level ratios against Eurostat's price level indices.
It also checks that WDI's PPP GDP equals GDP in LCU divided by the PPP factor (consistency test).

Run from the repository root:  python3 docs/world/tools/world02_ppp.py
Nothing here is a scenario asset.
"""
import json, os, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
data = json.load(open(os.path.join(ROOT, 'docs', 'world', 'data', 'world02-ppp-fx-2023.json'), encoding='utf-8'))
wb = {k: v['values'] for k, v in data['world_bank_wdi']['series'].items()}
es = data['eurostat']['prc_ppp_ind']['values']
COUNTRIES = [('FRA', 'FR', 'France'), ('DEU', 'DE', 'Germany'), ('GBR', 'UK', 'United Kingdom'),
             ('ITA', 'IT', 'Italy'), ('POL', 'PL', 'Poland'), ('TUR', 'TR', 'Türkiye')]

rows, problems = [], []
for iso3, geo, name in COUNTRIES:
    lcu, usd, ppp_usd = wb['NY.GDP.MKTP.CN'][iso3], wb['NY.GDP.MKTP.CD'][iso3], wb['NY.GDP.MKTP.PP.CD'][iso3]
    ppp = wb['PA.NUS.PPP'][iso3]
    implied_fx = lcu / usd
    # Consistency: WDI PPP GDP should equal LCU GDP / PPP factor (to rounding of the published factor).
    if abs(lcu / ppp / ppp_usd - 1) > 0.002:
        problems.append(f'{iso3}: LCU/PPP = {lcu / ppp:.4g}, WDI PPP GDP = {ppp_usd:.4g}')
    rows.append({'iso3': iso3, 'geo': geo, 'name': name, 'lcu': lcu, 'usd': usd, 'ppp_usd': ppp_usd, 'ppp': ppp,
                 'fx': implied_fx, 'imf_fx': wb['PA.NUS.FCRF'][iso3], 'pl': ppp / implied_fx})
total_usd = sum(r['usd'] for r in rows)
total_ppp = sum(r['ppp_usd'] for r in rows)
de = next(r for r in rows if r['iso3'] == 'DEU')

print('2023 | GDP LCU bn | GDP US$ bn (market) | GDP intl$ bn (PPP) | PPP LCU/intl$ | FX LCU/US$ (WDI implied) | FX IMF IFS | price level (PPP/FX) | share market | share PPP | PPP/market share')
for r in rows:
    print(f"{r['name']:<15} | {r['lcu'] / 1e9:>10,.0f} | {r['usd'] / 1e9:>8,.0f} | {r['ppp_usd'] / 1e9:>8,.0f} | {r['ppp']:>8.4f} | {r['fx']:>8.4f} | {r['imf_fx']:>8.4f} | "
          f"{r['pl']:.3f} | {r['usd'] / total_usd:6.1%} | {r['ppp_usd'] / total_ppp:6.1%} | {(r['ppp_usd'] / total_ppp) / (r['usd'] / total_usd):.2f}")
print(f"{'Six together':<15} | {'':>10} | {total_usd / 1e9:>8,.0f} | {total_ppp / 1e9:>8,.0f}")
print()
print('Cross-check: price level relative to Germany, World Bank (PPP/FX) vs Eurostat PLI (EU27 = 100)')
for r in rows:
    wb_rel = r['pl'] / de['pl']
    es_rel = es['PLI_EU27_2020'][r['geo']] / es['PLI_EU27_2020']['DE']
    print(f"{r['name']:<15} | World Bank {wb_rel:.3f} | Eurostat {es_rel:.3f} | difference {wb_rel / es_rel - 1:+.1%}")
print()
if problems:
    print('CONSISTENCY FAILURES:'); [print(' ', p) for p in problems]; sys.exit(1)
print('consistency: WDI PPP GDP = GDP in LCU / PPP factor for all six (within 0.2%)')
