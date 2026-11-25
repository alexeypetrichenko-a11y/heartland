#!/usr/bin/env python3
"""
WORLD-03 step 2b (offline, deterministic): turn the source snapshots into the scenario's economic inputs.

Reads only scenarios/europe-2023/sources/*.json, scenarios/europe-2023/build/geography.json and the approved
WORLD-02 draft data, and writes scenarios/europe-2023/build/inputs.json:

  zones[]      61 zones: population (millions, 2023 average), output target (2023 GDP at PPP, international $
               billion), sector group shares and the resulting relative advantages;
  countries[]  21 economic countries (6 playable, 10 simulated neighbours, 5 blocs): PPP GDP, PPP factor,
               fiscal targets as % of GDP (taxes, spending, debt), with their coverage;
  military     the draft starting-force calculation (rule W) and its gaps;
  issues[]     every estimate, unavailable value, engine limit and licensing risk, one line each.

Every number carries {value, sources[], method, status}. status is one of:
  data         taken from a source (possibly summed or divided, as stated in `method`);
  estimate     derived with a documented rule because the exact figure is not published;
  unavailable  not published in a verified source; the engine default is used and flagged, never a made-up value;
  engine-limit the data value lies outside what the engine accepts; the nearest accepted value is used and flagged.
A MANDATORY input that is missing stops the build (exit code 2) instead of being invented.

Run from the repository root:  python3 scenarios/pipeline/build_inputs.py [--licensed]

--licensed (WORLD-05-FINAL, package 1.0.0-draft.3) writes build-licensed/inputs.json instead. It never reads the
restricted Turkish snapshots (Court of Accounts, Treasury debt report): Türkiye's debt comes from Eurostat's financial
balance sheet, its spending lines from the licensed budget estimates (build_budget.py --licensed), and its starting
forces are a documented gameplay assumption until the Ministry inputs of Rule W are cleared (decision M-3).
Without the flag the build is unchanged and ignores the snapshots added for draft.3.
"""
import csv, json, os, sys
from collections import defaultdict
sys.dont_write_bytecode = True   # scenarios/pipeline/__pycache__ holds a tracked file (WORLD-03); do not rewrite it

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, 'scenarios', 'europe-2023', 'sources')
BUILD = os.path.join(ROOT, 'scenarios', 'europe-2023', 'build')
LICENSED = '--licensed' in sys.argv
BUILD_OUT = os.path.join(ROOT, 'scenarios', 'europe-2023', 'build-licensed') if LICENSED else BUILD
LICENSED_ONLY = {'es_tr_national', 'es_tr_gov_liabilities', 'oecd_eo_tur', 'wdi_tur_gfs'}   # added for draft.3
RESTRICTED = {'tr_sayistay_government', 'tr_treasury_debt'}                                  # never read in licensed mode
W2 = os.path.join(ROOT, 'docs', 'world', 'data')
NE = os.path.join(ROOT, 'public', 'geography', 'natural-earth-5.1.1')

# Engine limits read from economy-engine/src (builder.ts MAX_STARTING_DEBT; config maxTaxRate, maxSpendingShare).
MAX_STARTING_DEBT = 1.5
ADVANTAGE_RANGE = (0.1, 4.0)          # WORLD-02 DATA-SOURCES §4.2 (design choice)
GROUPS = ['food', 'energy', 'materials', 'industrial', 'consumer']
PLAYABLE = {'FRA': ('fra', 'France', 'FR'), 'DEU': ('deu', 'Germany', 'DE'), 'GBR': ('gbr', 'United Kingdom', None),
            'ITA': ('ita', 'Italy', 'IT'), 'POL': ('pol', 'Poland', 'PL'), 'TUR': ('tur', 'Türkiye', 'TR')}
NEIGHBOURS = {'IRL': ('Ireland', 'IE'), 'ESP': ('Spain', 'ES'), 'NLD': ('Netherlands', 'NL'), 'BEL': ('Belgium', 'BE'),
              'CHE': ('Switzerland', 'CH'), 'AUT': ('Austria', 'AT'), 'CZE': ('Czechia', 'CZ'), 'NOR': ('Norway', 'NO'),
              'GRC': ('Greece', 'EL'), 'BGR': ('Bulgaria', 'BG')}
BLOCS = {'bloc EUR: Rest of Europe': ('bloc-eur', 'Rest of Europe'), 'bloc EEC: Eastern Europe and Central Asia': ('bloc-eec', 'Eastern Europe and Central Asia'),
         'bloc MEA: Middle East and Africa': ('bloc-mea', 'Middle East and Africa'), 'bloc AME: Americas': ('bloc-ame', 'Americas'),
         'bloc APA: Asia-Pacific': ('bloc-apa', 'Asia-Pacific')}
# Natural Earth entities whose World Bank code differs from ISO_A3/ADM0_A3 (WDI uses XKX for Kosovo).
WB_CODE = {'KOS': 'XKX'}

issues = []
def issue(kind, subject, text):
    issues.append({'kind': kind, 'subject': subject, 'text': text})

class Missing(Exception):
    pass

def src(name):
    return json.load(open(os.path.join(SRC, f'{name}.json'), encoding='utf-8'))

S = {name[:-5]: src(name[:-5]) for name in sorted(os.listdir(SRC))
     if name.endswith('.json') and name[:-5] not in (RESTRICTED if LICENSED else LICENSED_ONLY)}

def val(sid, key, mandatory=True):
    v = S[sid]['values'].get(key)
    if isinstance(v, dict):
        v = v.get('value')
    if v is None and mandatory:
        raise Missing(f'{sid}: {key}')
    return v

def item(value, sources, method, status='data', **extra):
    return {'value': value, 'sources': sorted(set(sources)), 'method': method, 'status': status, **extra}

# ---------------------------------------------------------------------------------------------- provinces
def provinces():
    plist = [p for p in json.load(open(os.path.join(W2, 'world02-provinces.json'), encoding='utf-8')) if p['simulated_in_v1']]
    return plist

def regional_parts(country, units):
    """A*10-based parts for a set of regional units, in national currency (million)."""
    if country == 'GBR':
        g = lambda u, c: val('ons_regional_gva', f'{u}|{c}')
        out = defaultdict(float)
        for u in units:
            out['total'] += g(u, 'Total')
            out['A'] += g(u, 'A (1-3)'); out['B'] += g(u, 'B (5-9)'); out['C'] += g(u, 'C (10-33)')
            out['D'] += g(u, 'D (35)'); out['E'] += g(u, 'E (36-39)')
            out['C_food'] += g(u, 'CA (10-12)')
            out['C_consumer'] += g(u, 'CB (13-15)') + g(u, '31') + g(u, '32')
        return out, ['ons_regional_gva'], 'ONS ITL1 GVA by SIC07 section and division (regional detail)'
    out = defaultdict(float)
    for u in units:
        g = lambda n: val('es_regional_gva', f'{n}|{u}')
        out['total'] += g('TOTAL'); out['A'] += g('A'); out['C'] += g('C'); out['BDE'] += g('B-E') - g('C')
    return out, ['es_regional_gva'], 'Eurostat NUTS GVA by NACE A*10 (regional), split with national A*64 shares'

def national_shares(geo):
    """Within-industry splits from national A*64 (Eurostat); used where regional detail is not published."""
    a = lambda n, mandatory=True: val('es_national_a64', f'{n}|{geo}', mandatory)
    bde = a('B') + a('D') + a('E')
    c = a('C')
    c1315 = a('C13-C15', mandatory=False)
    status = 'data'
    if c1315 is None:
        c1315 = 0.0
        status = 'estimate'
        issue('estimate', geo, f'National C13-C15 (textiles) value added is not published for {geo} (confidential in nama_10_a64); '
                               'the consumer-goods split uses C31_C32 only.')
    return {'B': a('B') / bde, 'D': a('D') / bde, 'E': a('E') / bde, 'C_food': a('C10-C12') / c,
            'C_consumer': (c1315 + a('C31_C32')) / c}, status

def energy_split(iso3):
    """Share of mining (B) that is energy extraction: (oil + gas rents) / all natural-resource rents (WDI)."""
    parts = {k: S[f'wdi_ny_gdp_{k}_rt_zs']['values'].get(iso3) for k in ('petr', 'ngas', 'coal', 'minr')}
    years = sorted({p['year'] for p in parts.values() if p})
    values = {k: (p['value'] if p else 0.0) for k, p in parts.items()}
    total = sum(values.values())
    if total <= 0:
        issue('estimate', iso3, 'No natural-resource rents published: mining split half energy, half materials.')
        return 0.5, years
    return (values['petr'] + values['ngas']) / total, years

def groups_from_parts(parts, shares, e):
    """Engine groups (WORLD-02 DATA-SOURCES §4.2) from A*10 parts and national splits."""
    if 'BDE' in parts:
        b, d = parts['BDE'] * shares['B'], parts['BDE'] * shares['D']
        c_food, c_cons = parts['C'] * shares['C_food'], parts['C'] * shares['C_consumer']
    else:
        b, d, c_food, c_cons = parts['B'], parts['D'], parts['C_food'], parts['C_consumer']
    g = {'food': parts['A'] + c_food, 'energy': d + b * e, 'materials': b * (1 - e),
         'industrial': parts['C'] - c_food - c_cons, 'consumer': c_cons}
    return {k: v / parts['total'] for k, v in g.items()}

# ---------------------------------------------------------------------------------------------- build
def build():
    zones, countries = [], []
    geo_doc = json.load(open(os.path.join(BUILD, 'geography.json'), encoding='utf-8'))
    ppp = S['wdi_ny_gdp_mktp_pp_cd']['values']
    pppf = S.get('wdi_pa_nus_ppp')
    # --- playable provinces
    plist = provinces()
    by_country = defaultdict(list)
    for p in plist:
        by_country[p['country']].append(p)
    for iso3, (cid, cname, geo) in PLAYABLE.items():
        if iso3 not in ppp:
            raise Missing(f'WDI PPP GDP {iso3}')
        e, rent_years = energy_split(iso3)
        shares, share_status = (national_shares(geo) if geo else (None, 'data'))
        rows = []
        for p in by_country[iso3]:
            parts, psrc, pmethod = regional_parts(iso3, p['statistical_units'])
            rows.append((p, parts, psrc, pmethod))
        if iso3 == 'FRA':
            fry, _, _ = regional_parts('FRA', ['FRY'])
            metro = sum(r[1]['total'] for r in rows)
            country_ppp = ppp[iso3] * metro / (metro + fry['total'])
            ppp_method = 'WDI GDP at PPP x metropolitan share of regional GVA (FR1..FRM over FR1..FRY): overseas departments excluded (WORLD-02 decision P-3)'
        else:
            country_ppp = ppp[iso3]
            ppp_method = 'WDI GDP at PPP; extra-regio GVA distributed in proportion to regional GVA'
        total = sum(r[1]['total'] for r in rows)
        for p, parts, psrc, pmethod in rows:
            if iso3 == 'GBR':
                pop = sum(val('ons_regional_population', u) for u in p['statistical_units']) / 1e6
                pop_item = item(round(pop, 6), ['ons_regional_population'], 'ONS resident population mid-2023 (sum of ITL1 regions)')
            else:
                pop = sum((val('es_regional_population', f'{u}|2023') + val('es_regional_population', f'{u}|2024')) / 2 for u in p['statistical_units']) / 1e6
                pop_item = item(round(pop, 6), ['es_regional_population'], 'Eurostat population, mean of 1 Jan 2023 and 1 Jan 2024 (2023 average)')
            groups = groups_from_parts(parts, shares, e) if shares else groups_from_parts(parts, None, e)
            zones.append({
                'id': p['id'].lower(), 'name': p['name'], 'kind': 'province', 'country': cid, 'statistical_units': p['statistical_units'],
                'population': pop_item,
                'gva_lcu': item(parts['total'], psrc, 'Regional GVA at basic prices, 2023, million national currency (sum of units)'),
                'output_target': item(country_ppp * parts['total'] / total / 1e9, psrc + ['wdi_ny_gdp_mktp_pp_cd'],
                                      'Country GDP at PPP (international $ bn) x province share of the country\'s regional GVA'),
                'groups': item({k: round(v, 6) for k, v in groups.items()}, psrc + ([] if iso3 == 'GBR' else ['es_national_a64']) + ['wdi_ny_gdp_petr_rt_zs', 'wdi_ny_gdp_ngas_rt_zs', 'wdi_ny_gdp_coal_rt_zs', 'wdi_ny_gdp_minr_rt_zs'],
                               pmethod + f'; mining split by natural-resource rents (WDI, years {rent_years})', 'estimate' if share_status == 'estimate' else 'data'),
            })
        countries.append({'id': cid, 'name': cname, 'kind': 'playable', 'iso3': iso3,
                          'gdp_ppp_bn': item(country_ppp / 1e9, ['wdi_ny_gdp_mktp_pp_cd', 'es_regional_gva'] if iso3 == 'FRA' else ['wdi_ny_gdp_mktp_pp_cd'], ppp_method)})
    # --- simulated neighbours
    for iso3, (name, geo) in NEIGHBOURS.items():
        cid = iso3.lower()
        a = lambda n: val('es_national_a64', f'{n}|{geo}')
        parts = {'total': a('TOTAL'), 'A': a('A'), 'C': a('C'), 'BDE': a('B') + a('D') + a('E')}
        shares, share_status = national_shares(geo)
        e, rent_years = energy_split(iso3)
        pop = (val('es_national_population', f'{geo}|2023') + val('es_national_population', f'{geo}|2024')) / 2 / 1e6
        if iso3 not in ppp:
            raise Missing(f'WDI PPP GDP {iso3}')
        zones.append({'id': f'{cid}-all', 'name': name, 'kind': 'neighbour', 'country': cid,
                      'population': item(round(pop, 6), ['es_national_population'], 'Eurostat population, mean of 1 Jan 2023 and 1 Jan 2024'),
                      'output_target': item(ppp[iso3] / 1e9, ['wdi_ny_gdp_mktp_pp_cd'], 'WDI GDP at PPP, international $ bn'),
                      'groups': item({k: round(v, 6) for k, v in groups_from_parts(parts, shares, e).items()},
                                     ['es_national_a64', 'wdi_ny_gdp_petr_rt_zs', 'wdi_ny_gdp_ngas_rt_zs', 'wdi_ny_gdp_coal_rt_zs', 'wdi_ny_gdp_minr_rt_zs'],
                                     f'National A*64 value added; mining split by natural-resource rents (WDI, years {rent_years})', share_status)})
        countries.append({'id': cid, 'name': name, 'kind': 'neighbour', 'iso3': iso3, 'gdp_ppp_bn': item(ppp[iso3] / 1e9, ['wdi_ny_gdp_mktp_pp_cd'], 'WDI GDP at PPP')})
    # --- blocs
    members = defaultdict(list)
    ne_codes = {c['source']['ADM0_A3']: c['source'] for c in json.load(open(os.path.join(NE, 'countries.json'), encoding='utf-8'))['countries']}
    for r in csv.DictReader(open(os.path.join(W2, 'world02-economic-membership.csv'), encoding='utf-8')):
        if r['tier'] == 'bloc':
            members[r['economic_unit']].append(r['adm0_a3'])
    pop_wb, gdp_usd = S['wdi_sp_pop_totl']['values'], S['wdi_ny_gdp_mktp_cd']['values']
    six_food, six_cons = [], []
    for z in zones:
        if z['kind'] == 'province':
            pass
    # Manufacturing split for blocs (no open regional or national A*64 for most members): the GVA-weighted
    # share of food and consumer manufacturing in total manufacturing over the 16 European countries with A*64 data.
    num_f = num_c = den = 0.0
    for geo in [g for _, (_, _, g) in PLAYABLE.items() if g] + [g for _, (_, g) in NEIGHBOURS.items()]:
        c = val('es_national_a64', f'C|{geo}')
        num_f += val('es_national_a64', f'C10-C12|{geo}')
        num_c += (val('es_national_a64', f'C13-C15|{geo}', False) or 0) + val('es_national_a64', f'C31_C32|{geo}')
        den += c
    eu_food, eu_cons = num_f / den, num_c / den
    issue('estimate', 'blocs', f'Bloc manufacturing is split into food ({eu_food:.3f}), consumer ({eu_cons:.3f}) and industrial goods with the '
                               'European average split (15 countries with Eurostat A*64 data); no open member-level split is used.')
    for unit, (cid, name) in BLOCS.items():
        covered = [m for m in members[unit] if (WB_CODE.get(m) or (ne_codes[m].get('ISO_A3') if ne_codes[m].get('ISO_A3') not in (-99, '-99') else m)) in ppp]
        code = {m: WB_CODE.get(m) or (ne_codes[m].get('ISO_A3') if ne_codes[m].get('ISO_A3') not in (-99, '-99') else m) for m in members[unit]}
        with_pop = [m for m in members[unit] if code[m] in pop_wb]
        no_gdp = sorted(m for m in members[unit] if code[m] not in ppp)
        pop = sum(pop_wb[code[m]] for m in with_pop) / 1e6
        gdp = sum(ppp[code[m]] for m in covered) / 1e9
        pop_cov = sum(pop_wb[code[m]] for m in covered) / 1e6
        g = defaultdict(float); wsum = 0.0
        for m in covered:
            c = code[m]
            w = gdp_usd.get(c)
            sh = {k: S[f'wdi_nv_{k}_totl_zs']['values'].get(c) for k in ('agr', 'ind')}
            manf = S['wdi_nv_ind_manf_zs']['values'].get(c)
            rents = {k: (S[f'wdi_ny_gdp_{k}_rt_zs']['values'].get(c) or {}).get('value') for k in ('petr', 'ngas', 'coal', 'minr')}
            if w is None or sh['agr'] is None or manf is None:
                continue
            wsum += w
            g['food'] += w * (sh['agr'] + manf * eu_food) / 100
            g['consumer'] += w * manf * eu_cons / 100
            g['industrial'] += w * manf * (1 - eu_food - eu_cons) / 100
            g['energy'] += w * ((rents['petr'] or 0) + (rents['ngas'] or 0)) / 100
            g['materials'] += w * ((rents['coal'] or 0) + (rents['minr'] or 0)) / 100
        groups = {k: round(g[k] / wsum, 6) for k in GROUPS}
        if no_gdp:
            issue('unavailable', cid, f'{len(no_gdp)} members have no WDI GDP at PPP for 2023 and are left out of the bloc output: {", ".join(no_gdp)}. '
                                     f'Population with GDP data covers {pop_cov / pop:.1%} of the bloc population.')
        zones.append({'id': f'{cid}-all', 'name': name, 'kind': 'bloc', 'country': cid, 'members': sorted(members[unit]),
                      'population': item(round(pop, 3), ['wdi_sp_pop_totl'], 'Sum of WDI mid-2023 population over members with data'),
                      'output_target': item(gdp, ['wdi_ny_gdp_mktp_pp_cd'], f'Sum of WDI 2023 GDP at PPP over {len(covered)} of {len(members[unit])} members'),
                      'groups': item(groups, ['wdi_nv_agr_totl_zs', 'wdi_nv_ind_manf_zs', 'wdi_ny_gdp_mktp_cd', 'es_national_a64',
                                              'wdi_ny_gdp_petr_rt_zs', 'wdi_ny_gdp_ngas_rt_zs', 'wdi_ny_gdp_coal_rt_zs', 'wdi_ny_gdp_minr_rt_zs'],
                                     'GDP-weighted (US$) member shares: food = agriculture + food manufacturing, energy = oil and gas rents, '
                                     'materials = coal and mineral rents, manufacturing split by the European average', 'estimate')})
        countries.append({'id': cid, 'name': name, 'kind': 'bloc', 'gdp_ppp_bn': item(gdp, ['wdi_ny_gdp_mktp_pp_cd'], 'Sum over members with data')})
    # --- advantages: zone group share relative to the output-weighted mean share over all 61 zones, clipped
    total_out = sum(z['output_target']['value'] for z in zones)
    mean = {k: sum(z['groups']['value'][k] * z['output_target']['value'] for z in zones) / total_out for k in GROUPS}
    for z in zones:
        adv = {}
        for k in GROUPS:
            raw = z['groups']['value'][k] / mean[k]
            adv[k] = round(min(ADVANTAGE_RANGE[1], max(ADVANTAGE_RANGE[0], raw)), 4)
        adv['military'] = 1.0
        z['advantage'] = item(adv, z['groups']['sources'], f'Group share / output-weighted mean share over the 61 zones, clipped to {list(ADVANTAGE_RANGE)}; '
                                                           'military = 1 for every zone (uniform baseline, WORLD-02 decision E-3)', 'estimate')
    issue('design', 'all zones', 'Military-goods advantage is a uniform baseline (1) for every zone (WORLD-02 E-3); no open regional data on arms production.')
    fiscal(countries)
    return zones, countries, geo_doc, mean

# ---------------------------------------------------------------------------------------------- fiscal targets
def fiscal(countries):
    gdp_es = lambda geo: val('es_national_gdp', f'B1GQ|{geo}')
    for c in countries:
        iso3 = c.get('iso3')
        f = {}
        if c['kind'] == 'bloc':
            for k in ('tax_income', 'tax_consumption', 'tax_corporate', 'spend_social', 'spend_administration', 'spend_military', 'spend_infrastructure', 'debt'):
                f[k] = item(None, [], 'No open, commercially reusable fiscal aggregate for the bloc (WDI fiscal series are IMF-sourced)', 'unavailable')
            issue('unavailable', c['id'], 'Fiscal policy and debt: engine defaults (not data). Blocs are not diplomatic actors.')
            c['fiscal'] = f
            continue
        geo = PLAYABLE.get(iso3, (None, None, None))[2] if iso3 in PLAYABLE else NEIGHBOURS[iso3][1]
        if iso3 in ('GBR', 'TUR'):
            r = lambda k: val('oecd_revenue', f'{iso3}|{k}') / 100
            f['tax_income'] = item(r('T_1100') + r('T_2000'), ['oecd_revenue'], 'OECD Revenue Statistics 1100 personal income taxes + 2000 social security contributions, % GDP (E-4)')
            f['tax_corporate'] = item(r('T_1200'), ['oecd_revenue'], 'OECD 1200 corporate income taxes, % GDP')
            f['tax_consumption'] = item(r('T_5110') + r('T_5120'), ['oecd_revenue'], 'OECD 5110 general + 5120 specific taxes on goods and services, % GDP')
            f['tax_total_reference'] = item(r('_T'), ['oecd_revenue'], 'OECD total tax revenue, % GDP (coverage check)')
        else:
            t = lambda k: val('es_tax', f'{k}|{geo}') / gdp_es(geo)
            m = lambda k: val('es_government', f'{k}|{geo}') / gdp_es(geo)
            f['tax_income'] = item(t('D51A_C1') + m('D61REC'), ['es_tax', 'es_government', 'es_national_gdp'], 'ESA D51A taxes on household income + D61 social contributions, % GDP (E-4)')
            f['tax_corporate'] = item(t('D51B_C2'), ['es_tax', 'es_national_gdp'], 'ESA D51B taxes on corporate income, % GDP')
            f['tax_consumption'] = item(t('D21'), ['es_tax', 'es_national_gdp'], 'ESA D21 taxes on products (VAT, import and excise duties), % GDP')
            f['tax_total_reference'] = item(t('D2_D5_D91_D61_M_D995'), ['es_tax', 'es_national_gdp'], 'Total taxes and social contributions, % GDP (coverage check)')
        # Taxes outside the engine's three rates (property, production, capital and other taxes): folded into the
        # consumption tax so that total tax revenue matches the data (WORLD-02 DATA-SOURCES §4.4 option; decision E-5,
        # needs owner confirmation). Without this the engine's starting budget runs a structural deficit equal to the
        # uncovered taxes and debt piles up during the builder's warm-up (measured in WORLD-03; see the handoff).
        covered = f['tax_income']['value'] + f['tax_corporate']['value'] + f['tax_consumption']['value']
        other = f['tax_total_reference']['value'] - covered
        if other < 0:
            issue('estimate', c['id'], f'Covered taxes exceed the published total by {-other * 100:.2f} pp of GDP (definition differences); nothing is folded.')
            other = 0.0
        f['tax_other_folded'] = item(other, f['tax_total_reference']['sources'], 'Total taxes and contributions minus the three engine taxes, % GDP (folded into the consumption tax, E-5 option)', 'estimate')
        f['tax_consumption_engine'] = item(f['tax_consumption']['value'] + other, f['tax_total_reference']['sources'] + f['tax_consumption']['sources'],
                                           'Consumption tax target used by the engine: taxes on products + folded other taxes, % GDP', 'estimate')
        # spending
        if iso3 == 'GBR':
            g = lambda k: val('oecd_uk_government', f'GBR|{k}') / val('oecd_gdp', 'GBR')
            d = lambda k: val('oecd_uk_defence', f'GBR|{k}') / val('oecd_gdp', 'GBR')
            srcs = ['oecd_uk_government', 'oecd_uk_defence', 'oecd_gdp']
            f['spend_social'] = item(g('D62'), srcs, 'D62 social benefits other than in kind / GDP')
            f['spend_military'] = item(d('OTE'), srcs, 'COFOG 02 defence total expenditure / GDP')
            f['spend_infrastructure'] = item(g('P51G') - d('P51G'), srcs, 'General government P51G minus defence P51G / GDP')
            f['spend_administration'] = item(g('P3') - d('D1') - d('P2'), srcs, 'Final consumption P3 minus defence pay (D1) and purchases (P2) / GDP')
            f['outside_engine_categories'] = item(g('D3') + g('D41'), srcs, 'Subsidies D3 and interest D41 / GDP (interest is computed by the engine; subsidies have no category)')
        elif iso3 == 'TUR' and LICENSED:
            for k in ('spend_social', 'spend_military', 'spend_infrastructure', 'spend_administration', 'outside_engine_categories'):
                f[k] = item(None, ['oecd_eo_tur', 'wdi_tur_gfs', 'es_tr_national', 'oecd_revenue'],
                            'Licence-clean estimate; the value is set in build-licensed/budget.json (targets and estimates.tur), because no Turkish '
                            'fiscal table is cleared for redistribution (WORLD-05-FINAL)', 'estimate')
            issue('estimate', 'tur', 'Türkiye spending lines are licence-clean estimates (build-licensed/budget.json): OECD balance and taxes, '
                                     'World Bank interest, Eurostat government consumption, and the five other playable countries\' structure.')
        elif iso3 == 'TUR':
            gdp_t = val('oecd_gdp', 'TUR') * 1000       # thousand TRY, like the report
            s = lambda k: val('tr_sayistay_government', f'TUR|{k}') / gdp_t
            srcs = ['tr_sayistay_government', 'oecd_gdp']
            f['spend_social'] = item(s('social_benefits'), srcs, 'GFS social benefits (Sayıştay Table 4) / GDP', 'estimate')
            f['spend_military'] = item(s('defence_cofog02_total'), srcs, 'Defence services by function (COFOG 02, Sayıştay) / GDP')
            f['spend_infrastructure'] = item(s('net_nonfinancial_assets') + s('depreciation'), srcs,
                                             'Net acquisition of non-financial assets + depreciation (≈ gross investment, GFS) / GDP; defence investment not separable', 'estimate')
            f['spend_administration'] = item(s('personnel') + s('goods_services') - s('defence_cofog02_total'), srcs,
                                             'GFS personnel + goods and services, minus total defence (approximation: defence is not split by economic type) / GDP', 'estimate')
            f['outside_engine_categories'] = item(s('subsidies') + s('interest') + s('other_expense'), srcs, 'Subsidies, interest and other expense / GDP')
            issue('licence', 'tur', 'Türkiye spending ratios come from the Court of Accounts (Sayıştay) 2023 report, which publishes no reuse terms (W3-L1). '
                                    'GFS concepts, mapped to ESA-style categories as estimates.')
        else:
            m = lambda k: val('es_government', f'{k}|{geo}') / gdp_es(geo)
            d = lambda k: val('es_defence', f'{k}|{geo}') / gdp_es(geo)
            srcs = ['es_government', 'es_defence', 'es_national_gdp']
            f['spend_social'] = item(m('D62PAY'), srcs, 'ESA D62 social benefits other than in kind / GDP')
            f['spend_military'] = item(d('TE'), srcs, 'COFOG 02 defence total expenditure / GDP')
            f['spend_infrastructure'] = item(m('P51G') - d('P51G'), srcs, 'General government P51G minus defence P51G / GDP')
            f['spend_administration'] = item(m('P3') - d('D1') - d('P2'), srcs, 'Final consumption P3 minus defence pay (D1) and purchases (P2) / GDP')
            f['outside_engine_categories'] = item(m('D3PAY') + m('D41PAY'), srcs, 'Subsidies D3 and interest D41 / GDP')
        # debt
        if iso3 == 'TUR' and LICENSED:
            liab = sum(val('es_tr_gov_liabilities', f'{k}|TR') for k in ('F2', 'F3', 'F4'))
            debt = item(liab / val('es_tr_national', 'B1GQ|TR'), ['es_tr_gov_liabilities', 'es_tr_national'],
                        'General government consolidated liabilities in debt instruments (F2 + F3 + F4, market value) / GDP, end-2023', 'derived')
        elif iso3 == 'TUR':
            debt = item(val('tr_treasury_debt', 'TUR|EU_defined_GG_debt_pct_GDP') / 100, ['tr_treasury_debt'], 'EU-defined general government gross debt, end-2023')
        elif iso3 == 'GBR':
            debt = item(val('ons_uk_debt', 'GBR|gross_consolidated_debt_pct_GDP') / 100, ['ons_uk_debt'], 'ONS YEQJ general government gross consolidated debt (Maastricht, ESA 2010), 2023')
        elif iso3 == 'NOR':
            debt = item(val('es_debt_quarterly', 'NO') / 100, ['es_debt_quarterly'], 'Eurostat quarterly gross debt, 2023-Q4 (no annual EDP series for EFTA)')
        elif iso3 == 'CHE':
            debt = None
        else:
            debt = item(val('es_debt', geo) / 100, ['es_debt'], 'Eurostat EDP gross debt (Maastricht), end-2023')
        if debt is None:
            if c['kind'] == 'playable':
                raise Missing(f'Maastricht gross debt {iso3}')
            debt = item(None, [], 'No verified open source for end-2023 general government gross debt', 'unavailable')
            issue('unavailable', c['id'], 'Starting debt: engine default (not data).')
        elif debt['value'] > MAX_STARTING_DEBT:
            issue('engine-limit', c['id'], f'Debt {debt["value"]:.3f} x GDP exceeds the engine maximum starting debt {MAX_STARTING_DEBT}; '
                                         f'{MAX_STARTING_DEBT} is used (residual {debt["value"] - MAX_STARTING_DEBT:+.3f}). Changing the limit is an engine change: not done.')
            debt = {**debt, 'status': 'engine-limit', 'data_value': debt['value'], 'value': MAX_STARTING_DEBT}
        f['debt'] = debt
        c['fiscal'] = f

# ---------------------------------------------------------------------------------------------- military
def military(zones=None, geo_doc=None):
    w2 = json.load(open(os.path.join(W2, 'world02-defence-cofog-2023.json'), encoding='utf-8'))
    out = {'parameter_personnel_equivalents_per_division': item(25000, [], 'Provisional game-scale parameter (WORLD-02 M-2), not a historical fact', 'design'),
           'countries': {}}
    if LICENSED:
        out['parameter_personnel_equivalents_per_division'] = item(25000, [], 'Game-scale parameter approved by the owner (M-2), not a historical fact', 'design')
    for iso3, (cid, name, geo) in PLAYABLE.items():
        if iso3 == 'TUR' and LICENSED:
            continue                                   # set below from the other five (gameplay assumption)
        d1_all = w2['compensation_of_employees_total_economy_D1']['values'].get(iso3)
        emp = w2['employees_total_economy']['values'].get(iso3)
        if iso3 == 'GBR':
            d1_def = val('oecd_uk_defence', 'GBR|D1'); src_def = 'oecd_uk_defence'
        elif iso3 == 'TUR':
            d1_def = None; src_def = None
        else:
            d1_def = val('es_defence', f'D1|{geo}'); src_def = 'es_defence'
        if d1_def is None or not emp:
            spend = val('tr_sayistay_government', 'TUR|defence_cofog02_total') * 1000 / 1e6   # million TRY
            out['countries'][cid] = {'status': 'unresolved', 'divisions': None,
                                     'reason': 'No verified 2023 source splits Türkiye\'s defence spending by economic type (defence pay, ESA D1), and no '
                                               'whole-economy employee count was taken; rule W cannot be applied. Defence total by function is known '
                                               f'({spend:,.0f} million TRY, Sayıştay; licence not verified) but is not used to set forces.',
                                     'sources_checked': ['Eurostat gov_10a_exp (no TR)', 'OECD Table 11 (no TUR)', 'OECD Table 12 (no TUR 2023)',
                                                         'Sayıştay 2023 report (function totals only)', 'Ministry of National Defence 2023 report (URL returns 404)']}
            issue('unresolved', cid, 'Military starting forces unresolved (rule W inputs unavailable); not inserted in the scenario.')
            continue
        avg_pay = d1_all / emp                         # thousand LCU per employee
        pe = d1_def / avg_pay * 1000                   # persons
        out['countries'][cid] = {'status': 'draft', 'personnel_equivalents': round(pe), 'divisions': round(pe / 25000),
                                 'sources': sorted({src_def, 'world02-defence-cofog-2023'}),
                                 'method': 'defence compensation of employees (COFOG 02, D1) / (whole-economy compensation / employees) / 25,000'}
    if not LICENSED:
        return out
    # ---- WORLD-05-FINAL (draft.3): approved Rule W counts, Türkiye gameplay assumption, P-1 placement ----------------------
    import military_placement
    pop_country = defaultdict(float)
    for z in zones:
        if z['kind'] == 'province':
            pop_country[z['country']] += z['population']['value']
    for cid, v in out['countries'].items():
        v['status'] = 'data'
        v['method'] = 'Rule W (approved D3, M-2): ' + v['method']
    per_capita = sorted(v['personnel_equivalents'] / pop_country[c] for c, v in out['countries'].items())
    median = per_capita[len(per_capita) // 2]
    pe_tur = median * pop_country['tur']
    out['countries']['tur'] = {
        'status': 'assumption', 'personnel_equivalents': round(pe_tur), 'divisions': round(pe_tur / 25000),
        'sources': sorted({'es_regional_population'} | {s for c, v in out['countries'].items() for s in v['sources']}),
        'method': 'Gameplay assumption (licence-clean): Türkiye\'s personnel equivalents per inhabitant = the median of the other five playable '
                  'countries (Rule W), times the population of its nine provinces, / 25,000',
        'replaces': 'Rule W with the Ministry of Treasury and Finance budget inputs (approved M-3), held back until that source is cleared for redistribution (W5-L1)',
        'reason': 'No licence-clean 2023 source gives Türkiye\'s defence pay or defence spending: SIPRI (via WDI) is restricted, NATO publishes no reuse terms, '
                  'the Ministry tables have no reuse licence, Eurostat and the OECD have no Turkish defence data.'}
    issue('assumption', 'tur', f'Starting forces: {out["countries"]["tur"]["divisions"]} divisions by a documented gameplay assumption (median per-capita Rule W '
                               'personnel of the other five), pending clearance of the Ministry inputs for Rule W (M-3).')
    owner = {z['id']: z['country'] for z in zones if z['kind'] == 'province'}
    population = {z['id']: z['population']['value'] for z in zones if z['kind'] == 'province'}
    movement = [(l['a'], l['b']) for l in geo_doc['movement']]
    counts = {c: v['divisions'] for c, v in out['countries'].items()}
    alloc, details = military_placement.place(owner, population, movement, counts, frontier_bonus=1.0)
    out['placement'] = {
        'rule': 'P-1', 'status': 'provisional gameplay configuration (owner decision P-1); illustrative, not a historical order of battle',
        'method': 'one division per reachable province; the remainder by population x (1 + frontier), largest remainder (scenarios/pipeline/military_placement.py)',
        'byRegion': alloc, 'regions': details,
        'isolation': 'Under the current movement rules the UK, Türkiye and four islands cannot engage other countries: accepted for the prototype only (P-2)',
    }
    return out

def main():
    try:
        zones, countries, geo, mean = build()
        mil = military(zones, geo)
    except Missing as error:
        print(f'MANDATORY INPUT MISSING: {error}. Nothing written.', file=sys.stderr)
        sys.exit(2)
    zone_ids = {z['id'] for z in zones}
    gz = {z['id'] for z in geo['zones']}
    if zone_ids != gz:
        print(f'Zone mismatch with geography: {sorted(zone_ids ^ gz)}', file=sys.stderr)
        sys.exit(2)
    doc = {'scenario': 'europe-2023', 'reference_year': 2023, 'zones': zones, 'countries': countries,
           'group_mean_shares': {k: round(v, 6) for k, v in mean.items()}, 'military': mil,
           'issues': sorted(issues, key=lambda i: (i['kind'], i['subject'])),
           'sources': {sid: {k: S[sid].get(k) for k in ('publisher', 'dataset', 'title', 'query', 'retrieved', 'publisher_updated', 'licence', 'licence_status', 'attribution')}
                       for sid in sorted(S)}}
    os.makedirs(BUILD_OUT, exist_ok=True)
    with open(os.path.join(BUILD_OUT, 'inputs.json'), 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
        f.write('\n')
    kinds = defaultdict(int)
    for i in issues:
        kinds[i['kind']] += 1
    print(f'{len(zones)} zones, {len(countries)} countries; issues: {dict(kinds)}')

if __name__ == '__main__':
    main()
