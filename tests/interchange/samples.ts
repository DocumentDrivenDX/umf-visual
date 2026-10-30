import type {Visual} from '../../src/extensions/visual';
export const oracleGraph:Visual={id:'native-graph',kind:'flow',form:'network',question:'What calls what?',title:'Native \"title\" · 東京 #1\nSecond line',
 nodes:[{id:'alpha',label:'A "quoted" <tag> & π',detail:'Secondary "detail" <tag> & π\nline \\ tail'},{id:'beta',label:'end'}],
 edges:[{id:'connects',from:'alpha',to:'beta',label:'uses | safely'}]};
export const oracleEntities:Visual={id:'native-entities',kind:'structure',form:'entities',question:'Which fields connect?',title:'Entity \"title\" · 東京 #2',
 nodes:[{id:'account',label:'Account',detail:'Account description · π'},{id:'event',label:'Event'}],
 structure:{entities:[{node:'account',fields:[{name:'id',type:'uuid'}]},{node:'event',fields:[{name:'account_id',type:'uuid'}]}],
 references:[{id:'account-events',from:{node:'account',field:'id'},to:{node:'event',field:'account_id'},label:'produces',fromCardinality:'exactly-one',toCardinality:'zero-or-many'}]}};
