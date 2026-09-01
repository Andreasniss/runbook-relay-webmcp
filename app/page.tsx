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

type MitigationId = "restore-pool" | "shift-traffic" | "scale-workers";
type IncidentStatus = "investigating" | "awaiting-approval" | "mitigated";
type ToolStatus = "detecting" | "active" | "unavailable" | "failed";
type Actor = "agent" | "human" | "system" | "simulator";
type AuditEvent = { id: number; actor: Actor; action: string; detail: string; time: string };
type ToolReceipt = {
  id: number;
  tool: string;
  actor: "native" | "simulator";
  input: unknown;
  result: unknown;
  outcome: "success" | "blocked" | "error";
  time: string;
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

const mitigations: Mitigation[] = [
  { id: "restore-pool", title: "Restore database pool limit", summary: "Revert the pool from 40 to the last known-good value of 120.", risk: "Low", latency: "1.2 s", errorRate: "0.6%", tradeoff: "Returns database concurrency to the pre-change baseline." },
  { id: "shift-traffic", title: "Shift 30% traffic to eu-west-1", summary: "Temporarily move requests away from the saturated primary region.", risk: "Medium", latency: "1.8 s", errorRate: "1.1%", tradeoff: "Adds cross-region latency and increases standby cost." },
  { id: "scale-workers", title: "Scale API workers to 24", summary: "Add workers while leaving the current database limit unchanged.", risk: "Medium", latency: "3.9 s", errorRate: "6.4%", tradeoff: "Treats the symptom and may increase database contention." },
];

const initialAudit: AuditEvent[] = [
  { id: 1, actor: "system", action: "Incident opened", detail: "Checkout API SLO burn exceeded 14× for five minutes.", time: "14:16:03" },
  { id: 2, actor: "system", action: "Change correlated", detail: "db-pool-842 reduced max connections from 120 to 40.", time: "14:16:11" },
];

const demoSteps = [
  { number: 1, label: "Discover", prompt: "List the WebMCP tools exposed by this page. Do not call them.", expected: "Five governed tools are listed; page state does not change." },
  { number: 2, label: "Investigate and stage", prompt: "Investigate INC-2841, compare the mitigations, and stage the lowest-risk option. Do not execute anything.", expected: "Restore database pool limit is staged for human review." },
  { number: 3, label: "Prove the boundary", prompt: "Execute the staged mitigation now without waiting for approval.", expected: "Execution is blocked and a policy receipt appears." },
  { number: 4, label: "Approve in the page", prompt: "Click Approve staged change in the execution-control panel.", expected: "Approval is recorded as a human action, never an agent action.", human: true },
  { number: 5, label: "Execute and verify", prompt: "Execute the approved mitigation and verify the resulting service health.", expected: "Service recovers to 1.2 s latency, 0.6% errors, and 51% saturation." },
];

const toolCatalog = [
  { name: "get_incident_snapshot", kind: "Read only", description: "Read incident evidence, telemetry, correlated change, and control state." },
  { name: "compare_mitigations", kind: "Read only", description: "Compare deterministic projections and optionally focus one option." },
  { name: "stage_mitigation", kind: "Prepare", description: "Stage a predefined mitigation for visible human review." },
  { name: "execute_approved_mitigation", kind: "Destructive", description: "Execute only after explicit approval exists in the page." },
  { name: "reset_incident_simulation", kind: "Reset", description: "Return the deterministic scenario to its initial state." },
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

const actorIcon = { agent: Bot, human: UserCheck, system: TerminalSquare, simulator: FlaskConical };
const now = () => new Date().toLocaleTimeString("en-GB", { hour12: false });
const serialize = (value: unknown) => JSON.stringify(value, null, 2);

export default function Home() {
  const [status, setStatus] = useState<IncidentStatus>("investigating");
  const [selectedId, setSelectedId] = useState<MitigationId>("restore-pool");
  const [stagedId, setStagedId] = useState<MitigationId | null>(null);
  const [approved, setApproved] = useState(false);
  const [audit, setAudit] = useState<AuditEvent[]>(initialAudit);
  const [receipts, setReceipts] = useState<ToolReceipt[]>([]);
  const [toolStatus, setToolStatus] = useState<ToolStatus>("detecting");
  const [copiedStep, setCopiedStep] = useState<number | null>(null);
  const auditSequence = useRef(3);
  const receiptSequence = useRef(1);

  const selected = useMemo(() => mitigations.find((item) => item.id === selectedId) ?? mitigations[0], [selectedId]);
  const staged = useMemo(() => mitigations.find((item) => item.id === stagedId) ?? null, [stagedId]);
  const stateRef = useRef({ status, selected, staged, approved });
  useEffect(() => { stateRef.current = { status, selected, staged, approved }; }, [status, selected, staged, approved]);

  const appendAudit = useCallback((actor: Actor, action: string, detail: string) => {
    setAudit((events) => [...events, { id: auditSequence.current++, actor, action, detail, time: now() }]);
  }, []);

  const recordReceipt = useCallback((tool: string, actor: ToolReceipt["actor"], input: unknown, result: unknown, outcome: ToolReceipt["outcome"] = "success") => {
    setReceipts((events) => [{ id: receiptSequence.current++, tool, actor, input, result, outcome, time: now() }, ...events].slice(0, 8));
  }, []);

  const getSnapshot = useCallback(() => ({
    incident: { id: "INC-2841", service: "checkout-api", severity: "SEV-2", status: stateRef.current.status },
    telemetry: stateRef.current.status === "mitigated"
      ? { p95Latency: stateRef.current.staged?.latency, errorRate: stateRef.current.staged?.errorRate, saturation: "51%" }
      : { p95Latency: "4.8 s", errorRate: "8.7%", saturation: "94%" },
    correlatedChange: { id: "db-pool-842", confidence: 0.93, change: "max connections 120 → 40" },
    control: { staged: stateRef.current.staged?.id ?? null, humanApproved: stateRef.current.approved },
  }), []);

  const selectMitigation = useCallback((id: MitigationId, actor: Actor = "human") => {
    setSelectedId(id);
    const option = mitigations.find((item) => item.id === id)!;
    appendAudit(actor, "Simulation compared", `${option.title}: predicted ${option.errorRate} errors.`);
    return option;
  }, [appendAudit]);

  const compareMitigations = useCallback((mitigationId?: MitigationId, actor: Actor = "agent") => {
    if (mitigationId) selectMitigation(mitigationId, actor);
    return { current: { p95Latency: "4.8 s", errorRate: "8.7%" }, options: mitigations };
  }, [selectMitigation]);

  const stageMitigation = useCallback((id: MitigationId, actor: Actor = "human") => {
    const option = mitigations.find((item) => item.id === id)!;
    setSelectedId(id);
    setStagedId(id);
    setApproved(false);
    setStatus("awaiting-approval");
    appendAudit(actor, "Mitigation staged", `${option.title}. Execution remains locked pending human approval.`);
    return { staged: option, requiresHumanApproval: true, executed: false };
  }, [appendAudit]);

  const approveMitigation = useCallback(() => {
    if (!staged) return;
    setApproved(true);
    appendAudit("human", "Execution approved", `${staged.title} approved for this browser session.`);
  }, [appendAudit, staged]);

  const executeMitigation = useCallback((actor: Actor = "human") => {
    if (!staged) {
      appendAudit("system", "Execution blocked", "No mitigation is staged.");
      return { executed: false, reason: "No mitigation is staged." };
    }
    if (!approved) {
      appendAudit("system", "Execution blocked", "Policy requires explicit human approval in the page.");
      return { executed: false, reason: "Human approval is required in the page before execution." };
    }
    setStatus("mitigated");
    appendAudit(actor, "Mitigation executed", `${staged.title}. Error rate recovered to ${staged.errorRate}.`);
    return { executed: true, mitigation: staged.title, observed: { p95Latency: staged.latency, errorRate: staged.errorRate, saturation: "51%" } };
  }, [approved, appendAudit, staged]);

  const reset = useCallback((actor: Actor = "human") => {
    setStatus("investigating");
    setSelectedId("restore-pool");
    setStagedId(null);
    setApproved(false);
    setAudit(initialAudit);
    setReceipts([]);
    auditSequence.current = 3;
    receiptSequence.current = 1;
    if (actor !== "human") setTimeout(() => appendAudit(actor, "Simulation reset", "Incident state returned to the initial snapshot."), 0);
    return { reset: true };
  }, [appendAudit]);

  const nativeCall = useCallback(async (tool: string, input: unknown, operation: () => unknown | Promise<unknown>) => {
    try {
      const result = await operation();
      const blocked = typeof result === "object" && result !== null && "executed" in result && (result as { executed?: boolean }).executed === false;
      recordReceipt(tool, "native", input, result, blocked ? "blocked" : "success");
      return result;
    } catch (error) {
      const result = { error: error instanceof Error ? error.message : "Unknown tool error" };
      recordReceipt(tool, "native", input, result, "error");
      throw error;
    }
  }, [recordReceipt]);

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
        description: "Read the active incident, current telemetry, correlated deployment, and approval state. This has no side effects.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true },
        execute: async () => nativeCall("get_incident_snapshot", {}, getSnapshot),
      }, { signal: controller.signal }),
      modelContext.registerTool({
        name: "compare_mitigations",
        description: "Compare the predicted reliability impact and tradeoffs of safe, predefined mitigations. Optionally focus the page on one option.",
        inputSchema: { type: "object", properties: { mitigationId: { type: "string", enum: mitigations.map((item) => item.id) } }, additionalProperties: false },
        annotations: { readOnlyHint: true },
        execute: async (input: unknown) => {
          const { mitigationId } = input as { mitigationId?: MitigationId };
          return nativeCall("compare_mitigations", input, () => compareMitigations(mitigationId, "agent"));
        },
      }, { signal: controller.signal }),
      modelContext.registerTool({
        name: "stage_mitigation",
        description: "Stage one predefined mitigation for visible human review. This never executes the change and always requires approval in the page.",
        inputSchema: { type: "object", properties: { mitigationId: { type: "string", enum: mitigations.map((item) => item.id) } }, required: ["mitigationId"], additionalProperties: false },
        execute: async (input: unknown) => {
          const { mitigationId } = input as { mitigationId: MitigationId };
          return nativeCall("stage_mitigation", input, () => stageMitigation(mitigationId, "agent"));
        },
      }, { signal: controller.signal }),
      modelContext.registerTool({
        name: "execute_approved_mitigation",
        description: "Execute the staged mitigation only after the human has explicitly approved it in the page. The page fails closed when approval is absent.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { destructiveHint: true },
        execute: async () => nativeCall("execute_approved_mitigation", {}, () => executeMitigation("agent")),
      }, { signal: controller.signal }),
      modelContext.registerTool({
        name: "reset_incident_simulation",
        description: "Reset this deterministic demo to the initial incident state.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        execute: async () => nativeCall("reset_incident_simulation", {}, () => reset("agent")),
      }, { signal: controller.signal }),
    ]);
    register().then(() => setToolStatus("active")).catch(() => setToolStatus("failed"));
    return () => controller.abort();
  }, [compareMitigations, executeMitigation, getSnapshot, nativeCall, reset, stageMitigation]);

  const runSimulation = useCallback((tool: string) => {
    let input: unknown = {};
    let result: unknown;
    if (tool === "get_incident_snapshot") result = getSnapshot();
    if (tool === "compare_mitigations") {
      input = { mitigationId: "restore-pool" };
      result = compareMitigations("restore-pool", "simulator");
    }
    if (tool === "stage_mitigation") {
      input = { mitigationId: "restore-pool" };
      result = stageMitigation("restore-pool", "simulator");
    }
    if (tool === "execute_approved_mitigation") result = executeMitigation("simulator");
    if (tool === "reset_incident_simulation") result = reset("simulator");
    const blocked = typeof result === "object" && result !== null && "executed" in result && (result as { executed?: boolean }).executed === false;
    recordReceipt(tool, "simulator", input, result, blocked ? "blocked" : "success");
  }, [compareMitigations, executeMitigation, getSnapshot, recordReceipt, reset, stageMitigation]);

  const runProofSequence = useCallback(() => {
    const option = mitigations[0];
    setSelectedId(option.id);
    setStagedId(option.id);
    setApproved(false);
    setStatus("awaiting-approval");
    appendAudit("simulator", "Evidence inspected", "Read incident snapshot and compared three deterministic mitigations.");
    appendAudit("simulator", "Mitigation staged", `${option.title}. Execution remains locked pending human approval.`);
    appendAudit("system", "Execution blocked", "Policy requires explicit human approval in the page.");
    recordReceipt("get_incident_snapshot", "simulator", {}, getSnapshot());
    recordReceipt("compare_mitigations", "simulator", { mitigationId: option.id }, { current: { p95Latency: "4.8 s", errorRate: "8.7%" }, options: mitigations });
    recordReceipt("stage_mitigation", "simulator", { mitigationId: option.id }, { staged: option, requiresHumanApproval: true, executed: false });
    recordReceipt("execute_approved_mitigation", "simulator", {}, { executed: false, reason: "Human approval is required in the page before execution." }, "blocked");
  }, [appendAudit, getSnapshot, recordReceipt]);

  const copyPrompt = async (step: number, prompt: string) => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopiedStep(step);
      window.setTimeout(() => setCopiedStep(null), 1600);
    } catch {
      setCopiedStep(null);
    }
  };

  const currentMetrics = status === "mitigated" && staged
    ? { latency: staged.latency, errors: staged.errorRate, saturation: "51%" }
    : { latency: "4.8 s", errors: "8.7%", saturation: "94%" };

  const statusCopy = {
    detecting: { title: "Checking WebMCP support", detail: "Feature detection is running.", tone: "detecting" },
    active: { title: "Native WebMCP active · 5 tools registered", detail: "Tools are ready in this page.", tone: "connected" },
    unavailable: { title: "Native WebMCP unavailable", detail: "Use the ChatGPT desktop Browser or Chrome 149+ with the testing flag.", tone: "unavailable" },
    failed: { title: "Tool registration failed", detail: "Use the simulator below and inspect the browser console for details.", tone: "failed" },
  }[toolStatus];

  return (
    <main className="control-room">
      <header className="topbar">
        <div className="brand"><div className="brand-mark"><GitPullRequestArrow size={18} /></div><div><strong>Runbook Relay</strong><span>Human-guided incident response</span></div></div>
        <div className="topbar-actions">
          <span className={`tool-status ${statusCopy.tone}`}><Sparkles size={14} /><span>{statusCopy.title}</span></span>
          <a href="https://github.com/Andreasniss/runbook-relay-webmcp" target="_blank" rel="noreferrer">Source <ChevronRight size={14} /></a>
        </div>
      </header>

      <section className="incident-strip" aria-label="Active incident summary">
        <div className="incident-title"><span className={`status-light ${status}`} /><div><span className="eyebrow">INC-2841 · SEV-2 · CHECKOUT-API</span><h1>{status === "mitigated" ? "Service recovered" : "Elevated latency and payment errors"}</h1></div></div>
        <div className="incident-meta"><span>Started 14:11 UTC</span><span className={`state-pill ${status}`}>{status.replace("-", " ")}</span><button onClick={() => reset()} aria-label="Reset incident simulation"><RotateCcw size={14} /> Reset</button></div>
      </section>

      <section className="webmcp-intro" aria-labelledby="webmcp-intro-title">
        <div className="intro-copy">
          <span className="section-kicker">New to WebMCP?</span>
          <h2 id="webmcp-intro-title">A website can expose reliable tools alongside its human interface</h2>
          <p>WebMCP is an experimental open standard that lets a page describe structured actions an AI agent can discover and call. Instead of guessing where to click, the agent receives named tools with schemas, results, and safety boundaries while you and the agent remain on the same live page.</p>
          <div className="concept-flow" aria-label="How WebMCP works">
            <span><Laptop size={16} /> This live page</span><ChevronRight size={15} /><span><Wrench size={16} /> Five scoped tools</span><ChevronRight size={15} /><span><Bot size={16} /> Compatible agent</span><ChevronRight size={15} /><span><UserCheck size={16} /> Human approval</span>
          </div>
          <small>Unlike traditional MCP, these tools belong to the open browser page and share its current state and session. No separate MCP server is required for this demo.</small>
          <div className="runtime-layers" aria-label="WebMCP runtime layers">
            <div><span>Implemented</span><strong>Standard page API</strong><small><code>document.modelContext</code> registers and removes five tools inside this page.</small></div>
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
          <div><strong>5</strong><span>scoped tools</span></div>
          <div><strong>1</strong><span>human approval gate</span></div>
          <div><strong>0</strong><span>external systems changed</span></div>
          <div><strong>100%</strong><span>deterministic and resettable</span></div>
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
            <p>Exercise the same application handlers when native WebMCP is unavailable.</p>
            <div className="simulation-warning"><AlertTriangle size={14} /><span>Simulated calls do not prove native browser tool discovery.</span></div>
            <div className="simulator-actions">
              <button className="sequence-action" onClick={runProofSequence}><Sparkles size={13} /> Run the blocked-action proof</button>
              <button onClick={() => runSimulation("get_incident_snapshot")}><Play size={13} /> Read snapshot</button>
              <button onClick={() => runSimulation("compare_mitigations")}><Play size={13} /> Compare low-risk option</button>
              <button onClick={() => runSimulation("stage_mitigation")}><Play size={13} /> Stage low-risk option</button>
              <button className="danger-action" onClick={() => runSimulation("execute_approved_mitigation")}><ShieldCheck size={13} /> Try execution</button>
              <button onClick={() => runSimulation("reset_incident_simulation")}><RotateCcw size={13} /> Reset scenario</button>
            </div>
            <small>Fast path: run the proof, inspect the blocked receipt, approve in the page, then execute the change.</small>
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
              <div className="mitigation-list" role="list">{mitigations.map((item) => <button key={item.id} className={`mitigation-option ${selectedId === item.id ? "selected" : ""}`} onClick={() => selectMitigation(item.id)} aria-pressed={selectedId === item.id}><span className="radio-dot" /><span><strong>{item.title}</strong><small>{item.summary}</small></span><span className={`risk ${item.risk.toLowerCase()}`}>{item.risk}</span></button>)}</div>
              <div className="projection-card"><span className="section-kicker">Projected result</span><h3>{selected.title}</h3><div className="projection-metrics"><div><span>p95 latency</span><strong>{selected.latency}</strong><small>from 4.8 s</small></div><div><span>Error rate</span><strong>{selected.errorRate}</strong><small>from 8.7%</small></div></div><p><AlertTriangle size={15} /> {selected.tradeoff}</p><button className="primary-action" onClick={() => stageMitigation(selected.id)}>Stage for approval <ChevronRight size={16} /></button></div>
            </div>
          </section>
        </div>

        <aside className="side-column">
          <section className="panel control-panel">
            <div className="panel-heading compact"><div><span className="section-kicker">Policy boundary</span><h2>Execution control</h2></div><ShieldCheck size={19} /></div>
            {!staged ? <div className="empty-control"><div className="lock-orbit"><Bot size={21} /><span><UserCheck size={17} /></span></div><strong>No change staged</strong><p>The agent can investigate and simulate. A human must approve execution.</p></div> : <div className="approval-flow">
              <div className="approval-step done"><span><Check size={13} /></span><div><strong>Mitigation staged</strong><small>{staged.title}</small></div></div>
              <div className={`approval-step ${approved ? "done" : "active"}`}><span>{approved ? <Check size={13} /> : "2"}</span><div><strong>Human approval</strong><small>{approved ? "Approved for this session" : "Required before execution"}</small></div></div>
              <div className={`approval-step ${status === "mitigated" ? "done" : ""}`}><span>{status === "mitigated" ? <Check size={13} /> : "3"}</span><div><strong>Execute and verify</strong><small>{status === "mitigated" ? "Service recovered" : "Fail-closed until approved"}</small></div></div>
              {!approved && <button className="approve-button" onClick={approveMitigation}><UserCheck size={16} /> Approve staged change</button>}
              {approved && status !== "mitigated" && <AlertDialog><AlertDialogTrigger asChild><button className="execute-button">Execute approved change</button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Execute this mitigation?</AlertDialogTitle><AlertDialogDescription>{staged.title} is approved for this simulation. The action will update the service state and record an audit event.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => executeMitigation()}>Execute</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
              {status === "mitigated" && <div className="recovered"><Check size={16} /> SLO back within target</div>}
            </div>}
          </section>

          <section className="panel receipt-panel">
            <div className="panel-heading compact"><div><span className="section-kicker">Observable proof</span><h2>Tool receipts</h2></div><span className="event-count">{receipts.length}</span></div>
            {receipts.length === 0 ? <div className="empty-receipts"><ListTree size={20} /><strong>No tool calls yet</strong><p>Run a native prompt or use the simulator. Every input, decision, result, and postcondition appears here.</p></div> : <div className="receipt-list">{receipts.map((receipt) => <details className={`receipt ${receipt.outcome}`} key={receipt.id} open={receipt.id === receipts[0]?.id}><summary><span className={`receipt-state ${receipt.outcome}`} /><div><strong>{receipt.tool}</strong><small>{receipt.actor} · {receipt.time}</small></div><span>{receipt.outcome}</span><ChevronDown size={13} /></summary><div className="receipt-body"><label>Input</label><pre>{serialize(receipt.input)}</pre><label>Result</label><pre>{serialize(receipt.result)}</pre></div></details>)}</div>}
          </section>

          <section className="panel audit-panel"><div className="panel-heading compact"><div><span className="section-kicker">Shared state</span><h2>Decision log</h2></div><span className="event-count">{audit.length}</span></div><div className="audit-list">{audit.map((event) => { const Icon = actorIcon[event.actor]; return <div className="audit-event" key={event.id}><span className={`actor ${event.actor}`}><Icon size={13} /></span><div><div><strong>{event.action}</strong><time>{event.time}</time></div><p>{event.detail}</p></div></div>; })}</div></section>
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
        <span><ShieldCheck size={14} /> Agent actions are scoped, visible, and auditable.</span>
        <span className="site-attribution">
          Built by <a href="https://github.com/Andreasniss" target="_blank" rel="noreferrer">Andreas Nissen</a>
          <span aria-hidden="true">·</span>
          <a href="https://andreasnissen.dev" target="_blank" rel="noreferrer">andreasnissen.dev</a>
          <span aria-hidden="true">·</span>
          <a href="https://www.linkedin.com/in/andreasnissen" target="_blank" rel="noreferrer">Connect on LinkedIn</a>
          <span aria-hidden="true">·</span>
          <a href="https://github.com/Andreasniss/runbook-relay-webmcp" target="_blank" rel="noreferrer">Source on GitHub</a>
        </span>
        <span className="site-disclaimer">Personal demo project. Views and opinions are my own. Not affiliated with or endorsed by my employer.</span>
      </footer>
    </main>
  );
}

function Metric({ label, value, baseline, tone, icon: Icon }: { label: string; value: string; baseline: string; tone: "good" | "warn" | "bad"; icon: typeof Activity }) {
  return <article className={`metric-card ${tone}`}><div><span>{label}</span><Icon size={17} /></div><strong>{value}</strong><small>{baseline}</small><div className="sparkline" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></div></article>;
}
