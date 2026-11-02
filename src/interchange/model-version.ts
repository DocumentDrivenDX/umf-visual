// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document} from '@umf/core';
/** Version qualification is independent of the vocabulary registry's ability to read it. */
export function requireQualifiedInterchangeModel(document:Document):void {
 const version=document?.vocabularies?.['umf.visual']?.version;
 if(version!==undefined&&!['1.0.0','1.1.0'].includes(version))throw new TypeError(
  `The selected released interchange profile has no qualified umf.visual ${version} mapping. Its existing profile-specific 1.0.0/1.1.0 bounds remain unchanged. New shapes, ports, layout and relationship semantics require a qualified mapping; visible record retention alone is insufficient.`
 );
}
