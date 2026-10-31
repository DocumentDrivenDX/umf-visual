// SPDX-License-Identifier: MIT OR Apache-2.0
/** Regenerate the bounded P9 renderer loss/probe qualification receipt. */
import {createHash} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {createCatalogData} from './build';
import {createLossLedger} from './loss-ledger';
import {createNativeProbeQualification} from './native-probe-qualification';

const planningPath = 'fixtures/interchange/progress/renderer-coverage-baseline.json';
const planningBytes = await Bun.file(planningPath).bytes();
const planning = JSON.parse(new TextDecoder().decode(planningBytes));
const catalog = await createCatalogData();
const ledger = createLossLedger(catalog, []);
const receipt = createNativeProbeQualification(catalog, ledger, planning, createHash('sha256').update(planningBytes).digest('hex'));
await mkdir('docs/helix/04-build/evidence', {recursive: true});
const target = 'docs/helix/04-build/evidence/renderer-coverage-loss-progress.json';
await Bun.write(target, JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({target, sourceCount: receipt.sourcePopulation.itemCount, ordinaryLosses: receipt.ordinaryLosses.current.emittedRawDiagnosticCounts,
  originalLosses: receipt.ordinaryLosses.baselineSnapshot.counts, liniTitleLossesRemoved: receipt.ordinaryLosses.current.titleMapping.removedRawDiagnostics,
  maximalGroups: receipt.rawInventory.maximalLossGroupCount, boundedProbes: receipt.probes.length}));
