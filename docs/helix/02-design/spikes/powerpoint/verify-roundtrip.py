"""Independent check of native PowerPoint files against imported UMF semantics."""
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile
import xml.etree.ElementTree as ET

root = Path(__file__).parent / 'evidence' / 'roundtrip'
ns = {'p': 'http://schemas.openxmlformats.org/presentationml/2006/main',
      'a': 'http://schemas.openxmlformats.org/drawingml/2006/main'}

def inspect(filename):
    with ZipFile(root / filename) as package:
        assert package.testzip() is None
        for path in package.namelist():
            if path.endswith(('.xml', '.rels')):
                ET.fromstring(package.read(path))
        meta = ET.fromstring(package.read('customXml/item1.xml'))
        assert meta.tag == '{urn:umf:visual:powerpoint:spike:1}roundTrip'
        manifest = json.loads(meta.text)
        assert hashlib.sha256(manifest['source'].encode()).hexdigest() == manifest['sourceSha256']
        document = json.loads(manifest['source'])
        slide = ET.fromstring(package.read('ppt/slides/slide1.xml'))
        shapes = {}
        ids = {}
        for shape in slide.findall('p:cSld/p:spTree/*', ns):
            ident = shape.find('.//p:cNvPr', ns)
            if ident is not None:
                shapes[ident.attrib['name']] = shape
                ids[ident.attrib['id']] = ident.attrib['name']
        labels = {name: '\n'.join(''.join(p.itertext()) for p in shape.findall('p:txBody/a:p', ns)) for name, shape in shapes.items()}
        connector = shapes['umf-edge-request']
        end = connector.find('.//a:endCxn', ns)
        assert end is not None
        return document, labels, ids[end.attrib['id']], shapes

baseline, _, _, baseline_shapes = inspect('baseline.pptx')
noop, _, noop_target, noop_shapes = inspect('native-noop.pptx')
source, labels, target, edited_shapes = inspect('native-edited.pptx')
assert baseline == noop == source
assert noop_target == 'umf-node-api'
assert target == 'umf-node-store'
assert labels['umf-node-client'] == 'Browser café 東京'
assert labels['umf-title'] == 'Native round trip verified'
assert labels['umf-question'] == 'What changed in PowerPoint?'
assert labels['umf-edge-request-label'] == 'Fetch via PowerPoint'
get_y = lambda shapes: shapes['umf-node-client'].find('p:spPr/a:xfrm/a:off', ns).attrib['y']
assert get_y(noop_shapes) != get_y(edited_shapes)
expected = json.loads(json.dumps(source))
v = expected['extensions']['umf.visual']
v['title'] = labels['umf-title']
v['question'] = labels['umf-question']
v['nodes'][0]['label'] = labels['umf-node-client']
v['edges'][0]['label'] = labels['umf-edge-request-label']
v['edges'][0]['to'] = 'store'
assert json.loads((root / 'imported.umf.json').read_text()) == expected
print(json.dumps({'ok': True, 'scope': 'Python independent XML/embedded-source/native endpoint/movement/import comparison', 'semanticChanges': 5, 'nativeMetadataSurvivedBothSaves': True, 'untouchedSemanticsPreserved': True}))
