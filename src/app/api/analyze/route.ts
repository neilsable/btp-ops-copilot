import { NextResponse } from "next/server";

type Input = {
  scenario?: string;
  service?: string;
  region?: string;
  signals?: Record<string, number | string>;
  logs?: string[];
};

function getNum(signals: Record<string, any> | undefined, key: string) {
  const v = signals?.[key];
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Input | null;
    if (!body) {
      return NextResponse.json({ error: "No payload provided" }, { status: 400 });
    }

    const scenario = body.scenario ?? "Uploaded Incident";
    const service = body.service ?? "BTP Service (unknown)";
    const region = body.region ?? "unknown";
    const signals = body.signals ?? {};
    const logs = Array.isArray(body.logs) ? body.logs : [];

    if (!logs.length) {
      return NextResponse.json({ error: "No logs provided" }, { status: 400 });
    }

    const errors = getNum(signals, "errors");
    const warns = getNum(signals, "warns");
    const timeouts = getNum(signals, "timeouts");
    const http5xx = getNum(signals, "http_5xx");
    const errorRate = getNum(signals, "error_rate_pct");

    let severity: "Low" | "Medium" | "High" = "Low";
    if (http5xx >= 2 || timeouts >= 2 || errorRate >= 3) severity = "High";
    else if (http5xx >= 1 || timeouts >= 1 || errors >= 1) severity = "Medium";

    let confidence: "Low" | "Medium" | "High" = "Medium";
    if (logs.length >= 6 && (timeouts + http5xx + errors) >= 2) confidence = "High";
    if (logs.length < 3) confidence = "Low";

    const signalHighlights = [
      `log lines: ${getNum(signals, "log_lines")}`,
      `errors: ${errors}`,
      `warnings: ${warns}`,
      `timeouts: ${timeouts}`,
      `HTTP 5xx: ${http5xx}`,
      `error rate: ${errorRate}%`,
    ];

    const hasTokenSlow = logs.some((l) => l.toLowerCase().includes("token_validation"));
    const hasUpstreamTimeout = logs.some((l) => l.toLowerCase().includes("upstream timeout"));
    const hasCircuitBreaker = logs.some((l) => l.toLowerCase().includes("circuit breaker"));
    const hasAutoscalerMax = logs.some((l) => l.toLowerCase().includes("no scale event"));

    const rootCauseParts: string[] = [];
    if (hasTokenSlow) rootCauseParts.push("authentication token validation latency (XSUAA/IdP path)");
    if (hasUpstreamTimeout) rootCauseParts.push("upstream dependency timeouts amplifying end-user auth latency");
    if (hasCircuitBreaker) rootCauseParts.push("circuit breaker activation indicates repeated downstream failures");
    if (hasAutoscalerMax) rootCauseParts.push("capacity ceiling reached (autoscaler max) during demand spike");

    const rootCause =
      rootCauseParts.length > 0
        ? `Most likely driver: ${rootCauseParts.join("; ")}.`
        : "Most likely driver: dependency latency and intermittent gateway errors under load.";

    const actions: string[] = [
      "Confirm blast radius (tenant(s), routes, and time window) and set incident bridge + owner.",
      "Correlate spikes with recent deployments/config changes and dependency health in the same region.",
      "Add/validate SLOs: auth latency (p95), 5xx rate, and upstream timeout rate; alert on burn-rate thresholds.",
      "Raise or re-tune autoscaler limits and validate backpressure/timeouts to prevent cascading failure.",
      "Implement a short-term mitigation (fallback, cache, or retry policy) and a runbook for repeatability.",
    ];

    const btpNextSteps: string[] = [
      "Enable/confirm central log and metric collection for the involved subaccount/space and export to a single dashboard.",
      "Create an SLO panel for Auth (XSUAA) latency and HTTP 5xx with alerting to the on-call channel.",
      "Add release correlation tags (app version, deployment id) to logs to speed MTTR.",
      "Define an incident runbook: triage checklist, escalation paths, rollback criteria, and comms template.",
      "Introduce cost guardrails (autoscaling + quota checks) to avoid overcorrecting with spend.",
    ];

    const summary =
      severity === "High"
        ? "Signals show a material deviation from normal performance, including elevated timeouts and 5xx responses, likely impacting user authentication and downstream API reliability."
        : severity === "Medium"
          ? "Signals indicate intermittent degradation (timeouts/5xx) that could escalate under load and affect user-facing flows."
          : "Signals suggest minor anomalies; monitor closely and validate baseline thresholds.";

    const businessImpact =
      severity === "High"
        ? "High risk of SLA breach and customer-facing disruption (login failures / failed API calls), with potential revenue and reputational impact if not mitigated quickly."
        : severity === "Medium"
          ? "Moderate risk of incident escalation and partial customer impact; proactive remediation will reduce MTTR and avoid repeated occurrences."
          : "Low immediate customer impact; use the event to harden detection and operational guardrails.";

    const executiveOneLiner =
      severity === "High"
        ? "We are seeing elevated auth latency and 5xx errors consistent with dependency timeouts under load; containment and scaling guardrails are required immediately."
        : severity === "Medium"
          ? "Early indicators of reliability drift (timeouts/5xx); correlating with releases and tuning scaling/alerts will prevent escalation."
          : "Minor anomalies detected; we will validate baselines and strengthen alerting to prevent future drift.";

    return NextResponse.json({
      output: {
        severity,
        confidence,
        summary,
        rootCause,
        actions,
        businessImpact,
        btpNextSteps,
        signalHighlights,
        executiveOneLiner,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Analyze failed" },
      { status: 500 }
    );
  }
}
