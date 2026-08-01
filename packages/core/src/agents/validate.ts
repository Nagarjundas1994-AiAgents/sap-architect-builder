import type { ArchitectureModel } from "@sap-architect/shared";
import { validateDrawioXml, type ValidationResult } from "@sap-architect/drawio";

export interface ModelValidation {
  ok: boolean;
  issues: string[];
}

export function validateArchitectureModel(model: ArchitectureModel): ModelValidation {
  const issues: string[] = [];
  const ids = new Set<string>();

  // ponytail: model can arrive from an LLM or a hand-edited JSON textarea — coerce here
  // rather than guarding at every caller.
  if (!model || typeof model !== "object") {
    return { ok: false, issues: ["Model must be a JSON object"] };
  }
  const arr = <T>(v: unknown, name: string): T[] => {
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v)) {
      issues.push(`${name} must be an array`);
      return [];
    }
    return v as T[];
  };

  const actors = arr<ArchitectureModel["actors"][number]>(model.actors, "actors");
  const zones = arr<ArchitectureModel["zones"][number]>(model.zones, "zones");
  const components = arr<ArchitectureModel["components"][number]>(model.components, "components");
  const flows = arr<ArchitectureModel["flows"][number]>(model.flows, "flows");

  const take = (id: string, kind: string) => {
    if (!id) {
      issues.push(`Missing id on ${kind}`);
      return;
    }
    if (ids.has(id)) issues.push(`Duplicate id: ${id} (${kind})`);
    ids.add(id);
  };

  for (const a of actors) take(a.id, "actor");
  for (const z of zones) {
    take(z.id, "zone");
    if (z.parentId && !zones.some((x) => x.id === z.parentId)) {
      issues.push(`Zone ${z.id} parent ${z.parentId} missing`);
    }
  }
  for (const c of components) {
    take(c.id, "component");
    if (!zones.some((z) => z.id === c.zoneId)) {
      issues.push(`Component ${c.id} zone ${c.zoneId} missing`);
    }
  }
  const endpoints = new Set([...components.map((c) => c.id), ...actors.map((a) => a.id)]);
  for (const f of flows) {
    take(f.id, "flow");
    if (!endpoints.has(f.sourceId)) issues.push(`Flow ${f.id} bad source ${f.sourceId}`);
    if (!endpoints.has(f.targetId)) issues.push(`Flow ${f.id} bad target ${f.targetId}`);
  }

  if (!model.title?.trim()) issues.push("Missing title");
  if (components.length === 0) issues.push("No components extracted");

  return { ok: issues.length === 0, issues };
}

export function validateDiagram(xml: string): ValidationResult {
  return validateDrawioXml(xml);
}
