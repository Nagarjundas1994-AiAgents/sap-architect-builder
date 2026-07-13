import type { ArchitectureModel } from "@sap-architect/shared";
import { validateDrawioXml, type ValidationResult } from "@sap-architect/drawio";

export interface ModelValidation {
  ok: boolean;
  issues: string[];
}

export function validateArchitectureModel(model: ArchitectureModel): ModelValidation {
  const issues: string[] = [];
  const ids = new Set<string>();

  const take = (id: string, kind: string) => {
    if (ids.has(id)) issues.push(`Duplicate id: ${id} (${kind})`);
    ids.add(id);
  };

  for (const a of model.actors) take(a.id, "actor");
  for (const z of model.zones) {
    take(z.id, "zone");
    if (z.parentId && !model.zones.some((x) => x.id === z.parentId)) {
      issues.push(`Zone ${z.id} parent ${z.parentId} missing`);
    }
  }
  for (const c of model.components) {
    take(c.id, "component");
    if (!model.zones.some((z) => z.id === c.zoneId)) {
      issues.push(`Component ${c.id} zone ${c.zoneId} missing`);
    }
  }
  for (const f of model.flows) {
    take(f.id, "flow");
    const endpoints = new Set([
      ...model.components.map((c) => c.id),
      ...model.actors.map((a) => a.id),
    ]);
    if (!endpoints.has(f.sourceId)) issues.push(`Flow ${f.id} bad source ${f.sourceId}`);
    if (!endpoints.has(f.targetId)) issues.push(`Flow ${f.id} bad target ${f.targetId}`);
  }

  if (!model.title?.trim()) issues.push("Missing title");
  if (model.components.length === 0) issues.push("No components extracted");

  return { ok: issues.length === 0, issues };
}

export function validateDiagram(xml: string): ValidationResult {
  return validateDrawioXml(xml);
}
