import {createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {CaptureUpdateAction, Excalidraw, exportToSvg, loadFromBlob, newElementWith, serializeAsJSON} from '@excalidraw/excalidraw';
import type {ExcalidrawImperativeAPI} from '@excalidraw/excalidraw/types';

declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH: string;
    editor: ReturnType<typeof driver>;
  }
}

function driver(api: ExcalidrawImperativeAPI) {
  return {
    async open(text: string) {
      const scene = await loadFromBlob(new Blob([text], {type: 'application/json'}), null, null);
      api.resetScene();
      api.addFiles(Object.values(scene.files));
      api.updateScene({elements: scene.elements, appState: scene.appState, captureUpdate: CaptureUpdateAction.NEVER});
    },
    elements() {
      return api.getSceneElements();
    },
    update(elements: ReturnType<ExcalidrawImperativeAPI['getSceneElements']>) {
      const edited = new Map(elements.map(element => [element.id, element]));
      api.updateScene({elements: api.getSceneElements().map(element => {
        const next = edited.get(element.id);
        return next ? newElementWith(element, next) : element;
      }), captureUpdate: CaptureUpdateAction.IMMEDIATELY});
    },
    save() {
      return serializeAsJSON(api.getSceneElements(), api.getAppState(), api.getFiles(), 'local');
    },
    async svg() {
      const svg = await exportToSvg({elements: api.getSceneElements(), appState: api.getAppState(), files: api.getFiles()});
      return svg.outerHTML;
    },
  };
}

window.EXCALIDRAW_ASSET_PATH = '/';
createRoot(document.getElementById('root')!).render(createElement(Excalidraw, {
  excalidrawAPI: api => { window.editor = driver(api); },
}));
