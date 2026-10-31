import {describe, expect, it} from 'bun:test';
import {isReleaseQualified} from '../../scripts/catalog/verify';
import type {CatalogProfileVariant} from '../../scripts/catalog/build';

const goodVariant=():CatalogProfileVariant=>({
  profileId:'umf.visual.lini.annotated/1',format:'lini',mappingVersion:'0.2.0',modelVersion:'1.0.0',
  result:{status:'supported',ok:true,source:'native source',diagnostics:[],identityMap:[],render:{ok:true,engine:'lini',nativeVersion:'test',svgPath:'renders/full.svg',svgSha256:'a'.repeat(64)}},
  coverage:[{path:'/extensions/umf.visual/question',aspect:'value',representation:'profile-annotation',native:[{id:'note-1',slot:'text'}]}],
  diagramRender:{ok:true,engine:'lini',nativeVersion:'test',svgPath:'renders/focused.svg',svgSha256:'b'.repeat(64)},diagramSourceSha256:'c'.repeat(64),diagramDescription:'Focused native diagram',
});

describe('preferred release qualification',()=>{
  it('accepts only strict, fully covered, complete and focused native previews',()=>{
    expect(isReleaseQualified(goodVariant())).toBe(true);
  });

  it('keeps a useful reported-loss preview out of complete release counts',()=>{
    const variant=goodVariant();
    variant.result.status='reported-loss';
    variant.result.diagnostics=[{code:'TEST_LOSS',path:'/extensions/umf.visual/layout',message:'A native layout attribute is not represented.',severity:'warning',loss:true}];
    expect(variant.result.render?.ok).toBe(true);
    expect(variant.diagramRender?.ok).toBe(true);
    expect(isReleaseQualified(variant)).toBe(false);
  });

  it('rejects missing coverage and any loss/error diagnostic even when previews exist',()=>{
    const noCoverage=goodVariant();noCoverage.coverage=[];
    expect(isReleaseQualified(noCoverage)).toBe(false);
    const error=goodVariant();error.result.diagnostics=[{code:'TEST_ERROR',path:'/source',message:'Invalid source.',severity:'error',loss:false}];
    expect(isReleaseQualified(error)).toBe(false);
  });
});
