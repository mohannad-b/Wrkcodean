import { NextResponse } from "next/server";
import OpenAI from "openai";
import { and, eq } from "drizzle-orm";
import { ApiError, handleApiError, requireTenantSession } from "@/lib/api/context";
import { can } from "@/lib/auth/rbac";
import { automationVersions } from "@/db/schema";
import { db } from "@/db";
import { loadWrkActionCatalog } from "@/lib/pricing/wrkactions-catalog";

type RouteParams = {
  params: {
    id: string;
  };
};

type EstimateResult = {
  estimatedActions: Array<{ actionType: string; count: number }>;
  complexity: "basic" | "medium" | "complex_rpa";
  estimatedVolume: number;
};

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? "",
});

const FALLBACK_ACTIONS: EstimateResult = {
  estimatedActions: [{ actionType: "wrkaction-79", count: 50 }], // Call to inform @ $0.25 as a floor
  complexity: "medium",
  estimatedVolume: 1000,
};

async function getWorkflowSummary(tenantId: string, automationVersionId: string) {
  const rows = await db
    .select()
    .from(automationVersions)
    .where(and(eq(automationVersions.id, automationVersionId), eq(automationVersions.tenantId, tenantId)))
    .limit(1);
  if (rows.length === 0) {
    throw new ApiError(404, "Automation version not found");
  }
  const workflow = rows[0].workflowJson as any;
  const sections = Array.isArray(workflow?.sections) ? workflow.sections : [];
  const steps = Array.isArray(workflow?.steps) ? workflow.steps : [];
  const sectionText = sections
    .map((s: any) => `${s.title ?? s.key ?? ""}: ${s.content ?? ""}`)
    .join("\n");
  const stepText = steps
    .map((s: any) => `${s.title ?? s.name ?? s.id ?? ""}: ${(s.description ?? s.body ?? "").toString()}`)
    .join("\n");
  return `${sectionText}\n${stepText}`.trim().slice(0, 6000); // keep prompt bounded
}

function selectCandidateActions(catalog: Record<string, { listPrice: number }>, text: string) {
  const entries = Object.entries(catalog).map(([key, value]) => ({ key, price: value.listPrice }));
  const lower = text.toLowerCase();
  const matched = entries.filter((e) => lower.includes(e.key.replace("wrkaction-", "")));
  const nonZero = (matched.length > 0 ? matched : entries).filter((e) => e.price > 0);
  return (nonZero.length > 0 ? nonZero : entries).slice(0, 60);
}

function stripJsonComments(input: string) {
  return input.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function parseOpenAiJson(content: string, catalog: Record<string, { listPrice: number }>): EstimateResult {
  try {
    const cleaned = stripJsonComments(content);
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(cleaned);
    const rawActions = Array.isArray(parsed.actions) ? parsed.actions : [];
    const estimatedVolume =
      typeof parsed.estimatedVolume === "number" && parsed.estimatedVolume > 0 ? parsed.estimatedVolume : 1000;
    const complexity: EstimateResult["complexity"] =
      parsed.complexity === "complex_rpa" || parsed.complexity === "complex"
        ? "complex_rpa"
        : parsed.complexity === "medium"
          ? "medium"
          : "basic";
    let actions = rawActions
      .map((a: any) => {
        if (!a || typeof a !== "object" || typeof a.actionType !== "string") return null;
        if (!catalog[a.actionType]) return null;
        const count = typeof a.count === "number" && a.count > 0 ? a.count : 0;
        if (count <= 0) return null;
        return { actionType: a.actionType, count: Math.max(1, Math.round(count)) };
      })
      .filter(Boolean) as Array<{ actionType: string; count: number }>;
    // Fallback if everything was filtered out.
    if (actions.length === 0) {
      actions = FALLBACK_ACTIONS.estimatedActions;
    }
    // Basic validation: if total action cost would be zero (no priced actions), reuse fallback.
    const hasPriced = actions.some((a) => catalog[a.actionType]?.listPrice > 0);
    if (!hasPriced) {
      actions = FALLBACK_ACTIONS.estimatedActions;
    }
    return {
      estimatedActions: actions,
      complexity,
      estimatedVolume,
    };
  } catch {
    return FALLBACK_ACTIONS;
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await requireTenantSession();

    if (!can(session, "automation:version:transition", { type: "automation_version", tenantId: session.tenantId })) {
      throw new ApiError(403, "Forbidden");
    }

    const workflowText = await getWorkflowSummary(session.tenantId, params.id);
    const catalog = await loadWrkActionCatalog();
    const candidates = selectCandidateActions(catalog, workflowText);
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(FALLBACK_ACTIONS);
    }

    const candidateText = candidates
      .map((c) => `${c.key} @ $${c.price.toFixed(4)}`)
      .join("\n")
      .slice(0, 4000);

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      temperature: 0,
      max_tokens: 400,
      messages: [
        {
          role: "system",
      content: `You are a pricing assistant. Select relevant Wrk Actions from the provided list (by id) and estimate how many times each must run to produce ONE successful outcome of the described workflow. Do NOT include comments. Return JSON only in this shape:
{
  "actions": [
    { "actionType": "wrkaction-<id>", "count": <integer> }
  ],
  "estimatedVolume": <integer>, // monthly volume; default 1000 if unknown
  "complexity": "basic" | "medium" | "complex_rpa"
}
Only use actionType values that appear in the provided list. If unsure, pick a small but non-zero count.`,
        },
        {
          role: "user",
          content: `Workflow description:
${workflowText}

Candidate Wrk Actions (id and price):
${candidateText}

Return the JSON only.`,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content ?? "";
    const parsed = parseOpenAiJson(content, catalog);

    // Debug log to help inspect estimation issues
    console.log("[pricing-estimate] automationVersionId", params.id);
    console.log("[pricing-estimate] promptLength", workflowText.length, "candidateCount", candidates.length);
    console.log("[pricing-estimate] openai:response", content);
    console.log("[pricing-estimate] parsed", parsed);

    return NextResponse.json(parsed);
  } catch (error) {
    return handleApiError(error);
  }
}

