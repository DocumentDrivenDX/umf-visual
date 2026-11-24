// SPDX-License-Identifier: MIT OR Apache-2.0
import {directedDagRanks} from '../../presentation/dag-layout.js';
import type {FullEdge} from '../../interchange/full/types.js';
import type {Box} from './scene.js';

export interface LayoutGroup {id: string; parent?: string; label: string}
export interface LayoutNode {id: string; group?: string; width: number; height: number}
type Sized = Pick<Box, 'id' | 'width' | 'height'>;
interface Section {width: number; height: number; placed: Box[]; blocks: (Sized & {contents: Section})[]}
const padding = 32;
const gap = 88;

function placeRows(rows: Sized[][], top: number, left: number): Box[] {
  let y = top;
  return rows.flatMap(row => {
    let x = left;
    const height = Math.max(...row.map(item => item.height), 0);
    const placed = row.map(item => {
      const box = {...item, x, y: y + (height - item.height) / 2};
      x += item.width + gap;
      return box;
    });
    y += height + gap;
    return placed;
  });
}

function rowsFor(nodes: Sized[], edges: FullEdge[]): Sized[][] {
  const ranks = directedDagRanks(nodes.map(node => node.id), edges.filter(edge => edge.from !== edge.to));
  if (ranks && ranks.size > 1 && new Set(ranks.values()).size > 1) {
    const rows: Sized[][] = [];
    for (const node of nodes) (rows[ranks.get(node.id)!] ??= []).push(node);
    // Keep long bands inspectable on an ordinary diagram canvas.
    return rows.flatMap(row => Array.from({length: Math.ceil(row.length / 5)}, (_, i) => row.slice(i * 5, i * 5 + 5)));
  }
  const columns = Math.max(1, Math.min(5, Math.ceil(Math.sqrt(nodes.length))));
  return Array.from({length: Math.ceil(nodes.length / columns)}, (_, i) => nodes.slice(i * columns, (i + 1) * columns));
}

export function layoutPresentation(nodes: LayoutNode[], groups: LayoutGroup[], edges: FullEdge[], top: number) {
  const boxes = new Map<string, Box>();
  const groupBoxes = new Map<string, Box>();
  const layout = (scope: string | undefined, depth: number): Section => {
    if (depth > 32) throw new RangeError('Excalidraw presentation group nesting exceeds 32 levels');
    const localNodes = nodes.filter(node => node.group === scope);
    const localIds = new Set(localNodes.map(node => node.id));
    const subgroups = groups.filter(group => group.parent === scope);
    const blocks = subgroups.map(group => {
      const contents = layout(group.id, depth + 1);
      return {id: group.id, width: Math.max(180, group.label.length * 12 + 2 * padding, contents.width),
        height: Math.max(90, contents.height), contents};
    });
    const nodeRows = rowsFor(localNodes, edges.filter(edge => localIds.has(edge.from) && localIds.has(edge.to)));
    const groupRows = Array.from({length: Math.ceil(blocks.length / 2)}, (_, i) => blocks.slice(i * 2, i * 2 + 2));
    const placed = placeRows([...groupRows, ...nodeRows], scope ? 66 : top, padding);
    const width = Math.max(padding, ...placed.map(box => box.x + box.width)) + padding;
    const height = Math.max(66, ...placed.map(box => box.y + box.height)) + padding;
    return {width, height, placed, blocks};
  };
  const flatten = (section: Section, x: number, y: number) => {
    const groupsById = new Map(section.blocks.map(block => [block.id, block]));
    for (const local of section.placed) {
      const box = {...local, x: local.x + x, y: local.y + y};
      const group = groupsById.get(box.id);
      if (group) {
        groupBoxes.set(box.id, box);
        flatten(group.contents, box.x, box.y);
      } else {
        boxes.set(box.id, box);
      }
    }
  };
  flatten(layout(undefined, 0), 0, 0);
  return {boxes, groupBoxes};
}
