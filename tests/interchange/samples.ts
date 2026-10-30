import type {Visual} from '../../src/extensions/visual';
export const oracleGraph:Visual={id:'native-graph',kind:'flow',form:'network',question:'What calls what?',
 nodes:[{id:'alpha',label:'A "quoted" <tag> & π'},{id:'beta',label:'end'}],
 edges:[{id:'connects',from:'alpha',to:'beta',label:'uses | safely'}]};
export const oracleEntities:Visual={id:'native-entities',kind:'structure',form:'entities',question:'Which fields connect?',
 nodes:[{id:'account',label:'Account'},{id:'event',label:'Event'}],
 structure:{entities:[{node:'account',fields:[{name:'id',type:'uuid'}]},{node:'event',fields:[{name:'account_id',type:'uuid'}]}],
 references:[{id:'account-events',from:{node:'account',field:'id'},to:{node:'event',field:'account_id'},label:'produces',fromCardinality:'exactly-one',toCardinality:'zero-or-many'}]}};
