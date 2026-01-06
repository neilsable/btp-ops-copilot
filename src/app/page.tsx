"use client";

import { useMemo, useRef, useState } from "react";

/* ----------------------------- Types ----------------------------- */
type Telemetry = {
  service: string;
  region: string;
  signals: Record<string, number | string>;
  logs: string[];
};

type AnalyzeResponse = {
  output: {
    severity: "Low" | "Medium" | "High";
    confidence: "Low" | "Medium" | "High";
    summary: string;
    rootCause: string;
    actions: string[];
    businessImpact: string;
    btpNextSteps: string[];
    signalHighlights: string[];
    executiveOneLiner: string;
  };
};

type IngestResponse = {
  incident: {
    serviceGuess: string;
    regionGuess: string;
    timeWindow: { start?: string; end?: string };
    topPatterns: Array<{ pattern: string; count: number }>;
    sampleLines: string[];
    derivedSignals: Record<string, number | string>;
  };
};

/* --------------------------- Helpers ----------------------------- */
function cn(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

function formatKey(key: string) {
  return key.replaceAll("_", " ").replace("pct", "%");
}

function toMarkdownBrief(params: {
  scenario: string;
  telemetry: Telemetry;
  analysis: AnalyzeResponse["output"];
}) {
  const { scenario, telemetry, analysis } = params;

  const highlights =
    analysis.signalHighlights?.length > 0
      ? analysis.signalHighlights
      : Object.entries(telemetry.signals).map(
          ([k, v]) => `${formatKey(k)}: ${String(v)}`
        );

  return [
    "# Incident Brief — SAP BTP Ops Copilot",
    "",
    `**Scenario:** ${scenario}`,
    `**Service:** ${telemetry.service}`,
    `**Region:** ${telemetry.region}`,
    `**Severity:** ${analysis.severity}`,
    `**Confidence:** ${analysis.confidence}`,
    "",
    "## Executive One-liner",
    analysis.executiveOneLiner,
    "",
    "## Signal Highlights",
    highlights.map((h) => `- ${h}`).join("\n"),
    "",
    "## Summary",
    analysis.summary,
    "",
    "## Likely Root Cause",
    analysis.rootCause,
    "",
    "## Recommended Actions",
    analysis.actions.map((a) => `- ${a}`).join("\n"),
    "",
    "## Business Impact",
    analysis.businessImpact,
    "",
    "## BTP-native Next Steps",
    analysis.btpNextSteps.map((s) => `- ${s}`).join("\n"),
    "",
    "## Recent Logs (sample)",
    telemetry.logs.map((l) => `- \`${l}\``).join("\n"),
    "",
    "_Generated from an uploaded log snippet (local demo MVP)._",
  ].join("\n");
}

function severityTone(sev?: "Low" | "Medium" | "High") {
  if (sev === "High") {
    return {
      ring: "ring-rose-500/25",
      border: "border-rose-500/25",
      badge: "border-rose-500/40 bg-rose-500/14 text-rose-100",
      glow: "shadow-[0_0_80px_rgba(244,63,94,0.12)]",
      gradientBar: "from-rose-500/75 via-amber-500/25 to-transparent",
      orb: "bg-rose-500/12",
      label: "text-rose-100",
    };
  }
  if (sev === "Medium") {
    return {
      ring: "ring-amber-500/25",
      border: "border-amber-500/25",
      badge: "border-amber-500/40 bg-amber-500/14 text-amber-100",
      glow: "shadow-[0_0_80px_rgba(245,158,11,0.12)]",
      gradientBar: "from-amber-500/70 via-sky-500/20 to-transparent",
      orb: "bg-amber-500/12",
      label: "text-amber-100",
    };
  }
  return {
    ring: "ring-emerald-500/20",
    border: "border-sky-500/20",
    badge: "border-emerald-500/40 bg-emerald-500/14 text-emerald-100",
    glow: "shadow-[0_0_80px_rgba(16,185,129,0.10)]",
    gradientBar: "from-sky-500/75 via-blue-500/25 to-transparent",
    orb: "bg-sky-500/12",
    label: "text-emerald-100",
  };
}

function confidenceBadge(conf: "Low" | "Medium" | "High") {
  if (conf === "High")
    return "border-emerald-500/35 bg-emerald-500/12 text-emerald-100";
  if (conf === "Medium")
    return "border-sky-500/35 bg-sky-500/12 text-sky-100";
  return "border-neutral-700 bg-neutral-950/60 text-neutral-200";
}

function getNum(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function signalTone(key: string, val: number) {
  // severity-ish highlights for important signals
  const k = key.toLowerCase();
  if (val <= 0) return "border-neutral-800 bg-neutral-950/65";

  if (k.includes("http_5xx") || k.includes("timeouts") || k.includes("errors")) {
    return "border-rose-500/22 bg-gradient-to-br from-rose-500/12 to-neutral-950/65 shadow-[0_0_35px_rgba(244,63,94,0.12)]";
  }
  if (k.includes("warn")) {
    return "border-amber-500/20 bg-gradient-to-br from-amber-500/10 to-neutral-950/65 shadow-[0_0_30px_rgba(245,158,11,0.10)]";
  }
  return "border-sky-500/18 bg-gradient-to-br from-sky-500/10 to-neutral-950/65 shadow-[0_0_30px_rgba(56,189,248,0.10)]";
}

/* ----------------------------- Page ------------------------------ */
export default function Page() {
  const [scenario, setScenario] = useState("Uploaded Incident");

  const [telemetry, setTelemetry] = useState<Telemetry>({
    service: "BTP Service (unknown)",
    region: "unknown",
    signals: {
      log_lines: 0,
      errors: 0,
      warns: 0,
      timeouts: 0,
      http_5xx: 0,
      error_rate_pct: 0,
    },
    logs: [],
  });

  // Raw text and file handling
  const [rawText, setRawText] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [fileBytes, setFileBytes] = useState<number>(0);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // State machine
  const [loadingIngest, setLoadingIngest] = useState(false);
  const [loadingAnalyze, setLoadingAnalyze] = useState(false);
  const [analysis, setAnalysis] = useState<AnalyzeResponse["output"] | null>(
    null
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Export modal
  const [exportOpen, setExportOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const tone = severityTone(analysis?.severity);

  const mdBrief = useMemo(() => {
    if (!analysis) return "";
    return toMarkdownBrief({ scenario, telemetry, analysis });
  }, [analysis, scenario, telemetry]);

  const readyForIngest = rawText.trim().length > 0 && !loadingIngest;
  const readyForAnalyze =
    !loadingAnalyze && !loadingIngest && telemetry.logs.length > 0;

  async function ingestText(text: string) {
    const payload = (text ?? "").trim();
    if (!payload) {
      setErrorMsg("No log content loaded. Upload a file or paste logs first.");
      return;
    }

    setLoadingIngest(true);
    setErrorMsg(null);
    setAnalysis(null);

    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: payload }),
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`Ingest error ${res.status}${t ? `: ${t}` : ""}`);
      }

      const json = (await res.json()) as IngestResponse;
      const incident = json.incident;

      setTelemetry({
        service: incident.serviceGuess,
        region: incident.regionGuess,
        signals: incident.derivedSignals,
        logs: incident.sampleLines,
      });

      setScenario(
        `Uploaded Incident${
          incident.timeWindow?.start
            ? ` (${incident.timeWindow.start} → ${incident.timeWindow.end})`
            : ""
        }`
      );
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Failed to ingest logs.");
    } finally {
      setLoadingIngest(false);
    }
  }

  async function ingestLogs() {
    await ingestText(rawText);
  }

  async function generate() {
    if (!telemetry.logs.length) {
      setErrorMsg("Ingest must succeed first (no parsed log sample available).");
      return;
    }

    setLoadingAnalyze(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario, ...telemetry }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `Analyze API error ${res.status}${text ? `: ${text}` : ""}`.trim()
        );
      }

      const json = (await res.json()) as AnalyzeResponse;
      setAnalysis(json.output);
      setCopied(false);
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Failed to analyze.");
      setAnalysis(null);
    } finally {
      setLoadingAnalyze(false);
    }
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // ignore
    }
  }

  async function copyExecutiveSummary() {
    if (!analysis) return;

    const text = [
      "SAP BTP Ops Copilot — Executive Summary",
      `Scenario: ${scenario}`,
      `Service: ${telemetry.service} | Region: ${telemetry.region}`,
      `Severity: ${analysis.severity} | Confidence: ${analysis.confidence}`,
      "",
      `One-liner: ${analysis.executiveOneLiner}`,
      `Summary: ${analysis.summary}`,
      "",
      "Recommended Actions:",
      ...analysis.actions.map((a) => `- ${a}`),
    ].join("\n");

    await copyText(text);
  }

  function clearAll() {
    if (loadingIngest || loadingAnalyze) return;

    setRawText("");
    setFileName("");
    setFileBytes(0);

    setTelemetry({
      service: "BTP Service (unknown)",
      region: "unknown",
      signals: {
        log_lines: 0,
        errors: 0,
        warns: 0,
        timeouts: 0,
        http_5xx: 0,
        error_rate_pct: 0,
      },
      logs: [],
    });

    setScenario("Uploaded Incident");
    setAnalysis(null);
    setErrorMsg(null);
    setCopied(false);
  }

  return (
    <main className="min-h-screen w-full bg-neutral-950 text-neutral-100 text-[20
    px]">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0">
        <div className={cn("absolute -top-64 -right-64 h-[860px] w-[860px] rounded-full blur-3xl", tone.orb)} />
        <div className="absolute -bottom-64 -left-64 h-[860px] w-[860px] rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute inset-0 bg-gradient-to-b from-neutral-950 via-neutral-950 to-neutral-900/45" />
        <div className="absolute inset-0 opacity-[0.06] [background-image:radial-gradient(circle_at_1px_1px,rgba(56,189,248,0.35)_1px,transparent_0)] [background-size:26px_26px]" />
        <div className="absolute inset-0 opacity-[0.10] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_70%)] bg-gradient-to-r from-sky-500/10 via-transparent to-blue-500/10" />
      </div>

      {/* Title Frame */}
      <header className="relative z-10 px-10 pt-10">
        <div
          className={cn(
            "rounded-[28px] border bg-neutral-950/55 backdrop-blur overflow-hidden",
            tone.border,
            tone.glow
          )}
        >
          <div className={cn("h-[3px] w-full bg-gradient-to-r", tone.gradientBar)} />
          <div className="px-10 py-8 flex items-start justify-between gap-8">
            <div>
              <div className="inline-flex items-center gap-3">
                <span className="h-3 w-3 rounded-full bg-sky-400 shadow-[0_0_20px_rgba(56,189,248,0.35)]" />
                <span className="text-sm font-semibold tracking-wide text-neutral-300">
                  SAP BTP Operations
                </span>
              </div>
              <h1 className="mt-2 text-5xl md:text-6xl font-semibold tracking-tight leading-[1.05]">
                SAP BTP Ops Copilot
              </h1>
              <p className="mt-3 text-xl md:text-2xl text-neutral-300 max-w-4xl leading-relaxed">
                Decision-grade incident briefs from platform telemetry — built for operator speed and executive clarity.
              </p>
            </div>

            <div className="flex flex-col items-end gap-3 pt-1">
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "rounded-full border px-4 py-2 text-sm font-semibold",
                    analysis?.severity ? tone.badge : "border-neutral-800 bg-neutral-950/60 text-neutral-200"
                  )}
                >
                  Severity: {analysis?.severity ?? "—"}
                </span>

                {analysis?.confidence && (
                  <span
                    className={cn(
                      "rounded-full border px-4 py-2 text-sm font-semibold",
                      confidenceBadge(analysis.confidence)
                    )}
                  >
                    Confidence: {analysis.confidence}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <span className="rounded-full border border-neutral-800 bg-neutral-950/60 text-neutral-200 px-4 py-2 text-sm font-semibold">
                  {telemetry.region}
                </span>
                <span className="rounded-full border border-neutral-800 bg-neutral-950/60 text-neutral-200 px-4 py-2 text-sm font-semibold">
                  {telemetry.service}
                </span>
              </div>
            </div>
          </div>

          {analysis?.executiveOneLiner && (
            <div className="px-10 pb-8">
              <div
                className={cn(
                  "rounded-[22px] border bg-gradient-to-br p-6",
                  tone.border,
                  "from-neutral-950/40 to-neutral-950/70",
                  "shadow-[0_0_45px_rgba(56,189,248,0.08)]"
                )}
              >
                <div className={cn("text-sm font-semibold tracking-wide", tone.label)}>
                  Executive One-liner
                </div>
                <div className="mt-2 text-xl md:text-2xl font-semibold leading-relaxed text-neutral-100">
                  {analysis.executiveOneLiner}
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Body */}
      <div className="relative z-10 px-10 py-10">
        <div className="grid gap-10 xl:grid-cols-12 min-h-[72vh]">
          {/* Left: Ingest */}
          <section className="xl:col-span-5 rounded-[28px] border border-neutral-800/80 bg-neutral-950/45 backdrop-blur p-8 shadow-[0_18px_70px_rgba(0,0,0,0.6)]">
            <div className="flex items-start justify-between gap-6">
              <div>
                <h2 className="text-2xl font-semibold text-neutral-100">
                  Ingest Real Logs
                </h2>
                <p className="mt-2 text-base text-neutral-400">
                  Upload a .log/.txt/.csv/.json file or paste log lines. Upload
                  auto-ingests so Generate is unlocked immediately.
                </p>
              </div>
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 px-4 py-3">
                <div className="text-xs text-neutral-500">Status</div>
                <div className="mt-1 text-sm font-semibold text-neutral-200">
                  {loadingIngest
                    ? "Ingesting…"
                    : telemetry.logs.length > 0
                      ? "Ready"
                      : "Awaiting logs"}
                </div>
              </div>
            </div>

            {/* File input */}
            <div className="mt-6 flex items-center gap-3">
              <input
                ref={fileRef}
                type="file"
                accept=".txt,.log,.json,.csv"
                className="hidden"
                onChange={async () => {
                  const input = fileRef.current;
                  const file = input?.files?.[0];
                  if (!file) return;

                  const text = await file.text();

                  setRawText(text);
                  setFileName(file.name);
                  setFileBytes(file.size);
                  setErrorMsg(null);
                  setAnalysis(null);

                  if (fileRef.current) fileRef.current.value = "";

                  await ingestText(text);
                }}
              />

              <button
                className="rounded-2xl border border-neutral-800 bg-neutral-950/40 px-5 py-3 text-lg font-semibold text-neutral-200 hover:bg-neutral-950/60 focus:outline-none focus:ring-2 focus:ring-neutral-600/40"
                onClick={() => fileRef.current?.click()}
              >
                Upload File
              </button>

              <button
                className={cn(
                  "rounded-2xl border px-5 py-3 text-lg font-semibold focus:outline-none focus:ring-2 shadow-[0_0_30px_rgba(56,189,248,0.18)]",
                  !readyForIngest
                    ? "border-neutral-700 bg-neutral-900/40 text-neutral-300 cursor-not-allowed"
                    : "border-sky-500/30 bg-sky-500/14 text-sky-100 hover:bg-sky-500/18 focus:ring-sky-500/40"
                )}
                onClick={ingestLogs}
                disabled={!readyForIngest}
              >
                {loadingIngest ? "Ingesting…" : "Ingest Logs"}
              </button>

              <button
                className={cn(
                  "rounded-2xl border border-neutral-800 bg-neutral-950/40 px-5 py-3 text-lg font-semibold text-neutral-200 hover:bg-neutral-950/60 focus:outline-none focus:ring-2 focus:ring-neutral-600/40",
                  (loadingIngest || loadingAnalyze) &&
                    "opacity-60 cursor-not-allowed"
                )}
                onClick={clearAll}
                disabled={loadingIngest || loadingAnalyze}
              >
                Clear
              </button>
            </div>

            {/* File + content indicators */}
            <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4">
              <div className="grid gap-2 md:grid-cols-3">
                <div className="text-sm text-neutral-300">
                  <span className="font-semibold text-neutral-100">File:</span>{" "}
                  {fileName ? fileName : "—"}
                </div>
                <div className="text-sm text-neutral-300">
                  <span className="font-semibold text-neutral-100">Size:</span>{" "}
                  {fileName ? `${fileBytes} bytes` : "—"}
                </div>
                <div className="text-sm text-neutral-300">
                  <span className="font-semibold text-neutral-100">
                    Loaded chars:
                  </span>{" "}
                  {rawText.length}
                </div>
              </div>
              <div className="mt-2 text-xs text-neutral-500">
                If ingestion succeeds, “Sample lines parsed” below will be
                greater than 0.
              </div>
            </div>

            {/* Paste area */}
            <div className="mt-6">
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="Paste log snippet here (recommended: 50–300 lines), then click Ingest Logs."
                className="w-full h-[260px] rounded-2xl border border-neutral-800 bg-neutral-950/70 p-5 text-sm text-neutral-200 font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-sky-500/25"
              />
              <div className="mt-3 text-sm text-neutral-500">
                Tip: remove secrets before pasting. Keep timestamps if possible.
              </div>
            </div>

            {/* Parsed snapshot */}
            <div className="mt-8">
              <h3 className="text-xl font-semibold text-neutral-100 mb-4">
                Parsed Telemetry Snapshot
              </h3>

              <div className="grid gap-4 md:grid-cols-2">
                <Metric label="Service (guess)" value={telemetry.service} />
                <Metric label="Region (guess)" value={telemetry.region} />
              </div>

              <div className="mt-6">
                <h4 className="text-lg font-semibold text-neutral-100 mb-3">
                  Derived Signals
                </h4>
                <div className="grid gap-4 sm:grid-cols-2">
                  {Object.entries(telemetry.signals).map(([k, v]) => {
                    const num = getNum(v);
                    return (
                      <Signal
                        key={k}
                        label={formatKey(k)}
                        value={String(v)}
                        className={signalTone(k, num)}
                      />
                    );
                  })}
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-950/65 p-5">
                <div className="text-sm font-semibold text-neutral-200">
                  Sample lines parsed:{" "}
                  <span className="font-semibold">{telemetry.logs.length}</span>
                </div>
                <div className="mt-2 text-xs text-neutral-500">
                  Generate unlocks when this number is greater than 0.
                </div>
              </div>
            </div>
          </section>

          {/* Right: Analysis */}
          <section className="xl:col-span-7 rounded-[28px] border border-neutral-800/80 bg-neutral-950/45 backdrop-blur p-8 shadow-[0_18px_70px_rgba(0,0,0,0.6)]">
            <div className="flex items-start justify-between gap-6">
              <div>
                <h2 className="text-2xl font-semibold text-neutral-100">
                  Copilot Analysis
                </h2>
                <p className="mt-2 text-base text-neutral-400">
                  Generate an executive-ready incident brief from ingested log
                  patterns.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  className={cn(
                    "rounded-2xl border px-5 py-3 text-lg font-semibold focus:outline-none focus:ring-2",
                    !readyForAnalyze
                      ? "border-neutral-700 bg-neutral-900/40 text-neutral-300 cursor-not-allowed"
                      : cn(
                          "border-sky-500/30 bg-sky-500/14 text-sky-100 hover:bg-sky-500/18 focus:ring-sky-500/40",
                          "shadow-[0_0_34px_rgba(56,189,248,0.18)]"
                        )
                  )}
                  onClick={generate}
                  disabled={!readyForAnalyze}
                >
                  {loadingAnalyze ? "Generating…" : "Generate"}
                </button>

                <button
                  className={cn(
                    "rounded-2xl border border-neutral-800 bg-neutral-950/40 px-5 py-3 text-lg font-semibold text-neutral-200 hover:bg-neutral-950/60 focus:outline-none focus:ring-2 focus:ring-neutral-600/40",
                    (!analysis || loadingAnalyze || loadingIngest) &&
                      "opacity-60 cursor-not-allowed"
                  )}
                  onClick={copyExecutiveSummary}
                  disabled={!analysis || loadingAnalyze || loadingIngest}
                >
                  {copied ? "Copied" : "Copy"}
                </button>

                <button
                  className={cn(
                    "rounded-2xl border border-neutral-800 bg-neutral-950/40 px-5 py-3 text-lg font-semibold text-neutral-200 hover:bg-neutral-950/60 focus:outline-none focus:ring-2 focus:ring-neutral-600/40",
                    (!analysis || loadingAnalyze || loadingIngest) &&
                      "opacity-60 cursor-not-allowed"
                  )}
                  onClick={() => setExportOpen(true)}
                  disabled={!analysis || loadingAnalyze || loadingIngest}
                >
                  Export
                </button>
              </div>
            </div>

            {errorMsg && (
              <div className="mt-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-base text-rose-100">
                <div className="font-semibold">Action failed</div>
                <div className="mt-2 text-rose-100/90">{errorMsg}</div>
              </div>
            )}

            <div className="mt-6 rounded-2xl border border-sky-500/14 bg-neutral-950/55 p-5">
              <div className="text-sm font-semibold text-neutral-200">
                Current Context
              </div>
              <div className="mt-3 text-base text-neutral-300">
                <span className="font-semibold text-neutral-100">Scenario:</span>{" "}
                {scenario}
              </div>
              <div className="mt-2 text-sm text-neutral-400">
                Generate uses derived signals and parsed sample lines.
              </div>
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              <Card title="Summary" accent tone={tone}>
                {analysis?.summary ? (
                  <p>{analysis.summary}</p>
                ) : (
                  <Placeholder
                    title="Upload → auto-ingest → Generate."
                    body="Once ingestion succeeds, Generate produces executive-grade output."
                  />
                )}
              </Card>

              <Card title="Likely Root Cause" tone={tone}>
                {analysis?.rootCause ? (
                  <p>{analysis.rootCause}</p>
                ) : (
                  <Placeholder
                    title="Root-cause hypothesis appears here."
                    body="Based on observed patterns: timeouts, 5xx, retries, saturation."
                  />
                )}
              </Card>

              <Card title="Recommended Actions" accent tone={tone}>
                {analysis?.actions?.length ? (
                  <ul className="list-disc pl-6 space-y-2">
                    {analysis.actions.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                ) : (
                  <Placeholder
                    title="Actions appear here."
                    body="Immediate containment + short-term remediation + long-term governance."
                  />
                )}
              </Card>

              <Card title="Business Impact" tone={tone}>
                {analysis?.businessImpact ? (
                  <p>{analysis.businessImpact}</p>
                ) : (
                  <Placeholder
                    title="Impact framing appears here."
                    body="Explains risk in terms of SLA/SLO and customer experience."
                  />
                )}
              </Card>
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              <Card title="Recent Logs (sample)" tone={tone}>
                <div className="space-y-3">
                  {(telemetry.logs?.length ? telemetry.logs : ["(No logs yet)"]).map(
                    (l, i) => (
                      <div
                        key={i}
                        className="rounded-2xl border border-neutral-800 bg-neutral-950/65 px-4 py-3 text-sm text-neutral-300 font-mono"
                      >
                        {l}
                      </div>
                    )
                  )}
                </div>
              </Card>

              <Card title="BTP-native Next Steps" accent tone={tone}>
                {analysis?.btpNextSteps?.length ? (
                  <ul className="list-disc pl-6 space-y-2">
                    {analysis.btpNextSteps.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                ) : (
                  <Placeholder
                    title="Operationalization steps appear here."
                    body="SLOs, release correlation, runbooks, and cost guardrails."
                  />
                )}
              </Card>
            </div>
          </section>
        </div>

        <footer className="mt-8 text-sm text-neutral-500">
          Demo: logs → parsed signals → decision-grade brief (copy/export ready).
        </footer>
      </div>
        {/* Signature */}
<section className="mt-10">
  <div className="rounded-[28px] border border-sky-500/18 bg-neutral-950/45 backdrop-blur overflow-hidden shadow-[0_18px_70px_rgba(0,0,0,0.55)]">
    <div className="h-[3px] w-full bg-gradient-to-r from-sky-500/70 via-blue-500/25 to-transparent" />
    <div className="px-10 py-10 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
      <div>
        <div className="text-sm font-semibold tracking-[0.22em] text-neutral-400 uppercase">
          Project created by
        </div>
        <div className="mt-3 text-4xl md:text-5xl font-semibold tracking-tight text-neutral-100">
          Neil Sable
        </div>
      
        <span className="inline-flex h-3 w-3 rounded-full bg-sky-400 shadow-[0_0_20px_rgba(56,189,248,0.45)]" />
        <span className="text-sm md:text-base font-semibold text-neutral-300">
          London, UK
        </span>
      </div>
    </div>
  </div>
</section>

      {/* Export Modal */}
      {exportOpen && analysis && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-8">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => setExportOpen(false)}
          />
          <div className="relative w-full max-w-4xl rounded-[28px] border border-neutral-800 bg-neutral-950 shadow-[0_20px_80px_rgba(0,0,0,0.8)] overflow-hidden">
            <div className={cn("h-[3px] w-full bg-gradient-to-r", tone.gradientBar)} />
            <div className="p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-2xl font-semibold text-neutral-100">
                    Export Incident Brief
                  </div>
                  <div className="mt-2 text-base text-neutral-400">
                    Copy this Markdown into Slack, Confluence, Jira, or email.
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    className="rounded-2xl border border-sky-500/30 bg-sky-500/14 px-5 py-3 text-lg font-semibold text-sky-100 hover:bg-sky-500/18 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                    onClick={() => copyText(mdBrief)}
                  >
                    {copied ? "Copied" : "Copy Markdown"}
                  </button>
                  <button
                    className="rounded-2xl border border-neutral-800 bg-neutral-950/40 px-5 py-3 text-lg font-semibold text-neutral-200 hover:bg-neutral-950/60 focus:outline-none focus:ring-2 focus:ring-neutral-600/40"
                    onClick={() => setExportOpen(false)}
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="mt-6">
                <textarea
                  readOnly
                  value={mdBrief}
                  className="w-full h-[420px] rounded-2xl border border-neutral-800 bg-neutral-950/70 p-5 text-sm text-neutral-200 font-mono leading-relaxed focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

/* -------------------------- UI Components ------------------------ */

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/65 px-5 py-4">
      <div className="text-sm text-neutral-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-neutral-100 truncate">
        {value}
      </div>
    </div>
  );
}

function Signal({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border px-5 py-4", className)}>
      <div className="text-sm text-neutral-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-neutral-100 truncate">
        {value}
      </div>
    </div>
  );
}

function Placeholder({ title, body }: { title: string; body: string }) {
  return (
    <div className="text-neutral-200">
      <div className="font-semibold">{title}</div>
      <div className="mt-2 text-neutral-300">{body}</div>
    </div>
  );
}

function Card({
  title,
  children,
  accent,
  tone,
}: {
  title: string;
  children: React.ReactNode;
  accent?: boolean;
  tone: ReturnType<typeof severityTone>;
}) {
  return (
    <div
      className={cn(
        "rounded-[24px] border p-7 shadow-[0_14px_55px_rgba(0,0,0,0.55)]",
        accent
          ? cn(
              "bg-gradient-to-br from-neutral-950/78 to-neutral-950/55",
              "shadow-[0_0_40px_rgba(56,189,248,0.10)]",
              tone.border
            )
          : "border-neutral-800 bg-neutral-950/70"
      )}
    >
      <div className="text-lg font-semibold text-neutral-100 mb-3">{title}</div>
      <div className="text-base text-neutral-200 leading-relaxed">
        {children}
      </div>
    </div>
  );
}
