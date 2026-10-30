// SPDX-License-Identifier: MIT OR Apache-2.0
import type {MiroBoard, MiroConnectorInput, MiroShapeInput} from '../../src/adapters/miro/index.js';
export class TestItem {
  metadata: unknown = null;
  [key: string]: unknown;
  constructor(public id: string, public type: string, props: object) { Object.assign(this, structuredClone(props)); }
  async setMetadata(_key: string, value: unknown) { this.metadata = structuredClone(value); }
  async getMetadata(_key: string) { return structuredClone(this.metadata); }
}
export class TestBoard implements MiroBoard {
  items: TestItem[] = [];
  experimental?: MiroBoard['experimental'];
  id = 'test-board'; calls = 0; failAt = 0; reads = 0;
  async getInfo() { return {id: this.id}; }
  async get() { this.reads++; return this.items; }
  async createShape(input: MiroShapeInput) { return this.create('shape', input); }
  async createConnector(input: MiroConnectorInput) { return this.create('connector', input); }
  private create(type: string, props: object) {
    this.calls++;
    if (this.calls === this.failAt) throw Error('Synthetic permission/timeout failure');
    const item = new TestItem('34587645123456789' + this.calls, type, props);
    this.items.push(item); return item;
  }
}
