import {mkdir} from 'node:fs/promises';
import {withHeadlessExcalidraw} from '../examples/excalidraw/headless';
import {runExcalidrawEditDemo} from './catalog/excalidraw-demo';

await withHeadlessExcalidraw(async (page, chromium) => {
  const result = await runExcalidrawEditDemo(page);
  await mkdir('.cache/excalidraw', {recursive: true});
  await Bun.write('.cache/excalidraw/edited.excalidraw', result.replay);
  await Bun.write('.cache/excalidraw/edited.svg', result.svg);
  console.log(JSON.stringify({ok: true, excalidraw: '0.18.1', chromium, bindings: result.replayRevision,
    adopted: ['node label', 'attached arrow endpoint'], preserved: ['rectangle movement', 'stroke color', 'self-loop']}));
});
