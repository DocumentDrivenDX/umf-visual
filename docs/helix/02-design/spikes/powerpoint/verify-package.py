"""Independent package-structure check; not a PowerPoint conformance oracle."""
import json
from pathlib import Path
import xml.etree.ElementTree as ET
from zipfile import ZipFile

here = Path(__file__).parent / 'evidence'
ns = {'p': 'http://schemas.openxmlformats.org/presentationml/2006/main',
      'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
with ZipFile(here / 'probe.pptx') as package:
    assert package.testzip() is None
    for name in package.namelist():
        if name.endswith(('.xml', '.rels')):
            ET.fromstring(package.read(name))
    presentation = ET.fromstring(package.read('ppt/presentation.xml'))
    slides = presentation.findall('p:sldIdLst/p:sldId', ns)
    assert len(slides) == 1
    relationships = ET.fromstring(package.read('ppt/_rels/presentation.xml.rels'))
    relation = next(r for r in relationships if r.attrib['Id'] == slides[0].attrib['{' + ns['r'] + '}id'])
    assert relation.attrib['Target'] == 'slides/slide1.xml'
    slide = ET.fromstring(package.read('ppt/slides/slide1.xml'))
    objects = slide.findall('.//p:cNvPr', ns)
    ids = [item.attrib['id'] for item in objects]
    assert len(set(ids)) == len(ids)
    names = {item.attrib['name'] for item in objects}
    mapping = json.loads((here / 'identity-map.json').read_text())
    assert all(name in names for items in mapping.values() for name in items)
    labels = [item.text for item in slide.findall('.//a:t', ns)]
    assert all(label in labels for label in ('Client', 'API', 'Request'))
    assert not slide.findall('.//p:pic', ns)
    assert not slide.findall('.//a:stCxn', ns)
    assert not slide.findall('.//a:endCxn', ns)
print(json.dumps({'ok': True, 'scope': 'ZIP/XML syntax, slide relationship, unique shape IDs, mapped names and text; no PowerPoint execution', 'slides': len(slides), 'mappedObjects': sum(map(len, mapping.values()))}))
