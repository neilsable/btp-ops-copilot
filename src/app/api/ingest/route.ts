import { NextResponse } from "next/server";

function stripRtf(input: string) {
  const trimmed = (input ?? "").trim();
  if (!trimmed.startsWith("{\\rtf")) return input;

  return trimmed
    .replace(/\\par[d]?/g, "\n")
    .replace(/\\'([0-9a-fA-F]{2})/g, (_m, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    )
    .replace(/\{\\\*?[^{}]*\}/g, "")
    .replace(/\\[a-zA-Z]+\d* ?/g, "")
    .replace(/[{}]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function pickMostCommon(values: string[], fallback: string) {
  if (!values.length) return fallback;
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = values[0];
  let bestCount = 0;
  for (const [k, c] of counts.entries()) {
    if (c > bestCount) {
      best = k;
      bestCount = c;
    }
  }
  return best || fallback;
}

function safeIsoFromLine(line: string) {
  // matches 2026-01-06T13:01:02.114Z
  const m = line.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/);
  return m?.[0];
}

function parseKeyVals(line: string) {
  // captures key=value tokens (value may be quoted)
  const kv: Record<string, string> = {};
  const re = /(\w+)=(".*?"|[^\s]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const key = m[1];
    let val = m[2] ?? "";
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    kv[key] = val;
  }
  return kv;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as any;
    const raw = stripRtf(String(body?.text ?? "")).trim();

    if (!raw) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }

    const lines = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const services: string[] = [];
    const regions: string[] = [];
    const timestamps: string[] = [];

    let errors = 0;
    let warns = 0;
    let infos = 0;
    let timeouts = 0;
    let http5xx = 0;

    // pattern counters
    const patterns = new Map<string, number>();

    for (const line of lines) {
      const upper = line.toUpperCase();
      if (upper.includes(" ERROR ")) errors++;
      else if (upper.includes(" WARN ")) warns++;
      else if (upper.includes(" INFO ")) infos++;

      if (upper.includes("TIMEOUT")) timeouts++;

      const kv = parseKeyVals(line);
      if (kv.service) services.push(kv.service);
      if (kv.region) regions.push(kv.region);

      const ts = safeIsoFromLine(line);
      if (ts) timestamps.push(ts);

      // http status
      const hs = kv.httpStatus ?? kv.status ?? "";
      const hsNum = Number(hs);
      if (!Number.isNaN(hsNum) && hsNum >= 500 && hsNum <= 599) http5xx++;

      // pattern extraction (simple but effective)
      if (upper.includes("TOKEN_VALIDATION")) {
        patterns.set("token_validation_slow", (patterns.get("token_validation_slow") ?? 0) + 1);
      }
      if (upper.includes("UPSTREAM TIMEOUT")) {
        patterns.set("upstream_timeout", (patterns.get("upstream_timeout") ?? 0) + 1);
      }
      if (upper.includes("DOWNSTREAM")) {
        patterns.set("downstream_instability", (patterns.get("downstream_instability") ?? 0) + 1);
      }
      if (upper.includes("CIRCUIT BREAKER")) {
        patterns.set("circuit_breaker_open", (patterns.get("circuit_breaker_open") ?? 0) + 1);
      }
      if (upper.includes("NO SCALE EVENT") || upper.includes("MAX REACHED")) {
        patterns.set("autoscaler_max_reached", (patterns.get("autoscaler_max_reached") ?? 0) + 1);
      }
    }

    const serviceGuess = pickMostCommon(services, "BTP Service (unknown)");
    const regionGuess = pickMostCommon(regions, "unknown");

    const start = timestamps.length ? timestamps[0] : undefined;
    const end = timestamps.length ? timestamps[timestamps.length - 1] : undefined;

    const logLines = lines.length;
    const errorRatePct =
      logLines > 0 ? Math.round((errors / logLines) * 1000) / 10 : 0;

    // top patterns list
    const topPatterns = Array.from(patterns.entries())
      .map(([pattern, count]) => ({ pattern, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    const sampleLines = lines.slice(0, Math.min(10, lines.length));

    const derivedSignals: Record<string, number | string> = {
      log_lines: logLines,
      errors,
      warns,
      infos,
      timeouts,
      http_5xx: http5xx,
      error_rate_pct: errorRatePct,
    };

    return NextResponse.json({
      incident: {
        serviceGuess,
        regionGuess,
        timeWindow: { start, end },
        topPatterns,
        sampleLines,
        derivedSignals,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Ingest failed" },
      { status: 500 }
    );
  }
}
