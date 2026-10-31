import {describe,expect,it} from 'bun:test';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';

const digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex').slice(0,16);

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
    expect(html).toContain('id="six-target-section"');
    expect(html).toContain('id="six-target-case-select"');
    expect(html).toContain('id="six-target-matrix"');
    expect(html).toContain('aria-label="Target format"');
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
    expect(app).toContain("url.searchParams.set('view', ['native', 'diagram', 'complete'].includes(view) ? view : 'native')");
    expect(app).toContain('showQualifiedUnavailable(item, variants.length)');
    expect(app).toContain('No qualified annotation profile is recorded');
    expect(app).toContain("if (state.view === 'native') state.profileId = null");
    expect(app).toContain('state.lastQualifiedByTarget[key]');
    expect(app).toContain("initialParams.get('view')");
    expect(app).toContain('Switch to ${LABELS[state.target]} native baseline');
    expect(app).toContain("['powerpoint', 'PowerPoint'], ['google-slides', 'Google Slides'], ['miro', 'Miro']");
    expect(app).toContain('preview.sourceSha256 === integrationCase.commonSha256');
    expect(app).toContain('preview.profileId === target.profileId && preview.modelVersion === target.modelVersion && preview.mappingVersion === target.mappingVersion');
    expect(app).toContain('(?:png|svg|jpe?g)');
    expect(app).toContain("'image/png', 'image/svg+xml', 'image/jpeg'");
    expect(app).toContain("const isPreview = artifact.path === preview?.asset?.path");
    expect(app).toContain("extension === 'pptx' ? 'PowerPoint file'");
    expect(app).toContain('Download ${artifactLabel}');
    expect(app).toContain("root.append(grid)");
    const miroApp=await Bun.file('examples/miro/editable-app.ts').text();
    const miroHtml=await Bun.file('examples/miro/editable.html').text();
    expect(miroApp).toContain("const panelMode = panelUrl.searchParams.get('panel') === '1'");
    expect(miroApp).toContain("getElementById(panelMode ? 'status' : 'bootstrap-status')");
    expect(miroApp).toContain('if (bootstrap) bootstrap.hidden = false');
    expect(miroApp).toContain('toolbar click handler registered');
    expect(miroApp).toContain('captureEditableMiroBoard(board)');
    expect(miroApp).toContain('const observation = await captureEditableMiroBoard(board)');
    expect(miroApp).toContain('function statusData(data: unknown)');
    expect(miroHtml).toContain('id="bootstrap-status"');
    expect(miroHtml).toContain('id="debug-capture"');
    expect(miroHtml).toContain('id="debug-snapshot"');
    expect(miroHtml).toContain('readonly');
    expect(app).not.toContain('innerHTML');
    expect(app).toContain("/^renders\\/[A-Za-z0-9._/-]+\\.svg$/");
  });

  it('versions static browser assets from their content and verifies all native renders in-browser',async()=>{
    const build=await Bun.file('microsite/build.ts').text();
    const browser=await Bun.file('scripts/catalog-ui-browser.ts').text();
    expect(build).toContain(".replace('./styles.css','./styles.css?v='+digest(css))");
    expect(build).toContain(".replace('./app.js','./app.js?v='+digest(versionedApp))");
    expect(build).toContain("digest(integrationJs)");
    expect(browser).toContain('result.width<=0||result.height<=0');
    expect(browser).toContain('all ${renderAssets.length} native SVGs load in-browser');
    expect(browser).toContain('Expected all 178 verified baseline and qualified profile SVG assets');
    expect(browser).toContain('previewBounds.image.width>previewBounds.container.width');
    expect(browser).toContain('Miro preview did not decode as a JPEG with positive image dimensions');

    if(!existsSync('dist-site/index.html'))return;
    const [html,servedApp,servedStyles,servedIntegrationCss,servedIntegrationJs]=await Promise.all([
      Bun.file('dist-site/index.html').text(),Bun.file('dist-site/app.js').bytes(),Bun.file('dist-site/styles.css').bytes(),
      Bun.file('dist-site/integrations.css').bytes(),Bun.file('dist-site/integrations.js').bytes(),
    ]);
    const integrationHash=digest(servedIntegrationJs),appHash=digest(servedApp);
    expect(html).toContain(`href="./styles.css?v=${digest(servedStyles)}"`);
    expect(html).toContain(`href="./integrations.css?v=${digest(servedIntegrationCss)}"`);
    expect(html).toContain(`src="./app.js?v=${appHash}"`);
    expect(Buffer.from(servedApp).toString()).toContain(`'./integrations.js?v=${integrationHash}'`);
  });

  it('provides the built catalogue when the site build has run',()=>{
    if(!existsSync('dist-site/catalog.json'))return;
    const result=Bun.spawnSync(['bun','-e',`const c=await Bun.file('dist-site/catalog.json').json();if(c.schemaVersion!==1||!Array.isArray(c.items))throw Error('catalog schema');if(c.items.length===0)throw Error('empty catalog');if(!c.language?.schema?.schema?.$defs||!c.language?.forms?.kinds)throw Error('language reference missing');if(c.language.forms.kinds.length!==7)throw Error('kind count');if(c.language.forms.kinds.reduce((n,k)=>n+k.forms.length,0)!==22)throw Error('form count');if(c.items.length!==53)throw Error('sample instance count');for(const i of c.items){if(!i.id||!i.targets)throw Error('invalid item');for(const t of ['dot','mermaid','lini'])if(!['supported','reported-loss','unsupported'].includes(i.targets[t]?.status))throw Error('invalid status');}`],{stdout:'pipe',stderr:'pipe'});
    expect(result.exitCode).toBe(0);
  });
});
