// SPDX-License-Identifier: MIT OR Apache-2.0
import {describe, expect, test} from 'bun:test';
import {readFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {validatePowerPointOpenAttestation} from '../../scripts/evidence/assemble-powerpoint-layout-previews';

const root = resolve(import.meta.dir, '../..');

describe('PowerPoint layout preview native-open receipt',()=>{
  test('requires actual operator evidence bound to the exact two preview artifacts',async()=>{
    const receipt=JSON.parse(await readFile(join(root,'fixtures/renderers/powerpoint/preview-layout-open-attestations.json'),'utf8'));
    const durable=JSON.parse(await readFile(join(root,'fixtures/renderers/powerpoint/preview-receipt.json'),'utf8'));
    for(const id of ['process-documents-store','network-16x24']){
      const entry=durable.cases.find((item:any)=>item.id===id);
      const evidence=validatePowerPointOpenAttestation(receipt,id,entry.artifact.sha256);
      expect(evidence).toMatchObject({application:'Microsoft PowerPoint for Mac',version:'16.114.3',reopenObserved:true,noRepairPrompt:true});
      expect((evidence as any).screenshotSha256).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  test('rejects missing, duplicate, or artifact-mismatched native-open attestations',async()=>{
    const receipt=JSON.parse(await readFile(join(root,'fixtures/renderers/powerpoint/preview-layout-open-attestations.json'),'utf8'));
    expect(()=>validatePowerPointOpenAttestation({...receipt,entries:receipt.entries.filter((item:any)=>item.id!=='process-documents-store')},
      'process-documents-store','a'.repeat(64))).toThrow('exactly one');
    expect(()=>validatePowerPointOpenAttestation(receipt,'process-documents-store','a'.repeat(64))).toThrow('different PowerPoint artifact');
    expect(()=>validatePowerPointOpenAttestation({...receipt,entries:[...receipt.entries,receipt.entries[0]]},
      'process-documents-store',receipt.entries[0].artifactSha256)).toThrow('exactly one');
  });
});
