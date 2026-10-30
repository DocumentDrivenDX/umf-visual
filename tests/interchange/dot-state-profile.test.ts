// SPDX-License-Identifier: MIT OR Apache-2.0
import {describe,expect,test} from 'bun:test';
import {parseDotState,serializeDotState} from '../../src/interchange/dot/state';
import {readDotProfile} from '../../src/interchange/dot/profile-syntax';
import type {Visual} from '../../src';
import machine from '../../fixtures/visual/forms/helix-authoring-state.json';
import lifecycle from '../../fixtures/visual/inventory/beacon-ticket-lifecycle.json';
const source=(visual:Visual)=>'digraph state {\n'+serializeDotState(visual).statements.join('\n')+'\n}';
describe('explicit DOT state rendering profile',()=>{
 test('recovers both unchanged state fixtures including typed transition parts',()=>{
  for(const document of [machine,lifecycle]){
   const visual=document.extensions['umf.visual'] as Visual,result=parseDotState(readDotProfile(source(visual)));
   expect(result.diagnostics).toEqual([]);expect(result.visual).toEqual({nodes:visual.nodes,state:visual.state});
   expect(result.identityMap.filter(m=>m.kind==='edge')).toHaveLength(visual.state!.transitions.length);
  }
 });
 test('adopts native state labels, visible action text, and reconnected transition endpoints',()=>{
  const visual=machine.extensions['umf.visual'] as Visual,text=source(visual);
  const changed=text.replace('label="Checked in"','label="Ready"').replace('copy body, export and digest','save the artifact').replace('"state_63_68_65_63_6b_65_64_2d_69_6e" -> "state_63_68_65_63_6b_65_64_2d_6f_75_74"','"state_63_68_65_63_6b_65_64_2d_69_6e" -> "state_63_68_65_63_6b_65_64_2d_69_6e"');
  const result=parseDotState(readDotProfile(changed));expect(result.diagnostics).toEqual([]);expect(result.visual?.nodes?.[1].label).toBe('Ready');expect(result.visual?.state?.transitions[0].action).toBe('save the artifact');expect(result.visual?.state?.transitions[1].to).toBe('checked-in');
 });
 test('refuses stripped markers, conflicting final identity, duplicate transitions and foreign semantic objects',()=>{
  const text=source(lifecycle.extensions['umf.visual'] as Visual);
  for(const changed of [text.replace('shape=point','shape=plaintext'),text.replace('Final states (in order): \\"closed\\"','Final states (in order): \\"new\\"'),text.replace('umf_id="t2"','umf_id="t1"'),text.replace(/}\s*$/,' foreign [label="extra"]; }')])expect(parseDotState(readDotProfile(changed)).diagnostics.some(d=>d.severity==='error')).toBe(true);
 });
 test('typed grammar preserves separator characters without conflating event and guard',()=>{
  const v=structuredClone(machine.extensions['umf.visual']) as Visual;v.state!.transitions[0].event='event: "x"\nguard: not-a-field';v.state!.transitions[0].guard='a | b : c';
  expect(parseDotState(readDotProfile(source(v))).visual?.state).toEqual(v.state);
 });
});
