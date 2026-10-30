import {createVisualDocument,getVisual} from '../src/extensions/visual/index.js';
import {exportPowerPoint,importPowerPoint} from '../src/adapters/powerpoint/index.js';
import {planEditableMiroExport} from '../src/adapters/miro/editable/index.js';
import {observeGoogleSlides,planGoogleSlidesExport} from '../src/adapters/google-slides/index.js';
import {hostDigest} from '../src/adapters/reconciliation/index.js';

/** Exercises the public portable adapter logic in a real browser, without host credentials or SDK globals. */
export async function runPortableAdaptersBrowserChecks():Promise<Record<string,unknown>>{
 const document=createVisualDocument({id:'browser-p7',kind:'flow',form:'network',title:'Portable adapters',question:'Does the public API run in a browser?',nodes:[{id:'a',label:'Browser'}]});
 const digest=await hostDigest(document);
 if(!/^[0-9a-f]{64}$/.test(digest))throw Error('Browser reconciliation digest failed');

 const ppt=await exportPowerPoint(document,{mode:'report'});
 const pptReadback=await importPowerPoint(ppt.bytes,{binding:ppt.binding,expectedBindingRevision:ppt.binding.bindingRevision,mode:'report'});
 if(getVisual(pptReadback.document).question!=='Does the public API run in a browser?')throw Error('Browser PowerPoint round trip failed');

 const miro=await planEditableMiroExport(document,'strict');
 if(miro.nodes.length!==1||miro.nodes[0]?.logicalId!=='a')throw Error('Browser editable Miro planning failed');

 const snapshot={presentationId:'browser-presentation',revisionId:'browser-rev-1',pageSize:{width:{magnitude:720,unit:'PT'},height:{magnitude:405,unit:'PT'}},slides:[{objectId:'browser-slide',pageElements:[]}]};
 const observed=await observeGoogleSlides(snapshot);
 const slides=await planGoogleSlidesExport(document,observed,{title:{x:20,y:10,width:400,height:35},question:{x:20,y:50,width:400,height:50},nodes:{a:{x:100,y:120,width:180,height:80}}},{namespace:'browser'});
 if(slides.batch.writeControl.requiredRevisionId!=='browser-rev-1'||slides.mappings.length!==3)throw Error('Browser Google Slides planning failed');
 return{reconciliation:true,powerpoint:{bytes:ppt.bytes.length,roundTrip:true},miro:{nodes:miro.nodes.length},googleSlides:{requests:slides.batch.requests.length,revision:slides.batch.writeControl.requiredRevisionId}};
}
