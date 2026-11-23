#!/usr/bin/env python3
"""
WORLD-03-FINAL (offline, deterministic): 2023 general-government budget reconciliation and the draft.2 fiscal
mapping. Writes scenarios/europe-2023/build/budget.json.

For each of the 6 playable countries and 10 simulated neighbours, all as % of GDP:

  observed   TR (total revenue), TE (total expenditure), B9 (net lending) and their ESA components
             (Eurostat gov_10a_main; OECD Table 12 for the UK; the Court of Accounts GFS report for Turkiye,
             review-only because its reuse terms are not verified).
  mapping    the engine's budget lines:
               revenue   income tax, consumption tax, corporate tax (taxes and social contributions, all of them),
                         tariffs (customs duties kept by national government), firm dividends + central-bank profit
                         (property income: distributed income of corporations, D42);
               spending  administration = cash cost of government's own production (P2 + D1 + D632 - sales
                         P11_P12_P131), minus defence pay and purchases; military = COFOG 02 total; infrastructure =
                         P51G minus defence P51G; social = D62 cash benefits + the net of every flow the engine has no
                         line for (subsidies, other current and capital transfers, other taxes paid, non-produced
                         assets, inventories, pension adjustment) minus revenue it has no line for (interest, rents,
                         other property income, current and capital transfers received, other subsidies received);
               interest  D41 (the engine computes it from debt x the stock's average rate, ECON-08).
             By construction  engine revenue - engine spending - interest = B9  when every line hits its target, so
             the 2023 balance becomes an explicit, comparable calibration target.
  correction WORLD-03 (1.0.0-draft.1) mapped administration to P3, which includes consumption of fixed capital
             (P51C, a non-cash cost) and is not the cash concept the engine pays; draft.2 uses the cash concept.

Run from the repository root:  python3 scenarios/pipeline/build_budget.py
"""
import json, os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, 'scenarios', 'europe-2023', 'sources')
BUILD = os.path.join(ROOT, 'scenarios', 'europe-2023', 'build')
S = lambda n: json.load(open(os.path.join(SRC, f'{n}.json'), encoding='utf-8'))['values']
GEO = {'fra': 'FR', 'deu': 'DE', 'ita': 'IT', 'pol': 'PL', 'irl': 'IE', 'esp': 'ES', 'nld': 'NL', 'bel': 'BE', 'che': 'CH',
       'aut': 'AT', 'cze': 'CZ', 'nor': 'NO', 'grc': 'EL', 'bgr': 'BG'}
EU_MEMBERS = {'FR', 'DE', 'IT', 'PL', 'IE', 'ES', 'NL', 'BE', 'AT', 'CZ', 'EL', 'BG'}   # customs duties are EU revenue
issues = []

def esa(cid, geo):
    g = S('es_government_accounts')
    gdp = S('es_national_gdp')[f'B1GQ|{geo}']
    tax = S('es_tax')
    val = lambda k: g.get(f'{k}|{geo}')
    def v(k, default=None):
        x = val(k)
        if x is None:
            if default is None:
                raise SystemExit(f'{cid}: {k} missing')
            issues.append({'country': cid, 'item': k, 'text': f'{k} not published for {geo}; taken as {default}'})
            return default
        return x
    d = S('es_defence')
    defence = {k: d[f'{k}|{geo}'] for k in ('TE', 'D1', 'P2', 'P51G')}
    taxes = tax[f'D2_D5_D91_D61_M_D995|{geo}']
    customs = S('es_customs').get(f'S13|{geo}')
    if customs is None:
        issues.append({'country': cid, 'item': 'D2121 S13', 'text': f'customs duties kept by national government not published for {geo}; taken as 0 (EU member: duties are EU revenue)'})
        customs = 0.0
    sales = v('P11_P12_P131')
    dividends = v('D42REC', 0.0)
    flows = {
        'TR': v('TR'), 'TE': v('TE'), 'B9': v('B9'), 'taxes': taxes, 'customs_kept': customs, 'sales': sales, 'dividends_D42': dividends,
        'P2': v('P2'), 'D1': v('D1PAY'), 'D632': v('D632PAY'), 'D62': v('D62PAY'), 'P51G': v('P51G'), 'P51C': v('P51C'), 'D41': v('D41PAY'),
        'def_TE': defence['TE'], 'def_D1': defence['D1'], 'def_P2': defence['P2'], 'def_P51G': defence['P51G'],
        'D3': v('D3PAY'), 'D7_paid': v('D7PAY'), 'D9_paid': v('D9PAY'), 'D7_received': v('D7REC'), 'D9_received_ex_D91': v('D9REC') - v('D91REC', 0.0),
        'property_income_ex_D42': v('D4REC') - dividends,
    }
    return flows, gdp, ['es_government_accounts', 'es_tax', 'es_defence', 'es_customs', 'es_national_gdp']

def uk():
    u = S('oecd_uk_government_accounts')
    gdp = S('oecd_gdp')['GBR']
    val = lambda t, e: u.get(f'GBR|{t}|{e}', 0.0)
    d = S('oecd_uk_defence')
    taxes = val('D2', 'C') + val('D5', 'C') + val('D91', 'C') + val('D61', 'C')
    customs = S('oecd_customs')['GBR|T_5123'] / 100 * gdp
    flows = {
        'TR': val('OTR', 'C'), 'TE': val('OTE', 'D'), 'B9': val('B9', 'B'), 'taxes': taxes, 'customs_kept': customs,
        'sales': val('P1M', 'C') + val('P131', 'C'), 'dividends_D42': val('D42', 'C'),
        'P2': val('P2', 'D'), 'D1': val('D1', 'D'), 'D632': val('D632', 'D'), 'D62': val('D62', 'D'), 'P51G': val('P51G', 'D'),
        'P51C': val('P51C', 'D'), 'D41': val('D41', 'D'),
        'def_TE': d['GBR|OTE'], 'def_D1': d['GBR|D1'], 'def_P2': d['GBR|P2'], 'def_P51G': d['GBR|P51G'],
        'D3': val('D3', 'D'), 'D7_paid': val('D7', 'D'), 'D9_paid': val('D9', 'D'), 'D7_received': val('D7', 'C'),
        'D9_received_ex_D91': val('D9', 'C') - val('D91', 'C'), 'property_income_ex_D42': val('D4', 'C') - val('D42', 'C'),
    }
    return flows, gdp, ['oecd_uk_government_accounts', 'oecd_uk_defence', 'oecd_customs', 'oecd_gdp']

def turkey():
    """GFS report (Sayistay), review-only. Expense includes depreciation; gross investment = net NFA + depreciation."""
    t = {k.split('|')[1]: v for k, v in S('tr_sayistay_government').items()}
    gdp = S('oecd_gdp')['TUR'] * 1000          # thousand TRY, like the report
    taxes = S('oecd_revenue')['TUR|_T'] / 100 * gdp
    customs = S('oecd_customs')['TUR|T_5123'] / 100 * gdp
    expense = t['expense_total']
    revenue = expense - t['depreciation'] + (t['net_nonfinancial_assets'] + t['depreciation']) - 0  # placeholder replaced below
    te = expense + t['net_nonfinancial_assets']
    b9 = -1308816486.95                       # Table 11: net lending (thousand TRY), 2023
    tr = te + b9
    flows = {
        'TR': tr, 'TE': te, 'B9': b9, 'taxes': taxes, 'customs_kept': customs, 'sales': 0.0, 'dividends_D42': 0.0,
        'P2': t['goods_services'], 'D1': t['personnel'], 'D632': 0.0, 'D62': t['social_benefits'],
        'P51G': t['net_nonfinancial_assets'] + t['depreciation'], 'P51C': t['depreciation'], 'D41': t['interest'],
        'def_TE': t['defence_cofog02_total'], 'def_D1': None, 'def_P2': None, 'def_P51G': None,
        'D3': t['subsidies'], 'D7_paid': t['other_expense'], 'D9_paid': 0.0, 'D7_received': 0.0, 'D9_received_ex_D91': 0.0,
        'property_income_ex_D42': 0.0,
    }
    del revenue
    issues.append({'country': 'tur', 'item': 'all spending lines', 'text': 'GFS concepts from the Court of Accounts report (licence not verified): review-only, not distributable. '
                   'Defence is not split by type, so administration keeps all personnel and goods-and-services spending and the defence total is taken out of it; '
                   'other revenue (non-tax) is folded with the other expense. TurkStat "Government Accounts 2023" (verified licence) reports a 4.8% deficit, '
                   'consistent with this report\'s 4.83%, but its tables need an authenticated TurkStat portal.'})
    return flows, gdp, ['tr_sayistay_government', 'oecd_revenue', 'oecd_customs', 'oecd_gdp']

def mapping(cid, flows, gdp, eu):
    f = {k: (v / gdp if isinstance(v, (int, float)) else v) for k, v in flows.items()}
    if f['def_D1'] is None:                      # Turkiye: defence not split by type
        admin = f['P2'] + f['D1'] + f['D632'] - f['sales'] - f['def_TE']
        infra = f['P51G']
        defence_other = 0.0
    else:
        admin = f['P2'] + f['D1'] + f['D632'] - f['sales'] - f['def_D1'] - f['def_P2']
        infra = f['P51G'] - f['def_P51G']
        defence_other = f['def_TE'] - f['def_D1'] - f['def_P2'] - f['def_P51G']
    # Everything else, by identity: other expenditure (incl. subsidies, transfers, other taxes paid, NP, D8, inventories)
    # minus other revenue (property income except D42, transfers received, other subsidies received).
    mapped_spending = f['P2'] + f['D1'] + f['D632'] + f['D62'] + f['P51G'] + f['D41'] + defence_other
    other_spending = f['TE'] - mapped_spending
    other_revenue = f['TR'] - f['taxes'] - f['sales'] - f['dividends_D42']
    net_other = other_spending - other_revenue
    social = f['D62'] + net_other
    tariff = f['customs_kept']
    engine_revenue = f['taxes'] + f['dividends_D42']
    engine_spending = admin + social + f['def_TE'] + infra
    balance_check = engine_revenue - engine_spending - f['D41']
    return {
        'observed': {'revenue': f['TR'], 'expenditure': f['TE'], 'net_lending': f['B9'], 'taxes_and_contributions': f['taxes'],
                     'sales': f['sales'], 'dividends_D42': f['dividends_D42'], 'interest_paid': f['D41'], 'subsidies': f['D3'],
                     'other_current_transfers_paid': f['D7_paid'], 'capital_transfers_paid': f['D9_paid'], 'other_current_transfers_received': f['D7_received'],
                     'capital_transfers_received_ex_capital_taxes': f['D9_received_ex_D91'], 'property_income_ex_dividends': f['property_income_ex_D42'],
                     'consumption_of_fixed_capital': f['P51C'], 'customs_kept_by_national_government': f['customs_kept']},
        'targets': {'tariff_revenue': tariff, 'dividends_and_bank_profit': f['dividends_D42'], 'spend_administration': admin, 'spend_social': social,
                    'spend_military': f['def_TE'], 'spend_infrastructure': infra, 'net_lending': f['B9'],
                    'net_other_folded_into_social': net_other, 'customs_inside_taxes': 0.0 if eu else tariff},
        'identity_check': balance_check - f['B9'],
        'draft1_administration_P3_basis': None,
    }

def main():
    out = {}
    for cid, geo in GEO.items():
        flows, gdp, srcs = esa(cid, geo)
        out[cid] = {**mapping(cid, flows, gdp, geo in EU_MEMBERS), 'sources': srcs, 'euro_customs_union': geo in EU_MEMBERS,
                    'licence': 'verified'}
    flows, gdp, srcs = uk()
    out['gbr'] = {**mapping('gbr', flows, gdp, False), 'sources': srcs, 'euro_customs_union': False, 'licence': 'verified'}
    flows, gdp, srcs = turkey()
    out['tur'] = {**mapping('tur', flows, gdp, False), 'sources': srcs, 'euro_customs_union': False,
                  'licence': 'NOT VERIFIED (Court of Accounts report): review-only, not distributable'}
    inputs = json.load(open(os.path.join(BUILD, 'inputs.json'), encoding='utf-8'))
    for c in inputs['countries']:
        if c['id'] in out:
            v = out[c['id']]
            v['draft1_administration_P3_basis'] = c['fiscal']['spend_administration']['value']
            # The engine's tax targets (inputs.json) must sum to the same taxes-and-contributions total the balance uses.
            # They do for every ESA country; the UK's come from OECD Revenue Statistics, which leave out imputed social
            # contributions (about 1.8% of GDP) that national accounts record as revenue and inside pay (D1). The split is
            # kept and scaled to the national-accounts total, as for the ESA countries.
            engine_taxes = sum(c['fiscal'][k]['value'] for k in ('tax_income', 'tax_consumption_engine', 'tax_corporate'))
            v['targets']['tax_scale_to_national_accounts'] = v['observed']['taxes_and_contributions'] / engine_taxes
            v['observed']['taxes_draft1_inputs'] = engine_taxes
    # Switzerland: no Eurostat debt. OECD balance sheets: F2 + F3 + F4, all maturities, non-consolidated (an estimate).
    che_debt = S('oecd_che_debt')
    gdp_ch = S('es_national_gdp')['B1GQ|CH']
    ratio = (che_debt['CHE|F2'] + che_debt['CHE|F3'] + che_debt['CHE|F4']) / gdp_ch
    out['che']['starting_debt'] = {'value': ratio, 'status': 'estimate', 'sources': ['oecd_che_debt', 'es_national_gdp'],
                                   'method': 'F2 + F3 + F4 liabilities of general government, non-consolidated, / GDP'}
    out['che']['effective_rate'] = out['che']['observed']['interest_paid'] / ratio
    issues.append({'country': 'che', 'item': 'starting debt', 'text': f'No Eurostat or national consolidated figure in the pipeline; OECD non-consolidated '
                   f'debt instruments give {ratio * 100:.1f}% of GDP (estimate). Consolidated (Maastricht) debt may be somewhat lower.'})
    doc = {'note': 'WORLD-03-FINAL budget reconciliation, 2023, % of GDP (fractions). See the script header for the mapping.',
           'countries': out, 'issues': issues}
    with open(os.path.join(BUILD, 'budget.json'), 'w', encoding='utf-8') as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=1); fh.write('\n')
    print('| Country | Revenue | Expenditure | Net lending | Taxes+SSC | D42 | Admin draft.1 (P3) -> cash | Social D62 + net other | Military | Infra | Customs kept | Identity |')
    for cid, v in out.items():
        o, t = v['observed'], v['targets']
        pct = lambda x: f'{x * 100:6.2f}'
        print(f"| {cid} | {pct(o['revenue'])} | {pct(o['expenditure'])} | {pct(o['net_lending'])} | {pct(o['taxes_and_contributions'])} | {pct(o['dividends_D42'])} | "
              f"{pct(v['draft1_administration_P3_basis'])} -> {pct(t['spend_administration'])} | {pct(o['dividends_D42'] * 0 + t['spend_social'] - t['net_other_folded_into_social'])} + {pct(t['net_other_folded_into_social'])} | "
              f"{pct(t['spend_military'])} | {pct(t['spend_infrastructure'])} | {pct(t['tariff_revenue'])} | {v['identity_check']:.1e} |")
    for i in issues:
        print('-', i['country'], i['item'], i['text'][:150])

if __name__ == '__main__':
    main()
