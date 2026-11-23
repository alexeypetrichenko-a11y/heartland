#!/usr/bin/env python3
"""
WORLD-03 step 1 (network): fetch the verified 2023 public statistics and write small, auditable snapshots.

Every snapshot in scenarios/europe-2023/sources/<id>.json records the publisher, dataset, exact query URL,
retrieval date, the publisher's own "last updated" stamp where it gives one, the licence and the attribution
text, and only the values the pipeline uses (raw API numbers, unrounded). Large downloads (ONS workbooks,
PDF reports) are read in a temporary directory and only their SHA-256 and the extracted values are kept.

Everything after this step is offline and deterministic: build_inputs.py reads only these snapshots and the
WORLD-02 draft data. Re-running this script can change values if a publisher revises its data; the snapshot
dates and hashes make that visible in review.

Run from the repository root:  python3 scenarios/pipeline/fetch_sources.py [--only id,id]
Standard library only (plus pdftotext for the two Turkish PDF reports, used only by the 'tr_*' sources).
"""
import csv, datetime, hashlib, http.client, io, json, os, re, subprocess, sys, tempfile, time, urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'scenarios', 'europe-2023', 'sources')
WORLD = os.path.join(ROOT, 'docs', 'world', 'data')
sys.path.insert(0, os.path.dirname(__file__))
import xlsx  # noqa: E402  (local minimal reader)

TODAY = datetime.date.today().isoformat()
EUROSTAT = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data'
OECD = 'https://sdmx.oecd.org/public/rest/data'
WB = 'https://api.worldbank.org/v2'
UA = {'User-Agent': 'Mozilla/5.0 (heartland world-03 data pipeline)'}

LICENCES = {
    'eurostat': ('Eurostat copyright notice: reuse authorised, commercial or not, provided the source is acknowledged '
                 '(UK data excluded from commercial reuse; none is taken from Eurostat)', 'Source: Eurostat', 'verified (primary)'),
    'ons': ('Open Government Licence v3.0', 'Source: Office for National Statistics licensed under the Open Government Licence v.3.0', 'verified (primary)'),
    'oecd': ('CC BY 4.0', 'Source: OECD', 'verified (search only; oecd.org blocks automated reading)'),
    'worldbank': ('CC BY 4.0 (World Bank WDI); third-party series are not used', 'Source: World Bank, World Development Indicators', 'verified (primary)'),
    'tr_treasury': ('Republic of Türkiye Ministry of Treasury and Finance: "May not be copied or duplicated, in whole or in part without reference."',
                    'Source: Republic of Türkiye Ministry of Treasury and Finance, Public Debt Management Report', 'verified (primary): reuse with reference; commercial use not addressed'),
    'tr_sayistay': ('No reuse terms published on sayistay.gov.tr (checked 2026-11-22)', 'Source: T.C. Sayıştay Başkanlığı, 2023 Yılı Mali İstatistikleri Değerlendirme Raporu',
                    'NOT VERIFIED: official public report without published reuse terms (licensing risk W3-L1)'),
}

def get(url, binary=False, attempts=4):
    for attempt in range(attempts):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=180) as r:
                data = r.read()
            return data if binary else data.decode('utf-8')
        except (OSError, http.client.IncompleteRead) as error:
            if attempt == attempts - 1:
                raise
            print(f'  retry {attempt + 1} after {type(error).__name__}: {url[:80]}')
            time.sleep(5 * (attempt + 1))

def save(sid, publisher, dataset, title, url, values, updated=None, notes=None, extra=None):
    lic, attribution, status = LICENCES[publisher]
    doc = {'id': sid, 'publisher': publisher, 'dataset': dataset, 'title': title, 'query': url, 'retrieved': TODAY,
           'publisher_updated': updated, 'licence': lic, 'licence_status': status, 'attribution': attribution,
           'reference_year': 2023, 'notes': notes or [], 'values': values}
    if extra:
        doc.update(extra)
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, f'{sid}.json'), 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write('\n')
    n = sum(len(v) if isinstance(v, dict) else 1 for v in values.values()) if isinstance(values, dict) else len(values)
    print(f'{sid}: {n} values ({dataset})')

# ---------------------------------------------------------------------------------------------- Eurostat
def eurostat(dataset, params):
    """JSON-stat 2.0 -> {'dim1|dim2|...': value} over the non-singleton dimensions, plus status flags."""
    url = f'{EUROSTAT}/{dataset}?' + '&'.join(params)
    d = json.loads(get(url))
    if 'error' in d:
        raise SystemExit(f'Eurostat {dataset}: {d["error"]}')
    ids, sizes = d['id'], d['size']
    cats = [sorted(d['dimension'][k]['category']['index'].items(), key=lambda kv: kv[1]) for k in ids]
    keep = [i for i, s in enumerate(sizes) if s > 1 or ids[i] == 'geo']   # the country/region is always part of the key
    values, flags = {}, {}
    total = 1
    for s in sizes:
        total *= s
    for flat in range(total):
        rem, coord = flat, []
        for s in reversed(sizes):
            coord.append(rem % s); rem //= s
        coord.reverse()
        key = '|'.join(cats[i][coord[i]][0] for i in keep)
        v = d['value'].get(str(flat))
        values[key] = v
        st = d.get('status', {}).get(str(flat))
        if st:
            flags[key] = st
    dims = '|'.join(ids[i] for i in keep)
    return url, values, flags, d.get('updated'), dims

def es_save(sid, dataset, title, params, notes=None):
    url, values, flags, updated, dims = eurostat(dataset, params)
    save(sid, 'eurostat', dataset, title, url, values, updated, notes, {'key': dims, 'flags': flags})

PROVINCE_UNITS = sorted({u for p in json.load(open(os.path.join(WORLD, 'world02-provinces.json'), encoding='utf-8'))
                         for u in p['statistical_units'] if not u.startswith('TL')})
ES_PLAYABLE = ['FR', 'DE', 'IT', 'PL', 'TR']
ES_NEIGHBOURS = ['IE', 'ES', 'NL', 'BE', 'CH', 'AT', 'CZ', 'NO', 'EL', 'BG']

def fetch_eurostat():
    geo = [f'geo={g}' for g in PROVINCE_UNITS + ES_PLAYABLE]
    nace = [f'nace_r2={n}' for n in ['TOTAL', 'A', 'B-E', 'C', 'F', 'G-I', 'J', 'K', 'L', 'M_N', 'O-Q', 'R-U']]
    es_save('es_regional_gva', 'nama_10r_3gva', 'Gross value added at basic prices by NUTS region and NACE A*10, million national currency',
            ['time=2023', 'unit=CP_MNAC'] + geo + nace)
    es_save('es_regional_population', 'demo_r_pjanaggr3', 'Population on 1 January by NUTS region',
            ['time=2023', 'time=2024', 'sex=T', 'age=TOTAL', 'unit=NR'] + [f'geo={g}' for g in PROVINCE_UNITS])
    countries = [f'geo={g}' for g in ES_PLAYABLE + ES_NEIGHBOURS]
    es_save('es_national_a64', 'nama_10_a64', 'National gross value added by NACE (selected A*64 items), million national currency',
            ['time=2023', 'unit=CP_MNAC', 'na_item=B1G'] + countries
            + [f'nace_r2={n}' for n in ['TOTAL', 'A', 'B', 'C', 'C10-C12', 'C13-C15', 'C31_C32', 'D', 'E', 'F']])
    es_save('es_national_gdp', 'nama_10_gdp', 'GDP and gross value added, current prices, million national currency',
            ['time=2023', 'unit=CP_MNAC', 'na_item=B1GQ', 'na_item=B1G'] + countries)
    es_save('es_national_population', 'demo_pjan', 'Population on 1 January',
            ['time=2023', 'time=2024', 'sex=T', 'age=TOTAL', 'unit=NR'] + [f'geo={g}' for g in ES_NEIGHBOURS])
    es_save('es_tax', 'gov_10a_taxag', 'Main national accounts tax aggregates, general government, million national currency',
            ['time=2023', 'unit=MIO_NAC', 'sector=S13', 'na_item=D51A_C1', 'na_item=D51B_C2', 'na_item=D21', 'na_item=D2_D5_D91_D61_M_D995'] + countries[:4] + countries[5:])
    es_save('es_government', 'gov_10a_main', 'Government revenue, expenditure and main aggregates, general government, million national currency',
            ['time=2023', 'unit=MIO_NAC', 'sector=S13'] + [f'na_item={n}' for n in ['TE', 'P3', 'D62PAY', 'P51G', 'D61REC', 'D3PAY', 'D41PAY', 'TR']]
            + countries[:4] + countries[5:])
    es_save('es_defence', 'gov_10a_exp', 'General government expenditure by function (COFOG 02 defence), million national currency',
            ['time=2023', 'unit=MIO_NAC', 'sector=S13', 'cofog99=GF02'] + [f'na_item={n}' for n in ['TE', 'D1', 'P2', 'P51G']] + countries[:4] + countries[5:])
    es_save('es_debt', 'gov_10dd_edpt1', 'Government deficit and debt (EDP), gross debt, % of GDP',
            ['time=2023', 'unit=PC_GDP', 'sector=S13', 'na_item=GD'] + countries[:4] + countries[5:])
    es_save('es_debt_quarterly', 'gov_10q_ggdebt', 'Quarterly government debt, gross debt, % of GDP, end-2023 (EFTA countries without annual EDP data)',
            ['freq=Q', 'time=2023-Q4', 'unit=PC_GDP', 'sector=S13', 'na_item=GD', 'geo=NO', 'geo=CH'])

# ---------------------------------------------------------------------------------------------- ONS
ITL1 = {'TLC', 'TLD', 'TLE', 'TLF', 'TLG', 'TLH', 'TLI', 'TLJ', 'TLK', 'TLL', 'TLM', 'TLN', 'UK'}

def fetch_ons():
    base = 'https://www.ons.gov.uk/file?uri=/economy/grossvalueaddedgva/datasets/nominalandrealregionalgrossvalueaddedbalancedbyindustry/current/re424b1.xlsx'
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, 'gva.xlsx')
        data = get(base, binary=True)
        open(path, 'wb').write(data)
        rows = xlsx.read(path, 'Table 1c')
        header = next(r for r in rows if r and r[0] == 'ITL code')
        col = header.index('2023')
        values = {}
        for r in rows:
            if r and r[0] in ITL1 and len(r) > col:
                code = r[2] if isinstance(r[2], str) else str(int(r[2]))
                values[f'{r[0]}|{code}'] = r[col]
        save('ons_regional_gva', 'ons', 'Regional gross value added (balanced) by industry, ITL1, Table 1c current prices',
             'GVA (balanced) at current basic prices by SIC07 industry, ITL1 regions and UK, pounds million', base, values,
             notes=['Key: ITL code | SIC07 code as published (e.g. "C (10-33)", "CA (10-12)", "B (5-9)").'],
             extra={'download_sha256': hashlib.sha256(data).hexdigest(), 'key': 'itl|sic07'})
    pop = 'https://www.ons.gov.uk/file?uri=/economy/grossdomesticproductgdp/datasets/regionalgrossdomesticproductallnutslevelregions/1998to2024/regionalgrossdomesticproductgdpbyallinternationalterritoriallevelitlregions.xlsx'
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, 'gdp.xlsx')
        data = get(pop, binary=True)
        open(path, 'wb').write(data)
        rows = xlsx.read(path, 'Table 6')
        header = next(r for r in rows if r and isinstance(r[0], str) and r[0].startswith('ITL'))
        col = header.index('2023') if '2023' in header else [str(h) for h in header].index('2023')
        values = {r[1]: r[col] for r in rows if r and len(r) > col and r[0] == 'ITL1' and r[1] in ITL1}
        values.update({r[1]: r[col] for r in rows if r and len(r) > col and r[1] == 'UK'})
        save('ons_regional_population', 'ons', 'Regional GDP: all ITL regions, Table 6 total resident population',
             'Total resident population, persons, ITL1 regions, 2023 (mid-year)', pop, values,
             extra={'download_sha256': hashlib.sha256(data).hexdigest(), 'key': 'itl'})

def fetch_ons_debt():
    url = 'https://www.ons.gov.uk/economy/governmentpublicsectorandtaxes/publicspending/timeseries/yeqj/edp/data'
    d = json.loads(get(url))
    year = next(y for y in d['years'] if y['year'] == '2023')
    save('ons_uk_debt', 'ons', 'Time series YEQJ (dataset EDP)', d['description']['title'], url,
         {'GBR|gross_consolidated_debt_pct_GDP': float(year['value'])}, d['description'].get('releaseDate'),
         notes=['Calendar year 2023, Maastricht (ESA 2010) definition.'])

# ---------------------------------------------------------------------------------------------- OECD
def oecd_csv(flow, key, start='2023', end='2023'):
    url = f'{OECD}/{flow}/{key}?startPeriod={start}&endPeriod={end}&dimensionAtObservation=AllDimensions'
    req = urllib.request.Request(url, headers={**UA, 'Accept': 'application/vnd.sdmx.data+csv'})
    with urllib.request.urlopen(req, timeout=180) as r:
        return url, list(csv.DictReader(io.StringIO(r.read().decode('utf-8'))))

def fetch_oecd():
    url, rows = oecd_csv('OECD.CTP.TPS,DSD_REV_COMP_OECD@DF_RSOECD,', 'GBR+TUR.TAX_REV.S13.T_1100+T_1200+T_2000+T_5110+T_5120+T_5000+_T._T.PT_B1GQ.A')
    values = {f'{r["REF_AREA"]}|{r["STANDARD_REVENUE"]}': float(r['OBS_VALUE']) for r in rows if r['OBS_VALUE']}
    save('oecd_revenue', 'oecd', 'OECD.CTP.TPS,DSD_REV_COMP_OECD@DF_RSOECD', 'Revenue Statistics: tax revenue by category, general government, % of GDP',
         url, values, extra={'key': 'country|revenue category'})
    url, rows = oecd_csv('OECD.SDD.NAD,DSD_NASEC10@DF_TABLE12,', 'A.GBR.S13..............')
    keep = {'P3', 'D62', 'P51G', 'OTE', 'D1', 'D3', 'D41'}
    values = {f'GBR|{r["TRANSACTION"]}': float(r['OBS_VALUE']) for r in rows
              if r['TRANSACTION'] in keep and r['UNIT_MEASURE'] == 'XDC' and r['ACCOUNTING_ENTRY'] == 'D' and r['OBS_VALUE']}
    save('oecd_uk_government', 'oecd', 'OECD.SDD.NAD,DSD_NASEC10@DF_TABLE12', 'Government deficit/surplus, revenue, expenditure and main aggregates, UK, pounds million',
         url, values, extra={'key': 'country|transaction'})
    url, rows = oecd_csv('OECD.SDD.NAD,DSD_NASEC10@DF_TABLE11,', 'A.GBR.S13._Z.D.OTE+P51G+D1+P2..GF02.XDC.S.V.N.T1100')
    values = {f'GBR|{r["TRANSACTION"]}': float(r['OBS_VALUE']) for r in rows if r['OBS_VALUE']}
    save('oecd_uk_defence', 'oecd', 'OECD.SDD.NAD,DSD_NASEC10@DF_TABLE11', 'Government expenditure by function, COFOG 02 defence, UK, pounds million',
         url, values, extra={'key': 'country|transaction'})
    url, rows = oecd_csv('OECD.SDD.NAD,DSD_NAMAIN10@DF_TABLE1_EXPENDITURE,', 'A.GBR+TUR..........')
    values = {r['REF_AREA']: float(r['OBS_VALUE']) for r in rows
              if r.get('TRANSACTION') == 'B1GQ' and r.get('UNIT_MEASURE') == 'XDC' and r.get('PRICE_BASE') == 'V' and r.get('SECTOR') == 'S1' and r['OBS_VALUE']}
    save('oecd_gdp', 'oecd', 'OECD.SDD.NAD,DSD_NAMAIN10@DF_TABLE1_EXPENDITURE', 'GDP at current prices, national currency, million', url, values,
         extra={'key': 'country'})

# ---------------------------------------------------------------------------------------------- World Bank
WDI_2023 = ['SP.POP.TOTL', 'NY.GDP.MKTP.PP.CD', 'NY.GDP.MKTP.CD', 'NV.AGR.TOTL.ZS', 'NV.IND.TOTL.ZS', 'NV.IND.MANF.ZS', 'NV.SRV.TOTL.ZS']
WDI_RENTS = ['NY.GDP.PETR.RT.ZS', 'NY.GDP.NGAS.RT.ZS', 'NY.GDP.COAL.RT.ZS', 'NY.GDP.MINR.RT.ZS']

def wdi(indicator, years):
    url = f'{WB}/country/all/indicator/{indicator}?date={years}&format=json&per_page=20000'
    page = json.loads(get(url))
    meta = json.loads(get(f'{WB}/indicator/{indicator}?format=json'))[1][0]
    return url, page[0].get('lastupdated'), meta, page[1] or []

def fetch_worldbank():
    for ind in WDI_2023:
        url, updated, meta, rows = wdi(ind, '2023')
        values = {r['countryiso3code']: r['value'] for r in rows if r['countryiso3code'] and r['value'] is not None}
        save(f'wdi_{ind.lower().replace(".", "_")}', 'worldbank', ind, meta['name'], url, values, updated,
             extra={'source_organization': meta['sourceOrganization'].split(';')[0].strip()[:200], 'key': 'iso3'})
    for ind in WDI_RENTS:
        url, updated, meta, rows = wdi(ind, '2015:2023')
        latest = {}
        for r in rows:
            c, v, y = r['countryiso3code'], r['value'], int(r['date'])
            if c and v is not None and (c not in latest or y > latest[c][1]):
                latest[c] = (v, y)
        save(f'wdi_{ind.lower().replace(".", "_")}', 'worldbank', ind, meta['name'], url,
             {c: {'value': v, 'year': y} for c, (v, y) in latest.items()}, updated,
             notes=['Latest available year in 2015-2023 per country (the series lags); the year is recorded per value.'],
             extra={'source_organization': meta['sourceOrganization'].split(';')[0].strip()[:200], 'key': 'iso3'})

# ---------------------------------------------------------------------------------------------- Türkiye
def pdf_text(url):
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, 'doc.pdf')
        data = get(url, binary=True)
        open(path, 'wb').write(data)
        text = subprocess.run(['pdftotext', '-layout', path, '-'], capture_output=True, text=True, check=True).stdout
        return data, text

def tl(text):
    """Turkish number '1.963.753.722,06' -> float."""
    return float(text.replace('.', '').replace(',', '.'))

def fetch_turkey():
    url = 'https://ms.hmb.gov.tr/uploads/sites/2/2025/02/Public-Debt-Management-Report-2024.pdf'
    data, text = pdf_text(url)
    m = re.search(r'EU-defined general government debt stock to GDP ratio realized at ([0-9.]+) percent', text)
    if not m:
        raise SystemExit('Treasury report: EU-defined debt ratio not found')
    save('tr_treasury_debt', 'tr_treasury', 'Public Debt Management Report', 'EU-defined general government debt stock, % of GDP, end-2023',
         url, {'TUR|EU_defined_GG_debt_pct_GDP': float(m.group(1))},
         notes=['Quoted sentence: "the EU-defined general government debt stock to GDP ratio realized at ' + m.group(1) + ' percent" (report covering 2023).'],
         extra={'download_sha256': hashlib.sha256(data).hexdigest()})
    url = 'https://www.sayistay.gov.tr/reports/download/bmg0qm6Q0O-2023-yili-mali-istatistikleri-degerlendirme-raporu'
    data, text = pdf_text(url)
    lines = {
        'expense_total': r'GİDER\s+[\d.,]+\s+[\d.,]+\s+([\d.,]+)',
        'personnel': r'Personel Giderleri\s+[\d.,]+\s+[\d.,]+\s+([\d.,]+)',
        'goods_services': r'Mal ve Hizmet\s*\n\s+[\d.,]+\s+[\d.,]+\s+([\d.,]+)',
        'depreciation': r'Amortisman Giderleri\s+[\d.,]+\s+[\d.,]+\s+([\d.,]+)',
        'interest': r'Faiz Giderleri\s+[\d.,]+\s+[\d.,]+\s+([\d.,]+)',
        'subsidies': r'Sübvansiyonlar\s+[\d.,]+\s+[\d.,]+\s+([\d.,]+)',
        'social_benefits': r'Sosyal Yardımlar\s+[\d.,]+\s+[\d.,]+\s+([\d.,]+)',
        'other_expense': r'Diğer Giderler\s+[\d.,]+\s+[\d.,]+\s+([\d.,]+)',
        'net_nonfinancial_assets': r'C\. Net Mali Olmayan Varlık Edinimi\s+[\d.,]+\s+[\d.,]+\s+([\d.,]+)',
    }
    values = {}
    for key, pattern in lines.items():
        m = re.search(pattern, text)
        if not m:
            raise SystemExit(f'Sayıştay report: {key} not found')
        values[f'TUR|{key}'] = tl(m.group(1))
    # Defence (COFOG 02) total, 2023 column of the functional classification table: the value is split over two
    # text lines by the PDF layout ("350.271.11" above, "4,1" below); both parts are read and joined.
    block = text[text.index('2. Savunma Hizmetleri') - 400: text.index('2. Savunma Hizmetleri') + 400]
    before = [line for line in block.split('2. Savunma Hizmetleri')[0].splitlines()[:-1] if line.strip()]
    top = re.findall(r'[\d.]+[\d]', before[-1]) if before else []
    bottom = re.findall(r'[\d.,]+', block.split('2. Savunma Hizmetleri')[1].splitlines()[1])
    if not top or not bottom:
        raise SystemExit('Sayıştay report: defence row not found')
    values['TUR|defence_cofog02_total'] = tl(top[-1] + bottom[-1])
    save('tr_sayistay_government', 'tr_sayistay', '2023 Yılı Mali İstatistikleri Değerlendirme Raporu (September 2024)',
         'General government (GFS 2014) expense by economic type, net acquisition of non-financial assets, defence by function; thousand TRY',
         url, values, notes=['GFS concepts (not ESA 2010). Thousand Turkish lira. Table 4 (expense), Table 11 (net acquisition of non-financial assets), '
                             'functional classification table (defence services, 2023 column).'],
         extra={'download_sha256': hashlib.sha256(data).hexdigest(), 'key': 'country|item'})

def fetch_financing():
    """ECON-08: long-term government bond yields (EMU convergence criterion, 10-year benchmark, annual average 2023)."""
    es_save('es_bond_yields', 'irt_lt_mcby_a', 'EMU convergence criterion series: long-term government bond yields, annual average, % per year',
            ['time=2023'] + [f'geo={g}' for g in ES_PLAYABLE[:4] + ES_NEIGHBOURS])

STEPS = {'financing': fetch_financing, 'eurostat': fetch_eurostat, 'ons': fetch_ons, 'ons_debt': fetch_ons_debt, 'oecd': fetch_oecd, 'worldbank': fetch_worldbank, 'turkey': fetch_turkey}

if __name__ == '__main__':
    only = sys.argv[sys.argv.index('--only') + 1].split(',') if '--only' in sys.argv else list(STEPS)
    for name in only:
        STEPS[name]()
