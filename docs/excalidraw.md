# Excalidraw files and headless rendering

## Editable presentations

Use `compileExcalidrawPresentation(document)` from
`@documentdrivendx/umf-visual/excalidraw` to generate a version 2 scene with
editable Excalidraw shapes, text and connectors. Save the returned `text`
as a `.excalidraw` file. The result includes an element map, visual
approximations, and paths to fields retained in the UMF source.

The [microsite examples](https://documentdrivendx.github.io/umf-visual/evidence.html)
build uses this compiler for all 53 catalog fixtures across 22 forms. Select
**Excalidraw** on an example to preview and download the editable scene.
Choose **View evidence** for the native SVG, layout approximations, and omitted
fields. The builder opens, saves and renders each scene in Excalidraw 0.18.1
under headless Chromium. Choose **Compare views** to place Excalidraw and
another renderer side by side for the same example.

The [edit-to-UMF demo](https://documentdrivendx.github.io/umf-visual/evidence.html#excalidraw-demo)
shows the exported scene and the edited scene saved by Excalidraw. Select
**Import edited scene** to run the adapter in your browser. The result shows
the adopted node label and connector endpoint edits. The original UMF and
binding, both scenes, and the recovered UMF are available as downloads.

## Adopt edits to a network

Use `exportExcalidraw` with a `flow/network` visual. Keep the scene and binding together. The binding
carries the source document and the identity of each mapped native slot.

```ts
import {createVisualDocument} from '@documentdrivendx/umf-visual';
import {exportExcalidraw, importExcalidraw, replayExcalidraw} from '@documentdrivendx/umf-visual/excalidraw';

const source = createVisualDocument({
  id: 'request-path', kind: 'flow', form: 'network', question: 'Who handles the request?',
  nodes: [{id: 'client', label: 'Client'}, {id: 'api', label: 'API'}],
  edges: [{id: 'request', from: 'client', to: 'api', label: 'calls'}],
});

const created = await exportExcalidraw(source);
// Save created.text as request.excalidraw and persist created.binding as JSON.

// Pass the file text after native editing and saving.
async function reconcile(editedScene: string) {
  const result = await importExcalidraw(editedScene, {
    binding: created.binding,
    currentDocument: source,
    expectedRevision: 0,
  });
  const scene = await replayExcalidraw({
    binding: result.binding,
    currentDocument: result.document,
    expectedRevision: result.binding.revision,
  });
  return {scene, ...result};
}
```

Use `{mode: 'report'}` on export to allow unmapped semantic fields and inspect
the diagnostics. The initial profile supports existing editable plain-text
labels, bound arrows, and reattachment between mapped rectangles. Arbitrary
whiteboard semantic import and structural editing of mapped elements are
outside this profile. See the [network contract](contracts/CONTRACT-090-excalidraw-network.md)
for versions, field ownership and limits.

## Drive the editor headlessly

From a source checkout with the locked development dependencies installed,
install Chromium with `bunx playwright install chromium`. Then use the local
Excalidraw editor to render a scene to SVG or run the complete edit cycle.

```sh
bun examples/excalidraw/headless.ts request.excalidraw > request.svg
bun run test:excalidraw
```

The test writes `.cache/excalidraw/edited.excalidraw` and
`.cache/excalidraw/edited.svg`. The [driver example](../scripts/excalidraw-browser.ts)
shows how to load, inspect, edit, save and render through the editor API with
Playwright. The SDK and Chromium stay in the development harness. The public
adapter only reads and writes scene strings and JSON bindings.
