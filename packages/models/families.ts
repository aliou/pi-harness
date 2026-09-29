import type { Api, Model } from "@earendil-works/pi-ai";

export type ModelIdentity = Pick<Model<Api>, "provider" | "id">;

/**
 * Model families that have a prompting guide in `docs/prompting-*.md` and at
 * least one subagent prompt builder that branches on them.
 */
export type KnownModelFamily =
  | "gpt-6"
  | "claude-opus-5.5"
  | "claude-sonnet-5"
  | "glm-5.3";

export function modelKey(model: ModelIdentity): string {
  return `${model.provider}/${model.id}`;
}

export function knownModelFamily(
  model: ModelIdentity,
): KnownModelFamily | undefined {
  const id = normalizedId(model);

  if (isFamilyId(id, "gpt-6")) return "gpt-6";
  if (id === "claude-opus-5-5" || id === "claude-opus-5.5") {
    return "claude-opus-5.5";
  }
  if (id === "claude-sonnet-5") return "claude-sonnet-5";
  if (isFamilyId(id, "glm-5.3")) return "glm-5.3";

  return undefined;
}

/** Matches the family id itself or a dash-suffixed variant (`glm-5.3-flash`). */
function isFamilyId(id: string, family: string): boolean {
  return id === family || id.startsWith(`${family}-`);
}

function normalizedId(model: ModelIdentity): string {
  const id = model.id.toLowerCase();
  const hfPrefix = "hf:";
  const withoutHf = id.startsWith(hfPrefix) ? id.slice(hfPrefix.length) : id;
  return withoutHf.split("/").at(-1) ?? withoutHf;
}
