import {describe,expect,it} from 'bun:test';

describe('qualified annotation profile interface',()=>{
  it('separates opt-in profile selection, focused and complete views, and native baselines',async()=>{
    const html=await Bun.file('microsite/index.html').text();
    const app=await Bun.file('microsite/app.js').text();
    const css=await Bun.file('microsite/styles.css').text();
    for(const text of ['id="qualified-profile-controls"','id="profile-select"','Annotation profile variant','id="view-diagram"','id="view-complete"','aria-label="Native baseline target"','id="release-coverage-stats"','aria-label="Preferred release coverage by form"'])expect(html).toContain(text);
    for(const text of ['preferredRelease','profileVariants','diagramRender','Complete annotated view','representation','row.path','Unchanged','Download annotated source','Open focused diagram SVG in new tab','QUALIFIED ANNOTATION PROFILE','renderReleaseCoverage','examples with qualified choice'])expect(app).toContain(text);
    expect(app).toContain("url.searchParams.set('profile', profileId)");
    expect(app).toContain("url.searchParams.delete('profile')");
    expect(app).toContain("code.textContent = result.source");
    expect(app).not.toContain('innerHTML');
    expect(css).toContain('.profile-render-preview');
    expect(css).toContain('.detail-grid{grid-template-columns:minmax(0,1fr)}.target-pane{grid-row:1');
    expect(css).toContain('height:min(62vh,560px);min-height:420px');
    expect(css).toContain('.profile-zoom-controls');
    expect(app).toContain("el('button', 'icon-button zoom-native-button', '100%')");
    expect(html).toContain('id="sample-document-details"');
    expect(css).toContain('.release-coverage');
    expect(css).toContain('@media(max-width:620px){.qualified-profile-controls');
  });

  it('provides a release-gated browser proof for all examples and forms',async()=>{
    const browser=await Bun.file('scripts/catalog-profile-ui-browser.ts').text();
    expect(browser).toContain("catalog.items.length!==53");
    expect(browser).toContain("forms.length!==22");
    expect(browser).toContain('Preferred-profile browser checks are gated until complete release evidence exists');
    expect(browser).toContain('variant.diagramRender');
    expect(browser).toContain('variant.result?.render');
    expect(browser).toContain('Visual review set must contain one native focused diagram for every canonical form');
    expect(browser).toContain("catalog-profile-forms-contact.png");
    expect(browser).toContain('profile-coverage');
    expect(browser).toContain('document.documentElement.scrollWidth>innerWidth');
  });
});
