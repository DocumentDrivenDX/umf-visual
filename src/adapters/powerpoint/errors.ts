// SPDX-License-Identifier: MIT OR Apache-2.0
export class PowerPointError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'PowerPointError'; }
}
export function requirePpt(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new PowerPointError(code, message);
}

