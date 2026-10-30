import {describe,expect,it} from 'bun:test';
import {existsSync} from 'node:fs';

describe('microsite catalogue UI contract',()=>{
  it('uses a static browser entry point with accessible controls and safe source rendering',async()=>{
    const html=await Bun.file('microsite/index.html').text();
    const app=await Bun.file('microsite/app.js').text();
    expect(html).toContain('id="language"');
    expect(html).toContain('id="examples"');
    expect(html).toContain('These are example instances, not language definitions.');
    expect(html).toContain('A question is required');
    expect(html).toContain('caps nodes at 15');
    expect(html).toContain('id="detail-dialog"');
    expect(html).toContain('aria-label="Target profile"');
    expect(app).toContain("code.textContent = result.source");
    expect(app).toContain("$('umf-source').textContent = safeJson(item.document ?? {})");
    expect(app).toContain('renderLanguageReference');
    expect(app).toContain('language.schema.schema');
    expect(app).toContain('language.forms.kinds');
    expect(app).toContain("startsWith('fixtures/visual/forms/')");
    expect(app).toContain('sample instance');
    expect(app).toContain("fetch('./catalog.json', {cache: 'no-store'})");
    expect(app).toContain('url.searchParams.set(\'v\', sha256)');
    expect(app).toContain('function findItemForUrl(id)');
    expect(app).toContain('return legacy.length === 1 ? legacy[0] : undefined');
    expect(app).not.toContain('innerHTML');
    expect(app).toContain("/^renders\\/[A-Za-z0-9._/-]+\\.svg$/");
  });

  it('versions static browser assets from their content and verifies all native renders in-browser',async()=>{
    const build=await Bun.file('microsite/build.ts').text();
    const browser=await Bun.file('scripts/catalog-ui-browser.ts').text();
    expect(build).toContain(".replace('./styles.css','./styles.css?v='+digest(css))");
    expect(build).toContain(".replace('./app.js','./app.js?v='+digest(app))");
    expect(browser).toContain('result.width<=0||result.height<=0');
    expect(browser).toContain('all ${renderAssets.length} native SVGs load in-browser');
    expect(browser).toContain('previewBounds.image.width>previewBounds.container.width');
  });

  it('provides the built catalogue when the site build has run',()=>{
    if(!existsSync('dist-site/catalog.json'))return;
    const result=Bun.spawnSync(['bun','-e',`const c=await Bun.file('dist-site/catalog.json').json();if(c.schemaVersion!==1||!Array.isArray(c.items))throw Error('catalog schema');if(c.items.length===0)throw Error('empty catalog');if(!c.language?.schema?.schema?.$defs||!c.language?.forms?.kinds)throw Error('language reference missing');if(c.language.forms.kinds.length!==7)throw Error('kind count');if(c.language.forms.kinds.reduce((n,k)=>n+k.forms.length,0)!==22)throw Error('form count');if(c.items.length!==53)throw Error('sample instance count');for(const i of c.items){if(!i.id||!i.targets)throw Error('invalid item');for(const t of ['dot','mermaid','lini'])if(!['supported','reported-loss','unsupported'].includes(i.targets[t]?.status))throw Error('invalid status');}`],{stdout:'pipe',stderr:'pipe'});
    expect(result.exitCode).toBe(0);
  });
});
