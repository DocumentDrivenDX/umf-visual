import {mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';

const destination=resolve('dist-site');
await mkdir(destination,{recursive:true});
const digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex').slice(0,16);
const htmlPath=new URL('./index.html',import.meta.url);
const [html,css,app]=await Promise.all([
  readFile(htmlPath,'utf8'),readFile(new URL('./styles.css',import.meta.url)),readFile(new URL('./app.js',import.meta.url)),
]);
const integrationCss=await readFile(new URL('./integrations.css',import.meta.url));
const integrationJs=await readFile(new URL('./integrations.js',import.meta.url));
const versionedApp=Buffer.from(app.toString().replaceAll("'./integrations.js'", `'./integrations.js?v=${digest(integrationJs)}'`));
const versionedHtml=html
  .replace('./styles.css','./styles.css?v='+digest(css))
  .replace('./integrations.css','./integrations.css?v='+digest(integrationCss))
  .replace('./app.js','./app.js?v='+digest(versionedApp));
await Promise.all([writeFile(resolve(destination,'styles.css'),css),writeFile(resolve(destination,'integrations.css'),integrationCss),
  writeFile(resolve(destination,'integrations.js'),integrationJs),writeFile(resolve(destination,'app.js'),versionedApp)]);
const temporaryHtml=resolve(destination,`.index.html.${randomUUID()}.tmp`);
await writeFile(temporaryHtml,versionedHtml);
await rename(temporaryHtml,resolve(destination,'index.html'));
console.log(`Copied the static umf.visuals microsite into ${destination}`);
