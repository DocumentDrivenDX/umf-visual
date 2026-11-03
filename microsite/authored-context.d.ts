export interface AuthoredFocusTarget {
  kind: string;
  label: string;
  sourcePath: string;
}

export interface AuthoredStepListEntry {
  numbered: boolean;
  number: number | undefined;
  listValue: number;
}

export interface AuthoredComparisonField {
  key: string;
  value: unknown;
  sourcePath: string;
}

export interface AuthoredComparisonRow {
  id?: string;
  label?: string;
  sourcePath: string;
  fields: AuthoredComparisonField[];
}

export interface AuthoredComparisonView {
  axes: AuthoredComparisonField[];
  items: AuthoredComparisonRow[];
  criteria: AuthoredComparisonRow[];
  values: Array<{ item?: string; criterion?: string; sourcePath: string; fields: AuthoredComparisonField[] }>;
  chosen: { item?: string; itemSourcePath: string; reason?: string; reasonSourcePath: string } | null;
  omissions: Array<{ text: unknown; sourcePath: string }>;
}

export function authoredFocusTargets(visual: Record<string, unknown>): Map<string, AuthoredFocusTarget[]>;
export function authoredStepListPolicy(steps: readonly ({ when?: string; [key: string]: unknown } | undefined)[]): AuthoredStepListEntry[];
export function authoredComparisonView(visual: Record<string, unknown>): AuthoredComparisonView | null;
