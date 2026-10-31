// SPDX-License-Identifier: MIT OR Apache-2.0
import {describe, expect, test} from 'bun:test';
import {validateSlidesCapturePair} from '../../scripts/evidence/assemble-slides-cohort.js';

const digest = 'a'.repeat(64);
const observation = (revisionId: string, captureDigestSha256 = digest) => ({
  presentationId: 'private-test-resource', revisionId, captureDigestSha256,
  snapshot: {presentationId: 'private-test-resource'},
}) as any;

describe('Google Slides public receipt capture fence', () => {
  test('accepts two complete captures at the same host revision and digest', () => {
    const capture = observation('revision-token');
    expect(validateSlidesCapturePair({before: capture, after: structuredClone(capture)}, 'fixture')).toEqual({before: capture, after: capture});
  });

  test('rejects a revision change between captures', () => {
    expect(() => validateSlidesCapturePair({before: observation('before'), after: observation('after')}, 'fixture'))
      .toThrow('changed native revision');
  });

  test('rejects a changed host capture digest even when the revision token is unchanged', () => {
    expect(() => validateSlidesCapturePair({before: observation('same'), after: observation('same', 'b'.repeat(64))}, 'fixture'))
      .toThrow('changed native capture digest');
  });

  test('rejects a capture pair without full native snapshots', () => {
    expect(() => validateSlidesCapturePair({before: {revisionId: 'x'}, after: {revisionId: 'x'}}, 'fixture'))
      .toThrow('not a complete Google Slides observation');
  });
});
