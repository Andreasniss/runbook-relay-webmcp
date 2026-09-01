import { z } from "zod";
import {
  ControlPlaneError,
  MITIGATIONS,
  approveMitigation,
  executeMitigation,
  getControlPlaneSnapshot,
  recordToolObservation,
  resetIncident,
  stageMitigation,
} from "../../../db/control-plane";
import { getD1 } from "../../../db";
import { sha256Hex } from "../../../lib/control-plane.mjs";

export const dynamic = "force-dynamic";

const SESSION_COOKIE = "rr_session";
const SESSION_MAX_AGE_SECONDS = 24 * 60 * 60;

const actorChannel = z.enum(["native", "simulator", "human"]);
const operationSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("snapshot"), actorChannel }),
  z.object({ operation: z.literal("compare"), mitigationId: z.enum(["restore-pool", "shift-traffic", "scale-workers"]).optional(), actorChannel }),
  z.object({ operation: z.literal("stage"), mitigationId: z.enum(["restore-pool", "shift-traffic", "scale-workers"]), actorChannel }),
  z.object({ operation: z.literal("approve"), actionDigest: z.string().regex(/^[a-f0-9]{64}$/), resourceVersion: z.number().int().positive() }),
  z.object({ operation: z.literal("execute"), actionDigest: z.string().regex(/^[a-f0-9]{64}$/), resourceVersion: z.number().int().positive(), idempotencyKey: z.string().regex(/^rr_[a-f0-9]{32}$/), actorChannel }),
  z.object({ operation: z.literal("reset"), expectedResourceVersion: z.number().int().positive(), actorChannel }),
]);

function parseCookies(request: Request) {
  return Object.fromEntries(
    (request.headers.get("cookie") ?? "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");
        return separator === -1 ? [part, ""] : [part.slice(0, separator), part.slice(separator + 1)];
      }),
  );
}

function createSessionToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function resolveSession(request: Request) {
  const supplied = parseCookies(request)[SESSION_COOKIE];
  const token = supplied && /^[a-f0-9]{64}$/.test(supplied) ? supplied : createSessionToken();
  const sessionKey = await sha256Hex(`runbook-relay:${token}`);
  return {
    token,
    sessionKey,
    identityLabel: `session:${sessionKey.slice(0, 12)}`,
    isNew: token !== supplied,
  };
}

function jsonResponse(request: Request, body: unknown, status: number, token: string, setCookie: boolean) {
  const headers = new Headers({
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
  });
  if (setCookie) {
    const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
    headers.append(
      "set-cookie",
      `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}${secure}`,
    );
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    throw new ControlPlaneError("origin_rejected", "State-changing requests must come from the same origin.", 403);
  }
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    throw new ControlPlaneError("content_type_rejected", "State-changing requests must use application/json.", 415);
  }
}

export async function GET(request: Request) {
  const session = await resolveSession(request);
  try {
    const snapshot = await getControlPlaneSnapshot(getD1(), session.sessionKey, session.identityLabel);
    return jsonResponse(request, snapshot, 200, session.token, session.isNew);
  } catch {
    return jsonResponse(request, { error: { code: "control_plane_unavailable", message: "The control plane is unavailable." } }, 503, session.token, session.isNew);
  }
}

export async function POST(request: Request) {
  const session = await resolveSession(request);
  try {
    assertSameOrigin(request);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ControlPlaneError("invalid_json", "The request body must be valid JSON.", 400);
    }
    const parsed = operationSchema.safeParse(body);
    if (!parsed.success) {
      throw new ControlPlaneError("invalid_request", "The request did not match the bounded control-plane contract.", 422);
    }
    const db = getD1();
    const input = parsed.data;
    let snapshot;

    switch (input.operation) {
      case "snapshot":
        snapshot = await recordToolObservation(db, session.sessionKey, session.identityLabel, {
          tool: "get_incident_snapshot",
          event: "Incident snapshot read",
          actorChannel: input.actorChannel,
          result: { incidentId: "INC-2841" },
          detail: "Current incident, telemetry, staged action, approval, and resource version returned.",
        });
        break;
      case "compare": {
        const focused = input.mitigationId ? MITIGATIONS.find((item) => item.id === input.mitigationId) ?? null : null;
        snapshot = await recordToolObservation(db, session.sessionKey, session.identityLabel, {
          tool: "compare_mitigations",
          event: "Mitigations compared",
          actorChannel: input.actorChannel,
          request: input.mitigationId ? { mitigationId: input.mitigationId } : {},
          result: { current: { p95Latency: "4.8 s", errorRate: "8.7%" }, options: MITIGATIONS, focused },
          detail: focused ? `${focused.title} focused after comparing three deterministic projections.` : "Three deterministic mitigations compared.",
        });
        break;
      }
      case "stage":
        snapshot = await stageMitigation(db, session.sessionKey, session.identityLabel, input.mitigationId, input.actorChannel);
        break;
      case "approve":
        snapshot = await approveMitigation(db, session.sessionKey, session.identityLabel, input);
        break;
      case "execute":
        snapshot = await executeMitigation(db, session.sessionKey, session.identityLabel, input, input.actorChannel);
        break;
      case "reset":
        snapshot = await resetIncident(db, session.sessionKey, session.identityLabel, input.expectedResourceVersion, input.actorChannel);
        break;
    }
    return jsonResponse(request, snapshot, 200, session.token, session.isNew);
  } catch (error) {
    const failure = error instanceof ControlPlaneError
      ? error
      : new ControlPlaneError("control_plane_unavailable", "The control plane is unavailable.", 503);
    let snapshot = null;
    try {
      snapshot = await getControlPlaneSnapshot(getD1(), session.sessionKey, session.identityLabel);
    } catch {
      snapshot = null;
    }
    return jsonResponse(
      request,
      { error: { code: failure.code, message: failure.message }, snapshot },
      failure.status,
      session.token,
      session.isNew,
    );
  }
}
