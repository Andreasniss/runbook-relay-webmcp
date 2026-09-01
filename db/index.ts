import { env } from "cloudflare:workers";

export function getD1(): D1Database {
  const bindings = env as unknown as { DB?: D1Database };
  if (!bindings.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the D1 binding before using the control-plane API.",
    );
  }

  return bindings.DB;
}
