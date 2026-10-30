// SPDX-License-Identifier: MIT OR Apache-2.0
import type {EditableMiroBoard, EditableMiroGroup, EditableMiroItem} from '../../src/adapters/miro/editable/types.js';

export class FakeMiroItem implements EditableMiroItem {
  [key: string]: unknown;
  id: string;
  type: string;
  #metadata = new Map<string, unknown>();
  #syncCount = 0;
  failSync?: () => boolean;
  constructor(id: string, type: string, fields: Record<string, unknown> = {}) {this.id = id; this.type = type; Object.assign(this, fields);}
  get syncCount(): number {return this.#syncCount;}
  async sync(): Promise<void> {this.#syncCount++; if (this.failSync?.()) throw new Error('sync failed');}
  async getMetadata(key?: string): Promise<unknown> {return key === undefined ? Object.fromEntries(this.#metadata) : structuredClone(this.#metadata.get(key) ?? null);}
  async setMetadata(key: string, value: unknown): Promise<void> {this.#metadata.set(key, structuredClone(value));}
}
export class FakeMiroGroup implements EditableMiroGroup {
  id: string;
  type = 'group' as const;
  itemsIds: string[];
  #members: FakeMiroItem[];
  constructor(id: string, members: FakeMiroItem[]) {this.id = id; this.#members = members; this.itemsIds = members.map(item => item.id);}
  async getItems(): Promise<EditableMiroItem[]> {return this.#members;}
}
export class FakeMiroBoard implements EditableMiroBoard {
  id = 'synthetic-board';
  items: FakeMiroItem[] = [];
  groups: FakeMiroGroup[] = [];
  sequence = 0;
  creates = 0;
  failCreateAt?: number;
  async getInfo(): Promise<{id: string}> {return {id: this.id};}
  async get(): Promise<(EditableMiroItem | EditableMiroGroup)[]> {return [...this.items, ...this.groups];}
  async createShape(input: {shape: 'rectangle'; content: string; x: number; y: number; width: number; height: number}): Promise<EditableMiroItem> {
    this.creates++;
    if (this.creates === this.failCreateAt) throw new Error('create failed');
    const item = new FakeMiroItem('shape-' + (++this.sequence), 'shape', structuredClone(input));
    this.items.push(item); return item;
  }
  async createConnector(input: {shape: 'straight'; style: {startStrokeCap: 'none'; endStrokeCap: 'stealth'}; start: {item: string; snapTo: 'auto'}; end: {item: string; snapTo: 'auto'}; captions: {content: string; position: number}[]}): Promise<EditableMiroItem> {
    this.creates++;
    if (this.creates === this.failCreateAt) throw new Error('create failed');
    const item = new FakeMiroItem('connector-' + (++this.sequence), 'connector', structuredClone(input));
    this.items.push(item); return item;
  }
  async group(input: {items: EditableMiroItem[]}): Promise<EditableMiroGroup> {
    const members = input.items as FakeMiroItem[];
    if (members.length < 2) throw new Error('group requires two items');
    const id = 'group-' + (++this.sequence), group = new FakeMiroGroup(id, members);
    for (const item of members) item.groupId = id;
    this.groups.push(group); return group;
  }
  addUnrelated(id = 'unrelated-native', type = 'unsupported'): FakeMiroItem {
    const item = new FakeMiroItem(id, type, {data: {opaque: ['retained', 7]}, style: {vendorColor: '#ab12ef'}});
    this.items.push(item); return item;
  }
}
