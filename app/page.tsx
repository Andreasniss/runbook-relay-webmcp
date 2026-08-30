"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, AlertTriangle, Bot, Check, ChevronRight, CircleDot, Gauge, GitPullRequestArrow, RotateCcw, ServerCog, ShieldCheck, Sparkles, TerminalSquare, UserCheck } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

type MitigationId = "restore-pool" | "shift-traffic" | "scale-workers";
type IncidentStatus = "investigating" | "awaiting-approval" | "mitigated";
type AuditEvent = { id: number; actor: "agent" | "human" | "system"; action: string; detail: string; time: string };
type Mitigation = { id: MitigationId; title: string; summary: string; risk: "Low" | "Medium"; latency: string; errorRate: string; tradeoff: string };

const mitigations: Mitigation[] = [
  { id: "restore-pool", title: "Restore database pool limit", summary: "Revert the pool from 40 to the last known-good value of 120.", risk: "Low", latency: "1.2 s", errorRate: "0.6%", tradeoff: "Returns database concurrency to the pre-change baseline." },
  { id: "shift-traffic", title: "Shift 30% traffic to eu-west-1", summary: "Temporarily move requests away from the saturated primary region.", risk: "Medium", latency: "1.8 s", errorRate: "1.1%", tradeoff: "Adds cross-region latency and increases standby cost." },
  { id: "scale-workers", title: "Scale API workers to 24", summary: "Add workers while leaving the current database limit unchanged.", risk: "Medium", latency: "3.9 s", errorRate: "6.4%", tradeoff: "Treats the symptom and may increase database contention." },
];

const initialAudit: AuditEvent[] = [
  { id: 1, actor: "system", action: "Incident opened", detail: "Checkout API SLO burn exceeded 14× for five minutes.", time: "14:16:03" },
  { id: 2, actor: "system", action: "Change correlated", detail: "db-pool-842 reduced max connections from 120 to 40.", time: "14:16:11" },
];

const actorIcon = { agent: Bot, human: UserCheck, system: TerminalSquare };
const now = () => new Date().toLocaleTimeString("en-GB", { hour12: false });

export default function Home() {
  const [status, setStatus] = useState<IncidentStatus>("investigating");
  const [selectedId, setSelectedId] = useState<MitigationId>("restore-pool");
  const [stagedId, setStagedId] = useState<MitigationId | null>(null);
  const [approved, setApproved] = useState(false);
  const [audit, setAudit] = useState<AuditEvent[]>(initialAudit);
  const [toolsAvailable, setToolsAvailable] = useState(false);
  const sequence = useRef(3);

  const selected = useMemo(() => mitigations.find((item) => item.id === selectedId) ?? mitigations[0], [selectedId]);
  const staged = useMemo(() => mitigations.find((item) => item.id === stagedId) ?? null, [stagedId]);

  const appendAudit = useCallback((actor: AuditEvent["actor"], action: string, detail: string) => {
    setAudit((events) => [...events, { id: sequence.current++, actor, action, detail, time: now() }]);
  }, []);

  const selectMitigation = useCallback((id: MitigationId, actor: AuditEvent["actor"] = "human") => {
    setSelectedId(id);
    const option = mitigations.find((item) => item.id === id)!;
    appendAudit(actor, "Simulation compared", `${option.title}: predicted ${option.errorRate} errors.`);
    return option;
  }, [appendAudit]);

  const stageMitigation = useCallback((id: MitigationId, actor: AuditEvent["actor"] = "human") => {
    const option = mitigations.find((item) => item.id === id)!;
    setSelectedId(id); setStagedId(id); setApproved(false); setStatus("awaiting-approval");
    appendAudit(actor, "Mitigation staged", `${option.title}. Execution remains locked pending human approval.`);
    return { staged: option, requiresHumanApproval: true, executed: false };
  }, [appendAudit]);

  const approveMitigation = useCallback(() => {
    if (!staged) return;
    setApproved(true);
    appendAudit("human", "Execution approved", `${staged.title} approved for this browser session.`);
  }, [appendAudit, staged]);

  const executeMitigation = useCallback((actor: AuditEvent["actor"] = "human") => {
    if (!staged) return { executed: false, reason: "No mitigation is staged." };
    if (!approved) {
      appendAudit("system", "Execution blocked", "Policy requires explicit human approval in the page.");
      return { executed: false, reason: "Human approval is required in the page before execution." };
    }
    setStatus("mitigated");
    appendAudit(actor, "Mitigation executed", `${staged.title}. Error rate recovered to ${staged.errorRate}.`);
    return { executed: true, mitigation: staged.title, observed: { p95Latency: staged.latency, errorRate: staged.errorRate, saturation: "51%" } };
  }, [approved, appendAudit, staged]);

  const reset = useCallback((actor: AuditEvent["actor"] = "human") => {
    setStatus("investigating"); setSelectedId("restore-pool"); setStagedId(null); setApproved(false); setAudit(initialAudit); sequence.current = 3;
    if (actor === "agent") setTimeout(() => appendAudit("agent", "Simulation reset", "Incident state returned to the initial snapshot."), 0);
    return { reset: true };
  }, [appendAudit]);

  const stateRef = useRef({ status, selected, staged, approved });
  useEffect(() => { stateRef.current = { status, selected, staged, approved }; }, [status, selected, staged, approved]);

  useEffect(() => {
    const modelContext = document.modelContext;
    if (typeof modelContext?.registerTool !== "function") return;
    const controller = new AbortController();
    const register = async () => Promise.all([
      modelContext.registerTool({
        name: "get_incident_snapshot",
        description: "Read the active incident, current telemetry, correlated deployment, and approval state. This has no side effects.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true },
        execute: async () => ({
          incident: { id: "INC-2841", service: "checkout-api", severity: "SEV-2", status: stateRef.current.status },
          telemetry: stateRef.current.status === "mitigated" ? { p95Latency: stateRef.current.staged?.latency, errorRate: stateRef.current.staged?.errorRate, saturation: "51%" } : { p95Latency: "4.8 s", errorRate: "8.7%", saturation: "94%" },
          correlatedChange: { id: "db-pool-842", confidence: 0.93, change: "max connections 120 → 40" },
          control: { staged: stateRef.current.staged?.id ?? null, humanApproved: stateRef.current.approved },
        }),
      }, { signal: controller.signal }),
      modelContext.registerTool({
        name: "compare_mitigations",
        description: "Compare the predicted reliability impact and tradeoffs of safe, predefined mitigations. Optionally focus the page on one option.",
        inputSchema: { type: "object", properties: { mitigationId: { type: "string", enum: mitigations.map((item) => item.id) } }, additionalProperties: false }, annotations: { readOnlyHint: true },
        execute: async (input: unknown) => { const { mitigationId } = input as { mitigationId?: MitigationId }; if (mitigationId) selectMitigation(mitigationId, "agent"); return { current: { p95Latency: "4.8 s", errorRate: "8.7%" }, options: mitigations }; },
      }, { signal: controller.signal }),
      modelContext.registerTool({
        name: "stage_mitigation",
        description: "Stage one predefined mitigation for visible human review. This never executes the change and always requires approval in the page.",
        inputSchema: { type: "object", properties: { mitigationId: { type: "string", enum: mitigations.map((item) => item.id) } }, required: ["mitigationId"], additionalProperties: false },
        execute: async (input: unknown) => { const { mitigationId } = input as { mitigationId: MitigationId }; return stageMitigation(mitigationId, "agent"); },
      }, { signal: controller.signal }),
      modelContext.registerTool({
        name: "execute_approved_mitigation",
        description: "Execute the staged mitigation only after the human has explicitly approved it in the page. The page fails closed when approval is absent.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { destructiveHint: true },
        execute: async () => executeMitigation("agent"),
      }, { signal: controller.signal }),
      modelContext.registerTool({
        name: "reset_incident_simulation",
        description: "Reset this deterministic demo to the initial incident state.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        execute: async () => reset("agent"),
      }, { signal: controller.signal }),
    ]);
    register().then(() => setToolsAvailable(true)).catch(() => setToolsAvailable(false));
    return () => controller.abort();
  }, [executeMitigation, reset, selectMitigation, stageMitigation]);

  const currentMetrics = status === "mitigated" && staged ? { latency: staged.latency, errors: staged.errorRate, saturation: "51%" } : { latency: "4.8 s", errors: "8.7%", saturation: "94%" };

  return (
    <main className="control-room">
      <header className="topbar">
        <div className="brand"><div className="brand-mark"><GitPullRequestArrow size={18} /></div><div><strong>Runbook Relay</strong><span>Human-guided incident response</span></div></div>
        <div className="topbar-actions"><span className={`tool-status ${toolsAvailable ? "connected" : ""}`}><Sparkles size={14} /> {toolsAvailable ? "5 WebMCP tools live" : "WebMCP-ready"}</span><a href="https://github.com/Andreasniss/runbook-relay-webmcp" target="_blank" rel="noreferrer">Source <ChevronRight size={14} /></a></div>
      </header>

      <section className="incident-strip" aria-label="Active incident summary">
        <div className="incident-title"><span className={`status-light ${status}`} /><div><span className="eyebrow">INC-2841 · SEV-2 · CHECKOUT-API</span><h1>{status === "mitigated" ? "Service recovered" : "Elevated latency and payment errors"}</h1></div></div>
        <div className="incident-meta"><span>Started 14:11 UTC</span><span className={`state-pill ${status}`}>{status.replace("-", " ")}</span><button onClick={() => reset()} aria-label="Reset incident simulation"><RotateCcw size={14} /> Reset</button></div>
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

          <section className="panel audit-panel"><div className="panel-heading compact"><div><span className="section-kicker">Shared state</span><h2>Decision log</h2></div><span className="event-count">{audit.length}</span></div><div className="audit-list">{audit.map((event) => { const Icon = actorIcon[event.actor]; return <div className="audit-event" key={event.id}><span className={`actor ${event.actor}`}><Icon size={13} /></span><div><div><strong>{event.action}</strong><time>{event.time}</time></div><p>{event.detail}</p></div></div>; })}</div></section>
        </aside>
      </section>

      <footer><span><ShieldCheck size={14} /> Agent actions are scoped, visible, and auditable.</span><span>Deterministic demo · no production systems are changed</span></footer>
    </main>
  );
}

function Metric({ label, value, baseline, tone, icon: Icon }: { label: string; value: string; baseline: string; tone: "good" | "warn" | "bad"; icon: typeof Activity }) {
  return <article className={`metric-card ${tone}`}><div><span>{label}</span><Icon size={17} /></div><strong>{value}</strong><small>{baseline}</small><div className="sparkline" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></div></article>;
}
