// SPDX-License-Identifier: MIT OR Apache-2.0
import {createVisualDocument} from '../../src/index.js';
import {renderLiniPresentation} from '../../src/renderers/lini.js';

const cspViolations:string[]=[];
self.addEventListener('securitypolicyviolation',event=>{
  cspViolations.push(`${event.violatedDirective}: ${event.blockedURI}`);
});
self.addEventListener('message',async()=>{
  const document=createVisualDocument({
    id:'worker-render',kind:'flow',form:'network',question:'Can a Dedicated Worker render a native visual?',
    nodes:[{id:'producer',label:'Producer'},{id:'consumer',label:'Consumer'}],
    edges:[{id:'writes',from:'producer',to:'consumer',label:'writes'}],
  });
  const result=await renderLiniPresentation(document);
  self.postMessage({result,domParserAvailable:typeof DOMParser!=='undefined',cspViolations});
});
