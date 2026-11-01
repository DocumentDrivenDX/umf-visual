import {describe,expect,it} from 'bun:test';

describe('qualified annotation profile interface',()=>{
  it('separates opt-in profile selection, focused and complete views, and native baselines',async()=>{
    const html=await Bun.file('microsite/index.html').text();
    const app=await Bun.file('microsite/app.js').text();
    const css=await Bun.file('microsite/styles.css').text();
    for(const text of ['id="qualified-profile-controls"','id="profile-select"','id="view-diagram"','id="view-complete"','aria-label="Target format"','id="full-profile-coverage-grid"','id="release-coverage-stats"','aria-label="Preferred annotation-profile coverage by form"','FULL INTERCHANGE · STRICT READBACK · NATIVE RENDER','Approximate presentation geometry is listed separately','Released native subsets (compatibility)','narrower, frozen native profiles','Native diagrams and readable typed-property fallbacks preserve authored meaning','Whole-document readback, visual approximations, native render results'])expect(html).toContain(text);
    expect(html).not.toContain('reported loss may signal a model gap');
    for(const text of ['preferredRelease','profileVariants','fullProfileVariants','diagramRender','Complete annotated view','Complete native view','profileApproximationDetails','separate from reported semantic losses','representation','row.path','Unchanged','Download annotated source','Download complete native source','Open focused diagram display SVG in new tab','FULL INTERCHANGE PROFILE','renderFullProfileCoverage','examples with qualified choice','nativeDiagnostics','native-render-diagnostics','reported semantic losses','narrower compatibility profile','notEvaluated','strict rendered examples','isFullyQualifiedFullProfile','existing native-profile routes','primitive diagram routes','Existing native profile reused after full-document readback','Primitive diagram shapes and links; all remaining fields are shown as readable typed property records.','Whole-document readback is verified','sourceMappingVersion','coverageModel'])expect(app).toContain(text);
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
    expect(css).toContain('.full-profile-coverage-grid');
    expect(css).toContain('.profile-approximations');
    expect(css).toContain('@media(max-width:620px){.qualified-profile-controls');
  });

  it('provides a release-gated browser proof for all examples and forms',async()=>{
    const browser=await Bun.file('scripts/catalog-profile-ui-browser.ts').text();
    expect(browser).toContain("catalog.items.length!==53");
    expect(browser).toContain("forms.length!==22");
    expect(browser).toContain('Preferred-profile browser checks are gated until complete release evidence exists');
    expect(browser).toContain('variant.diagramRender');
    expect(browser).toContain('variant.result?.render');
    expect(browser).toContain('item.fullProfileVariants');
    expect(browser).toContain('strict, source-readback, complete-render and focused-render full profile');
    expect(browser).toContain('checks.push(`full-profile');
    expect(browser).toContain('fresh examples prefer qualified full profiles while explicit target-only links retain ordinary native behavior');
    expect(browser).toContain('missing full-profile candidates remain not-evaluated against the fixed 53-example denominator');
    expect(browser).toContain('visual approximations separately from losses');
    expect(browser).toContain('native-profile route selection reuses exact annotated bytes and shows the renderer mapping version');
    expect(browser).toContain('Native compiler diagnostics were hidden or still counted as full-profile qualification');
    expect(browser).toContain('Visual review set must contain one native focused diagram for every canonical form');
    expect(browser).toContain("catalog-profile-forms-contact.png");
    expect(browser).toContain('profile-coverage');
    expect(browser).toContain('document.documentElement.scrollWidth>innerWidth');
  });
});
