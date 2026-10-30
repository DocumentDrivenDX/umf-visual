// SPDX-License-Identifier: MIT OR Apache-2.0
// Generated from spec/extensions/visual/schema.json by scripts/generate.ts; edit the schema, then run `bun run generate`.
/** The shape of each schema definition, by name. */
export interface VisualDefs {
 id:string;
 status:'built'|'placeholder'|'decided'|'unknown';
 emphasis:'focus'|'muted';
 evidence:{path:string;contains?:string}[];
 labelled:{id:VisualDefs['id'];label:string};
 group:{id:VisualDefs['id'];label:string;detail?:string;role:'zone'|'boundary'|'lane'|'tier'|'region'|'phase'|'loop'|'alternative';tier?:number;parent?:VisualDefs['id'];status?:VisualDefs['status'];emphasis?:VisualDefs['emphasis']};
 node:{id:VisualDefs['id'];label:string;detail?:string;role?:'actor'|'own'|'platform'|'external'|'store'|'document';status?:VisualDefs['status'];emphasis?:VisualDefs['emphasis'];group?:VisualDefs['id'];parent?:VisualDefs['id'];layer?:VisualDefs['id'];evidence?:VisualDefs['evidence']};
 participant:{id:VisualDefs['id'];label:string;detail?:string;role?:'actor'|'own'|'platform'|'external'|'store'|'document';status?:VisualDefs['status'];emphasis?:VisualDefs['emphasis'];evidence?:VisualDefs['evidence']};
 edge:{id:VisualDefs['id'];from:VisualDefs['id'];to:VisualDefs['id'];label?:string;why?:string;kind?:'action'|'data'|'control'|'return';status?:VisualDefs['status'];emphasis?:VisualDefs['emphasis'];evidence?:VisualDefs['evidence']};
 step:{id:VisualDefs['id'];title:string;caption?:string;focus:VisualDefs['id'][];when?:'throughout'|'before'|'after'|'background'|'scheduled'|'on-failure'|'optional'|'other';tag?:string};
 source:{path:string;view?:string;digest?:string};
 sequence:{participants:VisualDefs['participant'][];messages:({id:VisualDefs['id'];from:VisualDefs['id'];to:VisualDefs['id'];label:string;kind?:'call'|'return'|'async'|'note';group?:VisualDefs['id'];status?:VisualDefs['status'];emphasis?:VisualDefs['emphasis'];evidence?:VisualDefs['evidence']})[]};
 cardinality:'zero-or-one'|'exactly-one'|'zero-or-many'|'one-or-many';
 multiplicity:{min:number;max?:number;text?:string};
 endpoint:{node:VisualDefs['id'];field?:string;fieldId?:VisualDefs['id']};
 structure:{layers?:VisualDefs['labelled'][];entities?:({node:VisualDefs['id'];fields:({id?:VisualDefs['id'];name:string;type?:string;keys?:('pk'|'fk'|'uk')[];nullable?:boolean})[]})[];references?:{id:VisualDefs['id'];from:VisualDefs['endpoint'];to:VisualDefs['endpoint'];label?:string;fromCardinality?:VisualDefs['cardinality'];toCardinality?:VisualDefs['cardinality'];fromMultiplicity?:VisualDefs['multiplicity'];toMultiplicity?:VisualDefs['multiplicity']}[]};
 state:{initial:VisualDefs['id'];final?:VisualDefs['id'][];transitions:({id:VisualDefs['id'];from:VisualDefs['id'];to:VisualDefs['id'];event:string;guard?:string;action?:string;path?:'main'|'alternate'|'failure';status?:VisualDefs['status'];emphasis?:VisualDefs['emphasis']})[]};
 timeline:{scale:{kind:'date'}|{kind:'period';periods:VisualDefs['labelled'][]};lanes?:VisualDefs['labelled'][];events?:{id:VisualDefs['id'];label:string;at:string;lane?:VisualDefs['id'];detail?:string;status?:VisualDefs['status'];emphasis?:VisualDefs['emphasis']}[];spans?:{id:VisualDefs['id'];label:string;start:string;end:string;lane?:VisualDefs['id'];detail?:string;status?:VisualDefs['status'];emphasis?:VisualDefs['emphasis']}[];markers?:({id:VisualDefs['id'];label:string;at:string;kind:'today'|'deadline'|'marker'})[]};
 comparison:{items:{id:VisualDefs['id'];label:string;detail?:string}[];criteria:({id:VisualDefs['id'];label:string;detail?:string;measure:'text'|'rating'|'support';max?:number;low?:string;high?:string})[];values:({item:VisualDefs['id'];criterion:VisualDefs['id'];text?:string;rating?:number;support?:'yes'|'no'|'partial';note?:string})[];chosen?:{item:VisualDefs['id'];reason:string};axes?:{x:VisualDefs['id'];y:VisualDefs['id']}};
 metric:{unit:string;good?:'up'|'down';format?:{kind:'number'|'percent'|'currency'|'duration';decimals?:number;currency?:string;compact?:boolean};axis?:{kind:'time'}|{kind:'category';categories:VisualDefs['labelled'][]};series:{id:VisualDefs['id'];label:string;emphasis?:VisualDefs['emphasis'];points:{at?:string;value:number}[]}[];target?:number;baseline?:number;comparison?:{label:string;value:number}};
}
/** The shape of a umf.visual payload. Semantic rules (references, forms, dates) are checked at validation. */
export type VisualShape={id:VisualDefs['id'];kind:'flow'|'sequence'|'structure'|'state'|'timeline'|'comparison'|'metric';form:'network'|'pipeline'|'zoned'|'lanes'|'lifelines'|'ladder'|'stack'|'tree'|'nested'|'entities'|'machine'|'lifecycle'|'milestones'|'roadmap'|'history'|'matrix'|'quadrant'|'before-after'|'stat'|'bar'|'line'|'meter';title?:string;question:string;takeaway?:string;audience?:'developer'|'operator'|'user'|'data'|'executive';source?:VisualDefs['source'];omissions?:string[];groups?:VisualDefs['group'][];nodes?:VisualDefs['node'][];edges?:VisualDefs['edge'][];steps?:VisualDefs['step'][];sequence?:VisualDefs['sequence'];structure?:VisualDefs['structure'];state?:VisualDefs['state'];timeline?:VisualDefs['timeline'];comparison?:VisualDefs['comparison'];metric?:VisualDefs['metric']};
