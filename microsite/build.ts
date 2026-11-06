import {mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';

const destination=resolve('dist-site');
await mkdir(destination,{recursive:true});
const digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex').slice(0,16);
const [showcaseHtml,evidenceHtml,reviewsHtml,showcaseCss,reviewsCss,showcaseApp,authoredContext,css,app]=await Promise.all([
  readFile(new URL('./index.html',import.meta.url),'utf8'),readFile(new URL('./evidence.html',import.meta.url),'utf8'),readFile(new URL('./reviews.html',import.meta.url),'utf8'),
  readFile(new URL('./showcase.css',import.meta.url)),readFile(new URL('./reviews.css',import.meta.url)),readFile(new URL('./showcase.js',import.meta.url)),readFile(new URL('./authored-context.js',import.meta.url)),
  readFile(new URL('./styles.css',import.meta.url)),readFile(new URL('./app.js',import.meta.url)),
]);
const integrationCss=await readFile(new URL('./integrations.css',import.meta.url));
const integrationJs=await readFile(new URL('./integrations.js',import.meta.url));
const showcaseFile=resolve(destination,'showcase.json');
const showcase=JSON.parse(await readFile(showcaseFile,'utf8')) as {schemaVersion?:number;examples?:unknown[]};
if(showcase.schemaVersion!==1||!Array.isArray(showcase.examples)||showcase.examples.length<4)throw new Error('Build the presentation showcase first; dist-site/showcase.json is missing or invalid.');
const reviews=JSON.parse(await readFile(resolve(destination,'reviews.json'),'utf8')) as {schemaVersion?:number;examples?:unknown[]};
if(reviews.schemaVersion!==1||!Array.isArray(reviews.examples)||reviews.examples.length===0)throw new Error('Build the source-derived reviews first; dist-site/reviews.json is missing or invalid.');
const versionedApp=Buffer.from(app.toString().replaceAll("'./integrations.js'", `'./integrations.js?v=${digest(integrationJs)}'`));
const versionedShowcaseApp=Buffer.from(showcaseApp.toString().replaceAll("'./authored-context.js'", `'./authored-context.js?v=${digest(authoredContext)}'`));
const versionedEvidenceHtml=evidenceHtml
  .replace('./styles.css','./styles.css?v='+digest(css))
  .replace('./integrations.css','./integrations.css?v='+digest(integrationCss))
  .replace('./app.js','./app.js?v='+digest(versionedApp));
const versionedShowcaseHtml=showcaseHtml
  .replace('./showcase.css','./showcase.css?v='+digest(showcaseCss))
  .replace('./showcase.js','./showcase.js?v='+digest(versionedShowcaseApp));
const versionedReviewsHtml=reviewsHtml
  .replace('./showcase.css','./showcase.css?v='+digest(showcaseCss))
  .replace('./reviews.css','./reviews.css?v='+digest(reviewsCss))
  .replace('./showcase.js','./showcase.js?v='+digest(versionedShowcaseApp));
const writeHtml=async(name:string,html:string)=>{const temporary=resolve(destination,`.${name}.${randomUUID()}.tmp`);await writeFile(temporary,html);await rename(temporary,resolve(destination,name));};
await Promise.all([writeFile(resolve(destination,'social-card.png'),await readFile(new URL('./social-card.png',import.meta.url))),
  writeFile(resolve(destination,'styles.css'),css),writeFile(resolve(destination,'integrations.css'),integrationCss),
  writeFile(resolve(destination,'integrations.js'),integrationJs),writeFile(resolve(destination,'app.js'),versionedApp),
  writeFile(resolve(destination,'showcase.css'),showcaseCss),writeFile(resolve(destination,'reviews.css'),reviewsCss),writeFile(resolve(destination,'showcase.js'),versionedShowcaseApp),writeFile(resolve(destination,'authored-context.js'),authoredContext),
  writeHtml('index.html',versionedShowcaseHtml),writeHtml('evidence.html',versionedEvidenceHtml),writeHtml('reviews.html',versionedReviewsHtml)]);
console.log(`Copied the static umf.visuals microsite into ${destination}`);
