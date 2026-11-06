// SPDX-License-Identifier: MIT OR Apache-2.0
/** Shared native shape vocabulary for the pinned Lini renderer. */
import type {VisualNode} from '../extensions/visual';

export interface LiniShapeDefinition {type:string;properties:string[];caption?:string;approximation?:string;}
type ShapeProfile={flow:LiniShapeDefinition;sequence:LiniShapeDefinition};
const shapes:Record<NonNullable<VisualNode['shape']>,ShapeProfile>={
 rectangle:{flow:{type:'box',properties:['radius: 0;']},sequence:{type:'box',properties:['radius: 0;']}},
 'rounded-rectangle':{flow:{type:'box',properties:[]},sequence:{type:'box',properties:[]}},
 ellipse:{flow:{type:'oval',properties:[]},sequence:{type:'oval',properties:[]}},
 diamond:{flow:{type:'diamond',properties:[]},sequence:{type:'diamond',properties:[]}},
 hexagon:{flow:{type:'hex',properties:[]},sequence:{type:'hex',properties:[]}},
 cylinder:{flow:{type:'cyl',properties:[]},sequence:{type:'cyl',properties:[]}},
 'folded-corner':{flow:{type:'note',properties:[]},sequence:{type:'box',properties:[],caption:'(requested shape: folded-corner)',approximation:'Pinned Lini sequence participants cannot use the native note stencil because that selector denotes a sequence annotation. This participant uses one native box with an owned “requested shape: folded-corner” caption.'}},
 parallelogram:{flow:{type:'slant',properties:[]},sequence:{type:'slant',properties:[]}},
 document:{flow:{type:'note',properties:[]},sequence:{type:'box',properties:[],caption:'(requested shape: document)',approximation:'Pinned Lini sequence participants cannot use the native note stencil because that selector denotes a sequence annotation. This participant uses one native box with an owned “requested shape: document” caption.'}},
 'multiple-documents':{flow:{type:'note',properties:['multiple: 2;']},sequence:{type:'box',properties:['multiple: 2;'],caption:'(requested shape: multiple-documents)',approximation:'Pinned Lini sequence participants cannot use the native note stencil because that selector denotes a sequence annotation. This participant uses one native box with an offset backing sheet and an owned “requested shape: multiple-documents” caption; the backing is decorative and does not assert document count.'}},
};

export const liniShapeDefinition=(shape:VisualNode['shape'],profile:'flow'|'sequence'='flow'):LiniShapeDefinition|undefined=>shape?shapes[shape][profile]:undefined;
