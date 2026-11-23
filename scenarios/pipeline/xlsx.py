"""Minimal .xlsx reader (standard library): read(path, sheet) -> list of rows (cell values or None)."""
import zipfile, re, xml.etree.ElementTree as ET
NS={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main','r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
def col(ref):
    n=0
    for ch in re.match(r'[A-Z]+',ref).group(0): n=n*26+ord(ch)-64
    return n-1
def read(path, sheet):
    z=zipfile.ZipFile(path)
    ss=[]
    if 'xl/sharedStrings.xml' in z.namelist():
        for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si',NS):
            ss.append(''.join(t.text or '' for t in si.iter('{%s}t'%NS['m'])))
    wb=ET.fromstring(z.read('xl/workbook.xml'))
    rels=ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
    rid=[s.get('{%s}id'%NS['r']) for s in wb.find('m:sheets',NS) if s.get('name')==sheet][0]
    target=[r.get('Target') for r in rels if r.get('Id')==rid][0]
    target=target.lstrip('/'); target=target if target.startswith('xl/') else 'xl/'+target
    rows=[]
    for row in ET.fromstring(z.read(target)).iter('{%s}row'%NS['m']):
        cells={}
        for c in row.findall('m:c',NS):
            v=c.find('m:v',NS); t=c.get('t')
            if t=='inlineStr': val=''.join(x.text or '' for x in c.iter('{%s}t'%NS['m']))
            elif v is None: continue
            elif t=='s': val=ss[int(v.text)]
            elif t in('str','b','e'): val=v.text
            else:
                val=float(v.text)
            cells[col(c.get('r'))]=val
        rows.append([cells.get(i) for i in range(max(cells)+1)] if cells else [])
    return rows
