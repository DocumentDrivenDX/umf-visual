// SPDX-License-Identifier: MIT OR Apache-2.0
/** Build-time YAML for the exact public visual payload shown beside a preview. */
import {readJsonValue,writeJsonValue,type Document} from '@umf/core';
import {getVisual} from '../../src/extensions/visual';

export function visualPayloadYaml(document:Document):string {
 const visual=getVisual(document),yaml=writeJsonValue(visual,'yaml');
 if(JSON.stringify(readJsonValue(yaml,'yaml'))!==JSON.stringify(visual))throw Error('Visual payload YAML changed the authored value.');
 return yaml;
}
