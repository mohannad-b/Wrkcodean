import { NextResponse } from "next/server";
import { debugLogEnabled, writeClientDebugLog } from "@/lib/debug-trace";

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production" && !debugLogEnabled) {
    return NextResponse.json({ error: "Client debug logging disabled" }, { status: 403 });
  }

  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { stage, event, data, runId, traceId, ts } = payload ?? {};
  if (!stage || !event) {
    return NextResponse.json({ error: "Missing stage or event" }, { status: 400 });
  }

  await writeClientDebugLog({
    stage: String(stage),
    event: String(event),
    data: data && typeof data === "object" ? data : {},
    runId: runId ? String(runId) : undefined,
    traceId: traceId ? String(traceId) : undefined,
    ts: ts ? String(ts) : undefined,
  });

  return NextResponse.json({ ok: true });
}

