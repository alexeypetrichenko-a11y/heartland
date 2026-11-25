#!/usr/bin/env python3
"""
WORLD-05 (network): fetch the candidate 2023 inputs for Türkiye and write an auditable snapshot.

Writes docs/world/data/world05-turkiye-inputs.json with, for every value, the publisher, the exact URL, the
retrieval date, the SHA-256 of any downloaded file, the licence text and its verification status. Downloads are
read in a temporary directory; only their hashes and the extracted values are kept.

Sources (WORLD-05 report §1 and §3):
  1. Eurostat nama_10_gdp (D1, B1GQ) and lfsa_eegan2 (employees), geo=TR. Eurostat's notice allows commercial reuse
     with acknowledgement for official EU candidate countries, which includes Türkiye (verified 2026-11-25).
  2. OECD Economic Outlook (DSD_EO@DF_EO): general government net lending, % of GDP (OECD terms: search only).
  3. Ministry of Treasury and Finance (Muhasebat), general government GFS workbook 2008-2026: 2023 statement of
     operations and defence by function. Official statistics; no published reuse licence (NOT VERIFIED).
  4. Ministry of Treasury and Finance (Muhasebat), central government budget outturn 2023 by function x economic
     type (December, cumulative): defence personnel and state social security contributions (NOT VERIFIED).

Run from the repository root:  python3 docs/world/tools/world05_turkiye_inputs.py
Standard library only, plus LibreOffice (soffice) to read the one legacy .xls table (source 4).
"""
import csv, datetime, hashlib, importlib.util, io, json, os, re, subprocess, sys, tempfile, urllib.parse, urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
OUT = os.path.join(ROOT, 'docs', 'world', 'data', 'world05-turkiye-inputs.json')
TODAY = datetime.date.today().isoformat()
UA = {'User-Agent': 'Mozilla/5.0 (heartland world-05 data pipeline)'}
sys.dont_write_bytecode = True  # importing the shared reader must not rewrite scenarios/pipeline/__pycache__ (tracked)
_spec = importlib.util.spec_from_file_location('xlsx', os.path.join(ROOT, 'scenarios', 'pipeline', 'xlsx.py'))
xlsx = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(xlsx)

EUROSTAT = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data'
OECD_EO = 'https://sdmx.oecd.org/public/rest/data/OECD.ECO.MAD,DSD_EO@DF_EO,/TUR.NLGQ.A?startPeriod=2023&endPeriod=2023'
MUHASEBAT_FILES = 'https://muhasebat.hmb.gov.tr/portal/v2//files'
GG_LISTING = {'name': 'Genel Yönetim Sektörü Mali İstatistikleri (GFSM 2014 ile Uyumlu)', 'id': '3953'}
BUDGET_LISTING = {'name': 'Bütçe Gider Tabloları', 'id': '3770'}  # 2023 central government budget expenditure tables

LIC = {
    'eurostat': ('Eurostat copyright notice: reuse "for commercial or non-commercial purposes is authorised provided the '
                 'source is acknowledged"; the commercial-reuse exception covers data for countries other than EU and EFTA '
                 'members and official EU acceding and candidate countries (Türkiye is a candidate country)',
                 'Source: Eurostat', 'verified (primary, https://ec.europa.eu/eurostat/help/copyright-notice, 2026-11-25)'),
    'oecd': ('OECD Terms and Conditions: written content from 1 July 2024 under CC BY 4.0; the data section says data '
             'may be subject to restrictions beyond those terms', 'Source: OECD Economic Outlook',
             'search only (oecd.org blocks automated reading); confirm the data section in a browser'),
    'muhasebat': ('No reuse licence published by the Ministry of Treasury and Finance for these tables (checked the '
                  'Muhasebat and hmb.gov.tr sites and the table metadata, 2026-11-25). Official statistics under the '
                  'Official Statistics Programme (Law 5429).',
                  'Source: Republic of Türkiye Ministry of Treasury and Finance, General Directorate of Public Accounts',
                  'NOT VERIFIED: official statistics without a published reuse licence (WORLD-05 licensing risk W5-L1)'),
}


def get(url, headers=None, timeout=180):
    req = urllib.request.Request(url, headers={**UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def eurostat(code, query):
    url = f'{EUROSTAT}/{code}?format=JSON&lang=EN&geo=TR&time=2023&{query}'
    d = json.loads(get(url))
    vals = list(d['value'].values())
    if len(vals) != 1:
        raise SystemExit(f'{code}: expected one value, got {vals}')
    return {'value': vals[0], 'unit': d['dimension']['unit']['category']['label'] if 'unit' in d['dimension'] else None,
            'query': url, 'publisher_updated': d.get('updated'), 'dataset': code}


def muhasebat_links(listing):
    q = urllib.parse.urlencode(listing)
    content = json.loads(get(f'{MUHASEBAT_FILES}?{q}'))['content']
    return {re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', lab)).strip(): href
            for href, lab in re.findall(r'<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', content, flags=re.S)}


def download(url, folder, name):
    data = get(url)
    path = os.path.join(folder, name)
    with open(path, 'wb') as f:
        f.write(data)
    return path, hashlib.sha256(data).hexdigest(), len(data)


def gg_workbook(folder):
    links = muhasebat_links(GG_LISTING)
    title, url = next((t, u) for t, u in links.items() if t.startswith('Genel Yönetim Sektörü Mali İstatistikleri 20'))
    path, sha, size = download(url, folder, 'gg.xlsx')

    def column(rows, header):
        width = max(len(r) for r in rows[:4])
        for j in range(width):
            text = ' '.join(str(rows[i][j]) for i in range(3) if j < len(rows[i]) and rows[i][j] is not None)
            if re.search(header, text):
                return j
        raise SystemExit(f'column {header!r} not found')

    def by_code(rows, col, codes):
        out = {}
        for r in rows[3:]:
            if not r or r[0] is None:
                continue
            key = str(r[0]).strip()
            key = key[:-2] if key.endswith('.0') else key
            if key in codes and col < len(r) and isinstance(r[col], float):
                out[codes[key]] = r[col]
        missing = set(codes.values()) - set(out)
        if missing:
            raise SystemExit(f'rows not found: {sorted(missing)}')
        return out

    ops_rows = xlsx.read(path, 'FAALİYET TABLOSU')
    ops = by_code(ops_rows, column(ops_rows, r'Genel Yönetim Sektörü\s+2023 YILI'), {
        '1': 'revenue', '11': 'taxes', '12': 'social_contributions', '13': 'grants_received', '14': 'other_revenue',
        '2': 'expense', '21': 'compensation_of_employees', '22': 'goods_and_services', '23': 'consumption_of_fixed_capital',
        '24': 'interest', '25': 'subsidies', '26': 'grants_paid', '27': 'social_benefits', '28': 'other_expense',
        '31': 'net_investment_nonfinancial_assets', '2M': 'outlays', 'NBV/NBA': 'net_lending'})
    fun_rows = xlsx.read(path, 'HAR.FONK.SINIF.TABLOSU')
    fun = by_code(fun_rows, column(fun_rows, r'Genel Yönetim Sektörü\s+2023 YILI'), {
        '702': 'defence', '7021': 'military_defence', '7022': 'civil_defence', '7023': 'foreign_military_aid',
        '7025': 'defence_research'})
    return {'title': title, 'url': url, 'sha256': sha, 'bytes': size, 'sheet_operations': 'FAALİYET TABLOSU',
            'sheet_functions': 'HAR.FONK.SINIF.TABLOSU', 'column': 'Genel Yönetim Sektörü 2023 YILI',
            'unit': 'million TRY', 'operations': ops, 'functions': fun}


def budget_table(folder):
    links = muhasebat_links(BUDGET_LISTING)
    title, url = next((t, u) for t, u in links.items() if t.endswith('Eko_Fonk'))
    path, sha, size = download(url, folder, 'ekofonk.xls')
    out_dir = os.path.join(folder, 'csv')
    filt = 'csv:Text - txt - csv (StarCalc):44,34,76,1,,0,false,true,false,false,false,-1'
    subprocess.run(['soffice', '--headless', '--norestore', '--convert-to', filt, '--outdir', out_dir, path],
                   check=True, capture_output=True, timeout=300)
    sheet = next(f for f in os.listdir(out_dir) if f.endswith('ARALIK.csv'))  # December = full year, cumulative
    rows = list(csv.reader(open(os.path.join(out_dir, sheet), encoding='utf-8')))
    title_row = next(c for r in rows for c in r if 'ARALIK' in c and '2023' in c)
    head = next(r for r in rows if any('Personel' in c for c in r))
    cols = {name.strip(): i for i, name in enumerate(head) if name.strip()}
    defence = next(r for r in rows if len(r) > 1 and r[1].strip() == 'Savunma Hizmetleri')
    num = lambda r, c: float(r[cols[c]]) / 1000 if r[cols[c]].strip() else 0.0  # thousand -> million TRY
    values = {
        'personnel': num(defence, 'Personel Giderleri'),
        'state_social_security_contributions': num(defence, 'Sosyal Güvenlik  Kurumlarına Ödemeler'),
        'goods_and_services': num(defence, 'Mal ve Hizmet Alımları'),
        'current_transfers': num(defence, 'Cari Transferler'),
        'capital_expenditure': num(defence, 'Sermaye Giderleri'),
        'capital_transfers': num(defence, 'Sermaye Transferleri'),
        'total': num(defence, 'Toplam'),
    }
    return {'title': title, 'url': url, 'sha256': sha, 'bytes': size, 'sheet': 'ARALIK (December, cumulative)',
            'table_title': title_row.strip(), 'row': 'Savunma Hizmetleri (COFOG 02, central government budget)',
            'unit': 'million TRY (published in thousand TRY)', 'defence': values}


def main():
    with tempfile.TemporaryDirectory() as tmp:
        d1 = eurostat('nama_10_gdp', 'unit=CP_MNAC&na_item=D1')
        gdp = eurostat('nama_10_gdp', 'unit=CP_MNAC&na_item=B1GQ')
        emp = eurostat('lfsa_eegan2', 'sex=T&age=Y_GE15&nace_r2=TOTAL')
        eo = list(csv.DictReader(io.StringIO(get(OECD_EO, {'Accept': 'application/vnd.sdmx.data+csv; charset=utf-8'}).decode('utf-8'))))
        gg = gg_workbook(tmp)
        bud = budget_table(tmp)
    out = {
        'note': 'WORLD-05 candidate inputs for Türkiye, 2023. Not used by any scenario package. See docs/world/WORLD-05-REPORT.md.',
        'retrieved': TODAY,
        'reference_year': 2023,
        'eurostat': {'licence': LIC['eurostat'][0], 'attribution': LIC['eurostat'][1], 'licence_status': LIC['eurostat'][2],
                     'compensation_of_employees_D1': {**d1, 'unit': 'million TRY'},
                     'gdp_B1GQ': {**gdp, 'unit': 'million TRY'},
                     'employees_lfs_15plus': {**emp, 'unit': 'thousand persons',
                                              'note': 'Labour Force Survey employees; Eurostat has no national-accounts employee count (nama_10_a10_e) for TR'}},
        'oecd_economic_outlook': {'licence': LIC['oecd'][0], 'attribution': LIC['oecd'][1], 'licence_status': LIC['oecd'][2],
                                  'query': OECD_EO, 'net_lending_pct_gdp': float(eo[0]['OBS_VALUE']),
                                  'dataflow': eo[0]['DATAFLOW']},
        'muhasebat_general_government_gfs': {'licence': LIC['muhasebat'][0], 'attribution': LIC['muhasebat'][1],
                                             'licence_status': LIC['muhasebat'][2], **gg},
        'muhasebat_central_budget_defence': {'licence': LIC['muhasebat'][0], 'attribution': LIC['muhasebat'][1],
                                             'licence_status': LIC['muhasebat'][2], **bud},
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(out, f, indent=1, ensure_ascii=False, sort_keys=True)
        f.write('\n')
    print(f'wrote {os.path.relpath(OUT, ROOT)}')


if __name__ == '__main__':
    main()
