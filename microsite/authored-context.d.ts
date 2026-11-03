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

export function authoredFocusTargets(visual: Record<string, unknown>): Map<string, AuthoredFocusTarget[]>;
export function authoredStepListPolicy(steps: readonly ({ when?: string; [key: string]: unknown } | undefined)[]): AuthoredStepListEntry[];
