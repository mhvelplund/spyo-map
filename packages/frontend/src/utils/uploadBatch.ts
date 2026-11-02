import type { Inspection } from './fileInspection.js';

export interface BatchResult {
  added: File[];
  duplicates: File[];
  rejected: { file: File; reason: string }[];
}

export interface BatchPlan {
  toUpload: { file: File; sha256: string }[];
  duplicates: File[];
  rejected: { file: File; reason: string }[];
}

export function planBatch(
  inspected: { file: File; inspection: Inspection }[],
  known: Set<string>
): BatchPlan {
  const plan: BatchPlan = { toUpload: [], duplicates: [], rejected: [] };
  const seen = new Set<string>();
  for (const { file, inspection } of inspected) {
    if (!inspection.ok) {
      plan.rejected.push({ file, reason: inspection.reason });
    } else if (known.has(inspection.sha256) || seen.has(inspection.sha256)) {
      plan.duplicates.push(file);
    } else {
      seen.add(inspection.sha256);
      plan.toUpload.push({ file, sha256: inspection.sha256 });
    }
  }
  return plan;
}
