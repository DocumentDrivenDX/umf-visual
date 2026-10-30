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
const versionedHtml=html
  .replace('./styles.css','./styles.css?v='+digest(css))
  .replace('./app.js','./app.js?v='+digest(app));
await Promise.all([writeFile(resolve(destination,'styles.css'),css),writeFile(resolve(destination,'app.js'),app)]);
const temporaryHtml=resolve(destination,`.index.html.${randomUUID()}.tmp`);
await writeFile(temporaryHtml,versionedHtml);
await rename(temporaryHtml,resolve(destination,'index.html'));
console.log(`Copied the static umf.visuals microsite into ${destination}`);
