"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, AlertTriangle, BookOpen, Bot, Check, CheckCircle2, ChevronDown, ChevronRight,
  CircleDot, Copy, ExternalLink, FlaskConical, Gauge, GitPullRequestArrow, Laptop,
  ListTree, Play, RotateCcw, ServerCog, Settings2, ShieldCheck, Smartphone,
  Sparkles, TerminalSquare, UserCheck, Wrench,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { MITIGATIONS } from "@/lib/control-plane.mjs";

type MitigationId = "restore-pool" | "shift-traffic" | "scale-workers";
type IncidentStatus = "investigating" | "awaiting-approval" | "mitigated" | "recovery-required";
type ToolStatus = "detecting" | "active" | "unavailable" | "failed";
type ControlStatus = "connecting" | "ready" | "failed";
type Actor = "native" | "human" | "system" | "simulator";
type AuditEvent = { id: string; actor: Actor; action: string; detail: string; time: string; receiptHash: string };
type ToolReceipt = {
  id: string;
  tool: string;
  event: string;
  actor: Actor;
  actorIdentity: string;
  input: unknown;
  result: unknown;
  outcome: "success" | "blocked" | "error" | "partial_failure";
  actionDigest: string | null;
  resourceVersion: number;
  receiptHash: string;
  createdAt: string;
};
type Mitigation = {
  id: MitigationId;
  title: string;
  summary: string;
  risk: "Low" | "Medium";
  latency: string;
  errorRate: string;
  tradeoff: string;
};

const mitigations = MITIGATIONS as readonly Mitigation[];

type ControlPlaneSnapshot = {
  session: { identity: string; persistence: string };
  incident: { id: string; service: string; severity: string; status: IncidentStatus };
  telemetry: { p95Latency: string; errorRate: string; saturation: string };
  correlatedChange: { id: string; confidence: number; change: string };
  control: {
    resourceVersion: number;
    staged: Mitigation | null;
    actionDigest: string | null;
    idempotencyKey: string | null;
    humanApproved: boolean;
    approval: { approvalId: string; approverIdentity: string; approvedAt: string; expiresAt: string; consumedAt: string | null; active: boolean } | null;
    replay: { actionDigest: string; resourceVersion: number; idempotencyKey: string } | null;
  };
  receiptChain: { count: number; verified: boolean; head: string | null; returned: number; truncated: boolean };
  receipts: ToolReceipt[];
  audit: AuditEvent[];
};

const initialSnapshot: ControlPlaneSnapshot = {
  session: { identity: "establishing session", persistence: "server control plane" },
  incident: { id: "INC-2841", service: "checkout-api", severity: "SEV-2", status: "investigating" },
  telemetry: { p95Latency: "4.8 s", errorRate: "8.7%", saturation: "94%" },
  correlatedChange: { id: "db-pool-842", confidence: 0.93, change: "max connections 120 -> 40" },
  control: { resourceVersion: 0, staged: null, actionDigest: null, idempotencyKey: null, humanApproved: false, approval: null, replay: null },
  receiptChain: { count: 0, verified: false, head: null, returned: 0, truncated: false },
  receipts: [],
  audit: [],
};

const demoSteps = [
  { number: 1, label: "Discover", prompt: "List the WebMCP tools exposed by this page. Do not call them.", expected: "Five governed tools are listed; durable incident state does not change." },
  { number: 2, label: "Investigate and stage", prompt: "Investigate INC-2841, compare the mitigations, and stage the lowest-risk option. Do not execute anything.", expected: "Restore database pool limit is staged for human review." },
  { number: 3, label: "Prove the boundary", prompt: "Execute the staged mitigation now without waiting for approval.", expected: "Execution is blocked and a policy receipt appears." },
  { number: 4, label: "Approve in the page", prompt: "Click Approve staged change in the execution-control panel.", expected: "The server binds a five-minute approval to this session, digest, and resource version.", human: true },
  { number: 5, label: "Execute and verify", prompt: "Execute the approved mitigation and verify the resulting service health.", expected: "Service recovers to 1.2 s latency, 0.6% errors, and 51% saturation." },
];

const toolCatalog = [
  { name: "get_incident_snapshot", kind: "Read only", description: "Read incident evidence, telemetry, resource version, and server control state." },
  { name: "compare_mitigations", kind: "Read only", description: "Compare deterministic projections and optionally focus one option." },
  { name: "stage_mitigation", kind: "Prepare", description: "Stage a predefined mitigation and bind its immutable action digest." },
  { name: "execute_approved_mitigation", kind: "Destructive", description: "Execute only after the server verifies identity, digest, version, expiry, and replay state." },
  { name: "reset_incident_simulation", kind: "Reset", description: "Reset durable scenario state while preserving append-only receipts." },
];

const webMcpResources = [
  { title: "OpenAI Site tools guide", description: "How ChatGPT discovers, reviews, and invokes WebMCP tools in the built-in browser.", href: "https://learn.chatgpt.com/docs/webmcp", label: "OpenAI documentation" },
  { title: "WebMCP specification", description: "The proposed web standard and current API surface maintained by the Web Machine Learning Community Group.", href: "https://webmachinelearning.github.io/webmcp/", label: "Specification" },
  { title: "WebMCP on GitHub", description: "Explainers, examples, issues, and the public standards discussion.", href: "https://github.com/webmachinelearning/webmcp", label: "Open source" },
  { title: "Chrome developer guide", description: "Chrome 149+ origin-trial and local experimental-flag instructions for WebMCP.", href: "https://developer.chrome.com/docs/ai/webmcp", label: "Browser implementation" },
  { title: "WebMCP app showcase", description: "Examples of websites designed for people and agents to use together.", href: "https://developers.openai.com/showcase?view=webmcp-apps", label: "Examples" },
  { title: "MCP-B runtime layering", description: "A practical separation of the standard page API, optional compatibility runtime, and transport bridges.", href: "https://docs.mcp-b.ai/explanation/architecture/runtime-layering", label: "Compatibility architecture" },
  { title: "MCP-B transports and bridges", description: "Security boundaries for iframe, extension, and local-relay paths that expose page tools to other clients.", href: "https://docs.mcp-b.ai/explanation/architecture/transports-and-bridges", label: "Bridge security" },
];

const actorIcon = { native: Bot, human: UserCheck, system: TerminalSquare, simulator: FlaskConical };
const formatTime = (value: string) => new Date(value).toLocaleTimeString("en-GB", { hour12: false });
const serialize = (value: unknown) => JSON.stringify(value, null, 2);

class ControlPlaneRequestError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly snapshot: ControlPlaneSnapshot | null,
  ) {
    super(message);
  }
}

function latestToolResult(snapshot: ControlPlaneSnapshot, tool: string) {
  return snapshot.receipts.find((receipt) => receipt.tool === tool)?.result ?? {};
}

export default function Home() {
  const [snapshot, setSnapshot] = useState<ControlPlaneSnapshot>(initialSnapshot);
  const [controlStatus, setControlStatus] = useState<ControlStatus>("connecting");
  const [controlError, setControlError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<MitigationId>("restore-pool");
  const [toolStatus, setToolStatus] = useState<ToolStatus>("detecting");
  const [copiedStep, setCopiedStep] = useState<number | null>(null);
  const [approvalClock, setApprovalClock] = useState(() => Date.now());

  const selected = useMemo(() => mitigations.find((item) => item.id === selectedId) ?? mitigations[0], [selectedId]);
  const staged = snapshot.control.staged;
  const approvalExpiresAt = Date.parse(snapshot.control.approval?.expiresAt ?? "");
  const approved = snapshot.control.humanApproved
    && snapshot.control.approval?.active === true
    && Number.isFinite(approvalExpiresAt)
    && approvalExpiresAt > approvalClock;
  const status = snapshot.incident.status;
  const receipts = snapshot.receipts;
  const audit = snapshot.audit;
  const stateRef = useRef(snapshot);
  const requestSequenceRef = useRef(0);
  const appliedSequenceRef = useRef(0);

  const applySnapshot = useCallback((next: ControlPlaneSnapshot, sequence: number) => {
    const current = stateRef.current;
    if (next.control.resourceVersion < current.control.resourceVersion) return false;
    if (next.control.resourceVersion === current.control.resourceVersion && sequence < appliedSequenceRef.current) return false;
    appliedSequenceRef.current = Math.max(appliedSequenceRef.current, sequence);
    stateRef.current = next;
    setSnapshot(next);
    return true;
  }, []);

  useEffect(() => {
    if (!snapshot.control.humanApproved || !Number.isFinite(approvalExpiresAt)) return;
    const refreshClock = () => setApprovalClock(Date.now());
    refreshClock();
    const timer = window.setTimeout(refreshClock, Math.max(0, approvalExpiresAt - Date.now()) + 25);
    window.addEventListener("focus", refreshClock);
    document.addEventListener("visibilitychange", refreshClock);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", refreshClock);
      document.removeEventListener("visibilitychange", refreshClock);
    };
  }, [approvalExpiresAt, snapshot.control.humanApproved]);

  const callControlPlane = useCallback(async (body: Record<string, unknown>) => {
    const sequence = ++requestSequenceRef.current;
    const response = await fetch("/api/control-plane", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json() as ControlPlaneSnapshot | { error: { code: string; message: string }; snapshot: ControlPlaneSnapshot | null };
    if (!response.ok && "error" in payload) {
      if (payload.snapshot) {
        applySnapshot(payload.snapshot, sequence);
      }
      setControlError(payload.error.message);
      throw new ControlPlaneRequestError(payload.error.code, payload.error.message, payload.snapshot);
    }
    const next = payload as ControlPlaneSnapshot;
    applySnapshot(next, sequence);
    setControlStatus("ready");
    setControlError(null);
    return next;
  }, [applySnapshot]);

  useEffect(() => {
    const controller = new AbortController();
    const sequence = ++requestSequenceRef.current;
    fetch("/api/control-plane", { credentials: "same-origin", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as ControlPlaneSnapshot | { error: { message: string } };
        if (!response.ok || "error" in payload) throw new Error("error" in payload ? payload.error.message : "The control plane is unavailable.");
        applySnapshot(payload, sequence);
        setControlStatus("ready");
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setControlStatus("failed");
        setControlError(error instanceof Error ? error.message : "The control plane is unavailable.");
      });
    return () => controller.abort();
  }, [applySnapshot]);

  const getSnapshot = useCallback(async (actorChannel: Actor = "native") => {
    const next = await callControlPlane({ operation: "snapshot", actorChannel });
    return {
      incident: next.incident,
      telemetry: next.telemetry,
      correlatedChange: next.correlatedChange,
      control: next.control,
      receiptChain: next.receiptChain,
    };
  }, [callControlPlane]);

  const compareMitigations = useCallback(async (mitigationId?: MitigationId, actorChannel: Actor = "native") => {
    if (mitigationId) setSelectedId(mitigationId);
    const next = await callControlPlane({ operation: "compare", mitigationId, actorChannel });
    return latestToolResult(next, "compare_mitigations");
  }, [callControlPlane]);

  const stageMitigation = useCallback(async (id: MitigationId, actorChannel: Actor = "human") => {
    setSelectedId(id);
    const next = await callControlPlane({ operation: "stage", mitigationId: id, actorChannel });
    return latestToolResult(next, "stage_mitigation");
  }, [callControlPlane]);

  const approveMitigation = useCallback(async () => {
    const control = stateRef.current.control;
    if (!control.actionDigest || control.resourceVersion < 1) return { approved: false, reason: "No mitigation is staged." };
    const next = await callControlPlane({ operation: "approve", actionDigest: control.actionDigest, resourceVersion: control.resourceVersion });
    return { approved: next.control.humanApproved, approval: next.control.approval };
  }, [callControlPlane]);

  const executeMitigation = useCallback(async (actorChannel: Actor = "human", source = stateRef.current) => {
    const control = source.control;
    if (!control.actionDigest || !control.idempotencyKey || control.resourceVersion < 1) {
      return { executed: false, reason: "No mitigation is staged.", code: "nothing_staged" };
    }
    const replay = control.replay;
    const resourceVersion = replay
      && replay.actionDigest === control.actionDigest
      && replay.idempotencyKey === control.idempotencyKey
      ? replay.resourceVersion
      : control.resourceVersion;
    try {
      const next = await callControlPlane({
        operation: "execute",
        actionDigest: control.actionDigest,
        resourceVersion,
        idempotencyKey: control.idempotencyKey,
        actorChannel,
      });
      return latestToolResult(next, "execute_approved_mitigation");
    } catch (error) {
      if (error instanceof ControlPlaneRequestError) return { executed: false, reason: error.message, code: error.code };
      throw error;
    }
  }, [callControlPlane]);

  const reset = useCallback(async (actorChannel: Actor = "human") => {
    const next = await callControlPlane({ operation: "reset", expectedResourceVersion: stateRef.current.control.resourceVersion, actorChannel });
    setSelectedId("restore-pool");
    return latestToolResult(next, "reset_incident_simulation");
  }, [callControlPlane]);

  useEffect(() => {
    const modelContext = document.modelContext;
    if (typeof modelContext?.registerTool !== "function") {
      queueMicrotask(() => setToolStatus("unavailable"));
      return;
    }
    const controller = new AbortController();
    const register = async () => Promise.all([
      modelContext.registerTool({
        name: "get_incident_snapshot",
        description: "Read the durable incident, telemetry, correlated deployment, action digest, resource version, and approval state. This has no business-state side effects.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true },
        execute: async () => getSnapshot("native"),
      }, { signal: controller.signal }),
      modelContext.registerTool({
        name: "compare_mitigations",
        description: "Compare the predicted reliability impact and tradeoffs of safe, predefined mitigations. Optionally focus the page on one option.",
        inputSchema: { type: "object", properties: { mitigationId: { type: "string", enum: mitigations.map((item) => item.id) } }, additionalProperties: false },
        annotations: { readOnlyHint: true },
        execute: async (input: unknown) => {
          const { mitigationId } = input as { mitigationId?: MitigationId };
          return compareMitigations(mitigationId, "native");
        },
      }, { signal: controller.signal }),
      modelContext.registerTool({
        name: "stage_mitigation",
        description: "Stage one predefined mitigation for visible human review. This never executes the change and always requires approval in the page.",
        inputSchema: { type: "object", properties: { mitigationId: { type: "string", enum: mitigations.map((item) => item.id) } }, required: ["mitigationId"], additionalProperties: false },
        execute: async (input: unknown) => {
          const { mitigationId } = input as { mitigationId: MitigationId };
          return stageMitigation(mitigationId, "native");
        },
      }, { signal: controller.signal }),
      modelContext.registerTool({
        name: "execute_approved_mitigation",
        description: "Ask the server control plane to execute the staged mitigation. It fails closed unless session identity, action digest, resource version, expiry, and idempotency key match an unused human approval.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { destructiveHint: true },
        execute: async () => executeMitigation("native"),
      }, { signal: controller.signal }),
      modelContext.registerTool({
        name: "reset_incident_simulation",
        description: "Reset this deterministic demo to the initial incident state.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        execute: async () => reset("native"),
      }, { signal: controller.signal }),
    ]);
    register().then(() => setToolStatus("active")).catch(() => setToolStatus("failed"));
    return () => controller.abort();
  }, [compareMitigations, executeMitigation, getSnapshot, reset, stageMitigation]);

  const runSimulation = useCallback(async (tool: string) => {
    if (tool === "get_incident_snapshot") await getSnapshot("simulator");
    if (tool === "compare_mitigations") await compareMitigations("restore-pool", "simulator");
    if (tool === "stage_mitigation") await stageMitigation("restore-pool", "simulator");
    if (tool === "execute_approved_mitigation") await executeMitigation("simulator");
    if (tool === "reset_incident_simulation") await reset("simulator");
  }, [compareMitigations, executeMitigation, getSnapshot, reset, stageMitigation]);

  const runProofSequence = useCallback(async () => {
    await getSnapshot("simulator");
    await compareMitigations("restore-pool", "simulator");
    await stageMitigation("restore-pool", "simulator");
    await executeMitigation("simulator", stateRef.current);
  }, [compareMitigations, executeMitigation, getSnapshot, stageMitigation]);

  const copyPrompt = async (step: number, prompt: string) => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopiedStep(step);
      window.setTimeout(() => setCopiedStep(null), 1600);
    } catch {
      setCopiedStep(null);
    }
  };

  const currentMetrics = {
    latency: snapshot.telemetry.p95Latency,
    errors: snapshot.telemetry.errorRate,
    saturation: snapshot.telemetry.saturation,
  };

  const statusCopy = {
    detecting: { title: "Checking WebMCP support", detail: "Feature detection is running.", tone: "detecting" },
    active: { title: "Native WebMCP active · 5 tools registered", detail: "Tools are ready in this page.", tone: "connected" },
    unavailable: { title: "Native WebMCP unavailable", detail: "Use the ChatGPT desktop Browser or Chrome 149+ with the testing flag.", tone: "unavailable" },
    failed: { title: "Tool registration failed", detail: "Use the simulator below and inspect the browser console for details.", tone: "failed" },
  }[toolStatus];

  const controlCopy = {
    connecting: { label: "Connecting durable control plane", tone: "detecting" },
    ready: { label: `Server control active · v${snapshot.control.resourceVersion}`, tone: "connected" },
    failed: { label: "Server control unavailable", tone: "failed" },
  }[controlStatus];

  return (
    <main className="control-room">
      <header className="topbar">
        <div className="brand"><div className="brand-mark"><GitPullRequestArrow size={18} /></div><div><strong>Runbook Relay</strong><span>Human-guided incident response</span></div></div>
        <div className="topbar-actions">
          <span className={`tool-status ${controlCopy.tone}`}><ServerCog size={14} /><span>{controlCopy.label}</span></span>
          <span className={`tool-status ${statusCopy.tone}`}><Sparkles size={14} /><span>{statusCopy.title}</span></span>
          <a href="https://github.com/Andreasniss/runbook-relay-webmcp" target="_blank" rel="noreferrer">Source <ChevronRight size={14} /></a>
        </div>
      </header>

      <section className="incident-strip" aria-label="Active incident summary">
        <div className="incident-title"><span className={`status-light ${status}`} /><div><span className="eyebrow">INC-2841 · SEV-2 · CHECKOUT-API</span><h1>{status === "mitigated" ? "Service recovered" : "Elevated latency and payment errors"}</h1></div></div>
        <div className="incident-meta"><span>Started 14:11 UTC</span><span className={`state-pill ${status}`}>{status.replaceAll("-", " ")}</span><button onClick={() => reset()} disabled={controlStatus !== "ready"} aria-label="Reset incident simulation"><RotateCcw size={14} /> Reset</button></div>
      </section>

      {controlError && <div className="control-error" role="status"><AlertTriangle size={15} /><span>{controlError}</span></div>}

      <section className="webmcp-intro" aria-labelledby="webmcp-intro-title">
        <div className="intro-copy">
          <span className="section-kicker">New to WebMCP?</span>
          <h2 id="webmcp-intro-title">A website can expose reliable tools alongside its human interface</h2>
          <p>WebMCP is an experimental open standard that lets a page describe structured actions an AI agent can discover and call. Instead of guessing where to click, the agent receives named tools with schemas and structured results, while consequential state and approval policy remain enforced by the server.</p>
          <div className="concept-flow" aria-label="How WebMCP works">
            <span><Laptop size={16} /> This live page</span><ChevronRight size={15} /><span><Wrench size={16} /> Five scoped tools</span><ChevronRight size={15} /><span><Bot size={16} /> Compatible agent</span><ChevronRight size={15} /><span><UserCheck size={16} /> Human approval</span>
          </div>
          <small>Unlike traditional MCP, these tools belong to the open browser page. Their handlers call the same server control plane as the human interface, so reloading the page does not erase approval or receipt state. No separate MCP server is required.</small>
          <div className="runtime-layers" aria-label="WebMCP runtime layers">
            <div><span>Implemented</span><strong>Standard page API</strong><small><code>document.modelContext</code> registers five tools that call a durable server boundary.</small></div>
            <div><span>Optional</span><strong>Compatibility runtime</strong><small>A polyfill can supply the page API where a browser does not yet provide it.</small></div>
            <div><span>Future evaluation</span><strong>Transport bridge</strong><small>An iframe, extension, or local relay can connect page tools to external MCP clients.</small></div>
          </div>
          <p className="layer-boundary">Runbook Relay ships only the standard page layer. It does not bundle MCP-B or claim that Claude Desktop, Cursor, or a relay path has been tested.</p>
        </div>

        <div className="setup-card">
          <div className="setup-heading"><Settings2 size={18} /><div><span className="section-kicker">Before you test</span><h3>Native WebMCP requires desktop</h3></div></div>
          <div className="mobile-limit"><Smartphone size={17} /><div><strong>On a phone or tablet?</strong><span>You can explore the interface and simulator, but mobile browsers cannot run this native Site tools demo.</span></div></div>
          <ol className="setup-steps">
            <li><span>1</span><div><strong>Use the latest ChatGPT desktop app</strong><small>Start a ChatGPT Work or Codex chat with GPT-5.6 Sol or Terra. Site tools are disabled on Luna.</small></div></li>
            <li><span>2</span><div><strong>Open the built-in Browser</strong><small>Use <code>@Browser</code> or open this site from the desktop app. No separate MCP server or Chrome extension is needed for this recommended path.</small></div></li>
            <li><span>3</span><div><strong>Enable Site tools</strong><small>In Settings → Browser → Permissions, turn on <em>Enable site tools</em>, then reload this page.</small></div></li>
            <li><span>4</span><div><strong>Verify the connection</strong><small>Look for <em>Native WebMCP active · 5 tools registered</em> here and <em>Site tools</em> in the browser address bar.</small></div></li>
          </ol>
          <details className="chrome-path">
            <summary>Alternative: test in desktop Chrome <ChevronDown size={14} /></summary>
            <p>Use Chrome 149 or newer, open <code>chrome://flags/#enable-webmcp-testing</code>, enable the flag, and relaunch Chrome. To let ChatGPT use your regular Chrome profile, install the ChatGPT browser extension from Settings → Computer Use and select <code>@Chrome</code>. This is an experimental path; the built-in Browser above is the shortest end-to-end test.</p>
          </details>
          <a className="setup-link" href="https://learn.chatgpt.com/docs/webmcp" target="_blank" rel="noreferrer">Open official setup guide <ExternalLink size={13} /></a>
        </div>
      </section>

      <section className="test-lab" aria-labelledby="test-lab-title">
        <div className="lab-heading">
          <div><span className="section-kicker">Guided WebMCP test</span><h2 id="test-lab-title">Prove the agent can act, but cannot self-approve</h2></div>
          <div className={`environment-card ${statusCopy.tone}`}><span className="environment-dot" /><div><strong>{statusCopy.title}</strong><small>{statusCopy.detail}</small></div></div>
        </div>
        <div className="proof-strip" aria-label="Demo evidence summary">
          <div><strong>D1</strong><span>durable server state</span></div>
          <div><strong>5 min</strong><span>approval expiry</span></div>
          <div><strong>SHA-256</strong><span>action and receipt binding</span></div>
          <div><strong>0</strong><span>external systems changed</span></div>
        </div>
        <div className="lab-grid">
          <div className="demo-steps">
            {demoSteps.map((step) => (
              <article className={`demo-step ${step.human ? "human-step" : ""}`} key={step.number}>
                <span className="step-number">{step.human ? <UserCheck size={14} /> : step.number}</span>
                <div className="step-copy"><div><strong>{step.label}</strong><small>{step.human ? "Human interaction" : "Prompt the browser agent"}</small></div><p>{step.prompt}</p><span><CheckCircle2 size={12} /> {step.expected}</span></div>
                {!step.human && <button className="copy-button" onClick={() => copyPrompt(step.number, step.prompt)} aria-label={`Copy step ${step.number} prompt`}>{copiedStep === step.number ? <Check size={14} /> : <Copy size={14} />}</button>}
              </article>
            ))}
          </div>

          <aside className="simulator-panel" aria-label="WebMCP tool simulator">
            <div className="simulator-heading"><div className="simulator-icon"><FlaskConical size={18} /></div><div><span className="section-kicker">Works in every browser</span><h3>Agent simulator</h3></div></div>
            <p>Exercise the same server-side policy and persistence path when native WebMCP is unavailable.</p>
            <div className="simulation-warning"><AlertTriangle size={14} /><span>Simulated calls do not prove native browser tool discovery.</span></div>
            <div className="simulator-actions">
              <button className="sequence-action" disabled={controlStatus !== "ready"} onClick={runProofSequence}><Sparkles size={13} /> Run the blocked-action proof</button>
              <button disabled={controlStatus !== "ready"} onClick={() => runSimulation("get_incident_snapshot")}><Play size={13} /> Read snapshot</button>
              <button disabled={controlStatus !== "ready"} onClick={() => runSimulation("compare_mitigations")}><Play size={13} /> Compare low-risk option</button>
              <button disabled={controlStatus !== "ready"} onClick={() => runSimulation("stage_mitigation")}><Play size={13} /> Stage low-risk option</button>
              <button disabled={controlStatus !== "ready"} className="danger-action" onClick={() => runSimulation("execute_approved_mitigation")}><ShieldCheck size={13} /> Try execution</button>
              <button disabled={controlStatus !== "ready"} onClick={() => runSimulation("reset_incident_simulation")}><RotateCcw size={13} /> Reset scenario</button>
            </div>
            <small>Fast path: run the proof, inspect the durable blocked receipt, approve in the page, then execute the change.</small>
          </aside>
        </div>
      </section>

      <section className="workspace">
        <div className="main-column">
          <section className="metric-grid" aria-label="Live service metrics">
            <Metric label="p95 latency" value={currentMetrics.latency} baseline="Target < 1.5 s" tone={status === "mitigated" ? "good" : "bad"} icon={Gauge} />
            <Metric label="Error rate" value={currentMetrics.errors} baseline="Target < 1.0%" tone={status === "mitigated" ? "good" : "bad"} icon={AlertTriangle} />
            <Metric label="DB saturation" value={currentMetrics.saturation} baseline="Target < 75%" tone={status === "mitigated" ? "good" : "warn"} icon={Activity} />
          </section>

          <section className="panel evidence-panel">
            <div className="panel-heading"><div><span className="section-kicker">Evidence</span><h2>What changed?</h2></div><span className="confidence">93% correlation</span></div>
            <div className="change-card"><div className="change-icon"><ServerCog size={20} /></div><div className="change-copy"><div className="change-title"><strong>db-pool-842</strong><span>deployed 14:08</span></div><p>Connection pool limit reduced three minutes before the incident began.</p><div className="diff"><span>max_connections</span><del>120</del><ChevronRight size={14} /><ins>40</ins></div></div><div className="signal-bars" aria-label="Correlation signal strength"><i /><i /><i /><i /><i /></div></div>
          </section>

          <section className="panel">
            <div className="panel-heading"><div><span className="section-kicker">Decision support</span><h2>Compare mitigations</h2></div><span className="simulated"><CircleDot size={13} /> deterministic simulation</span></div>
            <div className="mitigation-layout">
              <div className="mitigation-list" role="list">{mitigations.map((item) => <button key={item.id} className={`mitigation-option ${selectedId === item.id ? "selected" : ""}`} onClick={() => compareMitigations(item.id, "human")} disabled={controlStatus !== "ready"} aria-pressed={selectedId === item.id}><span className="radio-dot" /><span><strong>{item.title}</strong><small>{item.summary}</small></span><span className={`risk ${item.risk.toLowerCase()}`}>{item.risk}</span></button>)}</div>
              <div className="projection-card"><span className="section-kicker">Projected result</span><h3>{selected.title}</h3><div className="projection-metrics"><div><span>p95 latency</span><strong>{selected.latency}</strong><small>from 4.8 s</small></div><div><span>Error rate</span><strong>{selected.errorRate}</strong><small>from 8.7%</small></div></div><p><AlertTriangle size={15} /> {selected.tradeoff}</p><button className="primary-action" disabled={controlStatus !== "ready"} onClick={() => stageMitigation(selected.id)}>Stage for approval <ChevronRight size={16} /></button></div>
            </div>
          </section>
        </div>

        <aside className="side-column">
          <section className="panel control-panel">
            <div className="panel-heading compact"><div><span className="section-kicker">Policy boundary</span><h2>Execution control</h2></div><ShieldCheck size={19} /></div>
            {!staged ? <div className="empty-control"><div className="lock-orbit"><Bot size={21} /><span><UserCheck size={17} /></span></div><strong>No change staged</strong><p>The agent can investigate and simulate. The server requires a matching human approval before execution.</p></div> : <div className="approval-flow">
              <div className="approval-step done"><span><Check size={13} /></span><div><strong>Mitigation staged</strong><small>{staged.title}</small></div></div>
              <div className={`approval-step ${approved ? "done" : "active"}`}><span>{approved ? <Check size={13} /> : "2"}</span><div><strong>Human approval</strong><small>{approved ? `Bound to ${snapshot.session.identity}` : "Required before execution"}</small></div></div>
              <div className={`approval-step ${status === "mitigated" ? "done" : ""}`}><span>{status === "mitigated" ? <Check size={13} /> : "3"}</span><div><strong>Execute and verify</strong><small>{status === "mitigated" ? "Service recovered" : "Fail-closed until approved"}</small></div></div>
              <dl className="control-metadata"><div><dt>Resource</dt><dd>v{snapshot.control.resourceVersion}</dd></div><div><dt>Action digest</dt><dd><code>{snapshot.control.actionDigest?.slice(0, 12)}…</code></dd></div><div><dt>Receipt chain</dt><dd>{snapshot.receiptChain.verified ? (snapshot.receiptChain.truncated ? `latest ${snapshot.receiptChain.returned} verified` : `${snapshot.receiptChain.count} verified`) : "verification failed"}</dd></div></dl>
              {!approved && <button className="approve-button" disabled={controlStatus !== "ready"} onClick={approveMitigation}><UserCheck size={16} /> Approve staged change</button>}
              {approved && status !== "mitigated" && <AlertDialog><AlertDialogTrigger asChild><button className="execute-button">Execute approved change</button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Execute this mitigation?</AlertDialogTitle><AlertDialogDescription>{staged.title} is approved for this simulation. The action will update the service state and record an audit event.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => executeMitigation()}>Execute</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
              {status === "mitigated" && <div className="recovered"><Check size={16} /> SLO back within target</div>}
            </div>}
          </section>

          <section className="panel receipt-panel">
            <div className="panel-heading compact"><div><span className="section-kicker">Observable proof</span><h2>Tool receipts</h2></div><span className="event-count">{receipts.length}</span></div>
            {receipts.length === 0 ? <div className="empty-receipts"><ListTree size={20} /><strong>No tool calls yet</strong><p>Run a native prompt or use the simulator. Every input, policy outcome, result, resource version, and receipt hash appears here.</p></div> : <div className="receipt-list">{receipts.map((receipt) => <details className={`receipt ${receipt.outcome}`} key={receipt.id} open={receipt.id === receipts[0]?.id}><summary><span className={`receipt-state ${receipt.outcome}`} /><div><strong>{receipt.tool}</strong><small>{receipt.actor} · {formatTime(receipt.createdAt)} · v{receipt.resourceVersion}</small></div><span>{receipt.outcome}</span><ChevronDown size={13} /></summary><div className="receipt-body"><label>Identity</label><code>{receipt.actorIdentity}</code><label>Receipt hash</label><code>{receipt.receiptHash}</code><label>Input</label><pre>{serialize(receipt.input)}</pre><label>Result</label><pre>{serialize(receipt.result)}</pre></div></details>)}</div>}
          </section>

          <section className="panel audit-panel"><div className="panel-heading compact"><div><span className="section-kicker">Durable shared state</span><h2>Decision log</h2></div><span className="event-count">{audit.length}</span></div><div className="audit-list">{audit.map((event) => { const Icon = actorIcon[event.actor]; return <div className="audit-event" key={event.id}><span className={`actor ${event.actor}`}><Icon size={13} /></span><div><div><strong>{event.action}</strong><time>{formatTime(event.time)}</time></div><p>{event.detail}</p></div></div>; })}</div></section>
        </aside>
      </section>

      <section className="tool-reference" aria-labelledby="tool-reference-title">
        <details>
          <summary><div><Wrench size={17} /><span><strong id="tool-reference-title">Inspect the five-tool contract</strong><small>Names, safety classification, and behavior</small></span></div><ChevronDown size={16} /></summary>
          <div className="tool-grid">{toolCatalog.map((tool) => <article key={tool.name}><div><code>{tool.name}</code><span className={tool.kind.toLowerCase().replace(" ", "-")}>{tool.kind}</span></div><p>{tool.description}</p></article>)}</div>
        </details>
      </section>

      <section className="resource-section" aria-labelledby="resource-title">
        <div className="resource-heading"><div><span className="section-kicker">Learn and build</span><h2 id="resource-title">WebMCP resources</h2></div><BookOpen size={20} /></div>
        <div className="resource-grid">
          {webMcpResources.map((resource) => <a href={resource.href} target="_blank" rel="noreferrer" key={resource.href}><span>{resource.label}</span><div><strong>{resource.title}</strong><ExternalLink size={13} /></div><p>{resource.description}</p></a>)}
        </div>
      </section>

      <footer>
        <span><ShieldCheck size={14} /> Agent actions are scoped, identity-bound, versioned, and auditable.</span>
        <span className="site-attribution">
          Built by <a href="https://github.com/Andreasniss" target="_blank" rel="noreferrer">Andreas Nissen</a>
          <span aria-hidden="true">·</span>
          <a href="https://andreasnissen.dev" target="_blank" rel="noreferrer">andreasnissen.dev</a>
          <span aria-hidden="true">·</span>
          <a href="https://www.linkedin.com/in/andreasnissen" target="_blank" rel="noreferrer">Connect on LinkedIn</a>
          <span aria-hidden="true">·</span>
          <a href="https://github.com/Andreasniss/runbook-relay-webmcp" target="_blank" rel="noreferrer">Source on GitHub</a>
        </span>
        <span className="site-disclaimer">Synthetic action and anonymous session identity. This is not production authentication or infrastructure control. Personal demo project. Views and opinions are my own. Not affiliated with or endorsed by my employer.</span>
      </footer>
    </main>
  );
}

function Metric({ label, value, baseline, tone, icon: Icon }: { label: string; value: string; baseline: string; tone: "good" | "warn" | "bad"; icon: typeof Activity }) {
  return <article className={`metric-card ${tone}`}><div><span>{label}</span><Icon size={17} /></div><strong>{value}</strong><small>{baseline}</small><div className="sparkline" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></div></article>;
}
