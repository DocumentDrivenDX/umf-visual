// SPDX-License-Identifier: MIT OR Apache-2.0
import {describe, expect, test} from 'bun:test';
import {readMiroPreviewImageSize, validateMiroCaptureFence} from '../../scripts/evidence/assemble-miro-cohort.js';

const digest = 'a'.repeat(64);
const fence = (overrides: Record<string, unknown> = {}) => ({
  sourceSha256: 'b'.repeat(64), bindingRevision: 4, mappedObjectCount: 3,
  stableSecondCapture: true, mappedObjectsChangedFromBaseline: 0,
  baseline: {captureDigestSha256: digest, revisionKind: 'content-digest', mappedObjectCount: 3},
  observed: {captureDigestSha256: digest, revisionKind: 'content-digest', mappedObjectCount: 3},
  ...overrides,
});

describe('Miro public receipt capture fence', () => {
  test('uses the adapter-proven content digest as the revision token for two matching SDK captures', () => {
    const result = validateMiroCaptureFence(fence(), 3);
    expect(result.before).toEqual({revision: digest, revisionKind: 'content-digest', captureDigestSha256: digest});
    expect(result.after).toEqual(result.before);
  });

  test('rejects a changed capture digest', () => {
    expect(() => validateMiroCaptureFence(fence({observed: {captureDigestSha256: 'c'.repeat(64), revisionKind: 'content-digest'}}), 3))
      .toThrow('revision changed');
  });

  test('rejects unstable SDK observations', () => {
    expect(() => validateMiroCaptureFence(fence({stableSecondCapture: false}), 3)).toThrow('stable second capture');
  });

  test('does not describe a content digest as a server-side compare-and-swap revision', () => {
    const hostPoint = {captureDigestSha256: digest, revisionKind: 'host-revision', revision: 'host-rev'};
    expect(() => validateMiroCaptureFence(fence({baseline: hostPoint, observed: hostPoint}), 3))
      .toThrow('not the qualified content-digest form');
  });

  test('rejects missing mapped objects or unexpected native changes', () => {
    expect(() => validateMiroCaptureFence(fence({mappedObjectCount: 2}), 3)).toThrow('mapped-object count');
    expect(() => validateMiroCaptureFence(fence({mappedObjectsChangedFromBaseline: 1}), 3)).toThrow('changed since the restored binding');
  });

  test('accepts the real private capture-fence envelope layout',()=>{
    const raw={sourceSha256:'b'.repeat(64),bindingRevision:4,mappedObjectCount:3,
      baseline:{captureDigestSha256:digest,revisionKind:'content-digest',mappedObjectCount:3},
      observed:{captureDigestSha256:digest,revisionKind:'content-digest',stableSecondCapture:true,mappedObjectCount:3,mappedObjectsChangedFromBaseline:0}};
    expect(validateMiroCaptureFence(raw,3).after.revision).toBe(digest);
  });

  test('reads dimensions and media type from captured JPEG frames without converting the evidence',()=>{
    const jpeg=Uint8Array.from([0xff,0xd8,0xff,0xc0,0x00,0x11,0x08,0x01,0xf4,0x02,0x58,0x03,0x01,0x11,0x00,0x02,0x11,0x00,0x03,0x11,0x00,0xff,0xd9]);
    expect(readMiroPreviewImageSize(jpeg)).toEqual({width:600,height:500,mediaType:'image/jpeg',extension:'jpg'});
  });
});
