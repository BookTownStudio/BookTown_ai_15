import { useEffect, useRef } from 'react';
import { writeEditorTelemetry } from './writeEditorTelemetry.ts';

type RenderInputs = Record<string, unknown>;

function isSameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (a && b && typeof a === 'object') return a === b;
  return false;
}

function getChangedKeys(previous: RenderInputs | null, next: RenderInputs): string[] {
  if (!previous) {
    return ['mount'];
  }

  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  const changed: string[] = [];

  keys.forEach((key) => {
    if (!isSameValue(previous[key], next[key])) {
      changed.push(key);
    }
  });

  return changed.length > 0 ? changed : ['parent_commit'];
}

export function useWriteRenderDiagnostics(component: string, inputs: RenderInputs = {}): void {
  const previousInputsRef = useRef<RenderInputs | null>(null);

  useEffect(() => {
    if (!writeEditorTelemetry.enabled) {
      return;
    }

    const changedKeys = getChangedKeys(previousInputsRef.current, inputs);
    previousInputsRef.current = { ...inputs };
    writeEditorTelemetry.recordRender(component, changedKeys);
  });
}
