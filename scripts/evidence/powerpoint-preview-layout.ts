// SPDX-License-Identifier: MIT OR Apache-2.0
/** Generate local preview-only PowerPoint reflows. No PowerPoint host operations occur here. */
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {exportPowerPoint, importPowerPoint} from '../../src/adapters/powerpoint/index.js';
import {attribute, child, children, parseXml, replaceRanges, type XmlElement} from '../../src/adapters/powerpoint/xml.js';
import {inspectZip, partText, writeZip} from '../../src/adapters/powerpoint/zip.js';

const root = resolve(import.meta.dir, '../..');
const output = join(root, '.cache/pptx-preview-layout');
const slidePath = 'ppt/slides/slide1.xml';
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const sha = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const requireValue: (value: unknown, message: string) => asserts value = (value, message) => { if (!value) throw new Error(message); };
type Box = {x:number;y:number;cx:number;cy:number};

function descendants(node: XmlElement): XmlElement[] {
  const result: XmlElement[] = [];
  for (const item of node.children) if (item.kind === 'element') { result.push(item, ...descendants(item)); }
  return result;
}
function attr(node: XmlElement, name: string): string {
  const value = attribute(node, '', name)?.value;
  requireValue(value !== undefined, `Missing ${name} attribute on ${node.name}`);
  return value;
}
function patchAttrs(source: string, node: XmlElement, values: Record<string,string>): string {
  let opening = source.slice(node.start, node.openEnd);
  for (const [key, value] of Object.entries(values)) {
    const pattern = new RegExp(`(\\b${key}\\s*=\\s*)([\"'])([^\"']*)\\2`);
    if (pattern.test(opening)) opening = opening.replace(pattern, `$1"${value}"`);
    else opening = opening.replace(/\s*\/?\s*>$/, ` ${key}="${value}">`);
  }
  return opening;
}
function namedShapes(rootElement: XmlElement): Map<string,XmlElement> {
  const result = new Map<string,XmlElement>();
  for (const shape of descendants(rootElement).filter(n => n.uri === P && (n.local === 'sp' || n.local === 'cxnSp'))) {
    const props = descendants(shape).find(n => n.uri === P && n.local === 'cNvPr');
    if (!props) continue;
    const name = attribute(props, '', 'name')?.value;
    if (name) { requireValue(!result.has(name), `Duplicate PowerPoint shape name ${name}`); result.set(name, shape); }
  }
  return result;
}
function nativeShapeName(shape:XmlElement):string {
  const props=descendants(shape).find(n=>n.uri===P&&n.local==='cNvPr');requireValue(props,'Drawing object has no shape identity');return attr(props,'name');
}
function placeConnectorsBehindNodes(source:string,rootElement:XmlElement):string {
  const tree=descendants(rootElement).find(n=>n.uri===P&&n.local==='spTree');requireValue(tree,'PowerPoint slide has no shape tree');
  const native=tree.children.filter((n):n is XmlElement=>n.kind==='element'&&n.uri===P&&(n.local==='sp'||n.local==='cxnSp'));
  requireValue(native.length>0,'PowerPoint slide contains no native drawing objects');
  const ordered=[...native].sort((a,b)=>{
    const rank=(node:XmlElement)=>node.local==='cxnSp'?0:nativeShapeName(node).startsWith('umf-edge-label-')?2:1;
    return rank(a)-rank(b);
  });
  const first=native[0]!,last=native[native.length-1]!;
  requireValue(native.every((node,i)=>i===0||native[i-1]!.end<=node.start),'Native shape XML ranges overlap or are out of order');
  return replaceRanges(source,[{start:first.start,end:last.end,text:ordered.map(node=>source.slice(node.start,node.end)).join('')}]);
}
function shapeBox(shape: XmlElement): Box {
  const spPr = descendants(shape).find(n => n.uri === P && n.local === 'spPr');
  requireValue(spPr, 'PowerPoint shape has no spPr');
  const xfrm = children(spPr, A, 'xfrm')[0]; requireValue(xfrm, 'PowerPoint shape has no transform');
  const off = child(xfrm, A, 'off'), ext = child(xfrm, A, 'ext');
  return {x:Number(attr(off,'x')), y:Number(attr(off,'y')), cx:Number(attr(ext,'cx')), cy:Number(attr(ext,'cy'))};
}
function shapeId(shape: XmlElement): string {
  const props = descendants(shape).find(n => n.uri === P && n.local === 'cNvPr');
  requireValue(props, 'PowerPoint shape has no identity'); return attr(props,'id');
}
function nodeLayout(ids: string[], boxes: Map<string,Box>, width=12_192_000, height=6_858_000): Map<string,Box> {
  const result = new Map<string,Box>();
  if (ids.length === 16) {
    const cx=width/2, cy=4_100_000, rx=5_050_000, ry=2_300_000, w=boxes.get(ids[0]!)!.cx, h=boxes.get(ids[0]!)!.cy;
    ids.forEach((id,i)=>{const a=2*Math.PI*i/ids.length;result.set(id,{x:Math.round(cx+rx*Math.cos(a)-w/2),y:Math.round(cy+ry*Math.sin(a)-h/2),cx:w,cy:h});});
  } else {
    requireValue(ids.length===4,'Only the four-node process example and 16-node network are qualified');
    const w=boxes.get(ids[0]!)!.cx,h=boxes.get(ids[0]!)!.cy,margin=850_000,gap=Math.floor((width-2*margin-w*ids.length)/(ids.length-1)),y=3_500_000;
    ids.forEach((id,i)=>result.set(id,{x:margin+i*(w+gap),y,cx:w,cy:h}));
  }
  return result;
}
function setXfrmValues(source:string,node:XmlElement,values:Record<string,string>):string {
  let opening=source.slice(node.start,node.openEnd);
  for(const [key,value] of Object.entries(values)){
    const re=new RegExp(`(\\b${key}\\s*=\\s*)([\"'])([^\"']*)\\2`);
    if(re.test(opening)) opening=opening.replace(re,`$1"${value}"`);
    else opening=opening.replace(/\s*\/?>$/,` ${key}="${value}">`);
  }
  return opening;
}
function connectorGeometry(shape:XmlElement, source:Box, target:Box, xml:string): {edits:{start:number;end:number;text:string}[]} {
  const dx=(target.x+target.cx/2)-(source.x+source.cx/2),dy=(target.y+target.cy/2)-(source.y+source.cy/2);
  const horizontal=Math.abs(dx)/((source.cx+target.cx)/2)>=Math.abs(dy)/((source.cy+target.cy)/2);
  const sx=horizontal?(dx>=0?source.x+source.cx:source.x):source.x+source.cx/2;
  const sy=horizontal?source.y+source.cy/2:(dy>=0?source.y+source.cy:source.y);
  const ex=horizontal?(dx>=0?target.x:target.x+target.cx):target.x+target.cx/2;
  const ey=horizontal?target.y+target.cy/2:(dy>=0?target.y:target.y+target.cy);
  const xfrm=descendants(shape).find(n=>n.uri===A&&n.local==='xfrm');requireValue(xfrm,'Connector has no transform');
  const off=child(xfrm,A,'off'),ext=child(xfrm,A,'ext');
  const flipH=sx>ex?'1':'0',flipV=sy>ey?'1':'0';
  const stCxn=descendants(shape).find(n=>n.uri===A&&n.local==='stCxn'),endCxn=descendants(shape).find(n=>n.uri===A&&n.local==='endCxn');
  requireValue(stCxn&&endCxn,'Connector has no qualified attachment elements');
  const startIndex=horizontal?(dx>=0?3:1):(dy>=0?2:0);
  const endIndex=horizontal?(dx>=0?1:3):(dy>=0?0:2);
  return {edits:[
    {start:xfrm.start,end:xfrm.openEnd,text:setXfrmValues(xml,xfrm,{flipH,flipV})},
    {start:off.start,end:off.openEnd,text:patchAttrs(xml,off,{x:String(Math.min(sx,ex)),y:String(Math.min(sy,ey))})},
    {start:ext.start,end:ext.openEnd,text:patchAttrs(xml,ext,{cx:String(Math.max(1,Math.abs(ex-sx))),cy:String(String(Math.max(1,Math.abs(ey-sy))))})},
    {start:stCxn.start,end:stCxn.openEnd,text:patchAttrs(xml,stCxn,{idx:String(startIndex)})},
    {start:endCxn.start,end:endCxn.openEnd,text:patchAttrs(xml,endCxn,{idx:String(endIndex)})},
  ]};
}
function parseEndpoints(shape:XmlElement): {start:string;end:string} {
  const st=descendants(shape).find(n=>n.uri===A&&n.local==='stCxn'), en=descendants(shape).find(n=>n.uri===A&&n.local==='endCxn');
  requireValue(st&&en,'Connector has no endpoint attachment'); return {start:attr(st,'id'),end:attr(en,'id')};
}
function ensureConnectorShape(shape:XmlElement, expectedStart:string, expectedEnd:string):void {
  const actual=parseEndpoints(shape);requireValue(actual.start===expectedStart&&actual.end===expectedEnd,'Connector endpoint identity changed while reflowing.');
}
async function render(pptx:string, outBase:string):Promise<{png:string;width:number;height:number}> {
  const {dirname}=await import('node:path');
  const soffice=spawnSync('soffice',['--headless','--convert-to','pdf','--outdir',dirname(pptx),pptx],{encoding:'utf8'});
  requireValue(soffice.status===0,`LibreOffice PDF export failed: ${soffice.stderr||soffice.stdout}`);
  const pdf=pptx.replace(/\.pptx$/i,'.pdf');
  const raster=spawnSync('pdftoppm',['-png','-singlefile','-r','144',pdf,outBase],{encoding:'utf8'});
  requireValue(raster.status===0,`PDF rasterization failed: ${raster.stderr||raster.stdout}`);
  const png=`${outBase}.png`,bytes=await readFile(png);
  const dims=pngDimensions(bytes);return {png,width:dims.width,height:dims.height};
}
function pngDimensions(bytes:Uint8Array):{width:number;height:number} {
  requireValue(bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71,'Preview is not a PNG');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);return {width:view.getUint32(16),height:view.getUint32(20)};
}
async function build(id:'process-documents-store'|'network-16x24', sourcePath:string):Promise<Record<string,unknown>> {
  const sourceBytes=await readFile(join(root,sourcePath)),document=JSON.parse(sourceBytes.toString('utf8'));
  const exported=await exportPowerPoint(document,{mode:'report'}),parts=inspectZip(exported.bytes),xml=partText(parts,slidePath),parsed=parseXml(xml,slidePath),shapes=namedShapes(parsed.root);
  const visual=document.extensions['umf.visual'],nodeIds=visual.nodes.map((n:any)=>String(n.id)) as string[];
  const oldBoxes=new Map(nodeIds.map((id:string)=>{const shape=shapes.get(`umf-node-${Buffer.from(id).toString('base64url')}`);requireValue(shape,`Missing native node ${id}`);return [id,shapeBox(shape)] as const;}));
  const boxes=nodeLayout(nodeIds,oldBoxes),edits:{start:number;end:number;text:string}[]=[];
  for(const id of nodeIds){const shape=shapes.get(`umf-node-${Buffer.from(id).toString('base64url')}`)!,box=boxes.get(id)!;const spPr=descendants(shape).find(n=>n.uri===P&&n.local==='spPr')!,xfrm=children(spPr,A,'xfrm')[0]!,off=child(xfrm,A,'off'),ext=child(xfrm,A,'ext');
    edits.push({start:off.start,end:off.openEnd,text:patchAttrs(xml,off,{x:String(box.x),y:String(box.y)})},{start:ext.start,end:ext.openEnd,text:patchAttrs(xml,ext,{cx:String(box.cx),cy:String(box.cy)})});}
  const nativeIdByLogical=new Map<string,string>(nodeIds.map((id:string)=>[id,shapeId(shapes.get(`umf-node-${Buffer.from(id).toString('base64url')}`)!)]));
  for(const edge of visual.edges){const edgeShape=shapes.get(`umf-edge-${Buffer.from(edge.id).toString('base64url')}`)!;ensureConnectorShape(edgeShape,nativeIdByLogical.get(edge.from)!,nativeIdByLogical.get(edge.to)!);
    edits.push(...connectorGeometry(edgeShape,boxes.get(edge.from)!,boxes.get(edge.to)!,xml).edits);
    const labelShape=shapes.get(`umf-edge-label-${Buffer.from(edge.id).toString('base64url')}`);
    if(labelShape){const labelBox=shapeBox(labelShape),a=boxes.get(edge.from)!,b=boxes.get(edge.to)!,labelW=labelBox.cx,labelH=labelBox.cy;
      const lx=Math.round((a.x+a.cx/2+b.x+b.cx/2)/2-labelW/2),ly=Math.max(1_450_000,Math.round((a.y+a.cy/2+b.y+b.cy/2)/2-labelH/2-330_000));
      const spPr=descendants(labelShape).find(n=>n.uri===P&&n.local==='spPr')!,xfrm=children(spPr,A,'xfrm')[0]!,off=child(xfrm,A,'off');
      edits.push({start:off.start,end:off.openEnd,text:patchAttrs(xml,off,{x:String(lx),y:String(ly)})});
    }
  }
  const preparedXml=replaceRanges(xml,edits),updatedXml=placeConnectorsBehindNodes(preparedXml,parseXml(preparedXml,slidePath).root);parts.set(slidePath,new TextEncoder().encode(updatedXml));
  const patched=parseXml(updatedXml,slidePath),patchedShapes=namedShapes(patched.root);
  for(const edge of visual.edges)ensureConnectorShape(patchedShapes.get(`umf-edge-${Buffer.from(edge.id).toString('base64url')}`)!,nativeIdByLogical.get(edge.from)!,nativeIdByLogical.get(edge.to)!);
  const bytes=writeZip(parts);
  const readback=await importPowerPoint(bytes,{mode:'report',binding:exported.binding,expectedBindingRevision:exported.bindingRevision,currentDocument:document});
  requireValue(JSON.stringify(readback.document)===JSON.stringify(document),`${id} preview layout altered the bound common source on readback.`);
  const folder=join(output,id);await mkdir(folder,{recursive:true});
  const pptx=join(folder,`${id}-preview-layout-v3.pptx`);await writeFile(pptx,bytes);
  const rendered=await render(pptx,join(folder,`${id}-preview-layout-v3`));
  const pngBytes=await readFile(rendered.png);
  const sourceHash=sha(sourceBytes),baseArtifactHash=sha(exported.bytes);
  const receipt={schemaVersion:1,caseId:id,stage:'preview-only-layout',profileId:exported.profile,modelVersion:exported.modelVersion,mappingVersion:'1',source:{path:sourcePath,sha256:sourceHash,canonicalSha256:exported.sourceSha256},baseArtifact:{sha256:baseArtifactHash},artifact:{path:pptx.replace(root+'/',''),sha256:sha(bytes)},preview:{engine:'libreoffice',stage:'native-only-preview-layout',asset:{path:rendered.png.replace(root+'/',''),sha256:sha(pngBytes),mediaType:'image/png',width:rendered.width,height:rendered.height}},readback:{sourceUnchanged:true,semanticChangeCount:readback.changes.length,losses:readback.losses},semanticChanges:[],nativeOnlyChanges:['node geometry','connector attachment orientation','edge-caption placement','connector-behind-node z-order'],bindingsPreserved:true,connectorEndpoints:visual.edges.map((e:any)=>({id:e.id,from:e.from,to:e.to,nativeStart:nativeIdByLogical.get(e.from),nativeEnd:nativeIdByLogical.get(e.to)})),zOrder:'connectors behind filled nodes; edge captions and headings above connectors',layout:id==='network-16x24'?'perimeter ellipse':'single-row process chain'};
  await writeFile(join(folder,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
  return {caseId:id,pptx:receipt.artifact.path,png:receipt.preview.asset.path,width:rendered.width,height:rendered.height,sha256:receipt.artifact.sha256};
}

if(import.meta.main){
  await mkdir(output,{recursive:true});
  const results=await Promise.all([
    build('process-documents-store','fixtures/integrations/complex-miro/common/process-documents-store.json'),
    build('network-16x24','fixtures/integrations/complex-miro/common/network-16x24.json'),
  ]);
  console.log(JSON.stringify({output:'.cache/pptx-preview-layout',results},null,2));
}
