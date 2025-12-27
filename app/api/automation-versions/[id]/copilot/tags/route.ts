import { NextResponse } from "next/server";
import OpenAI from "openai";
import { can } from "@/lib/auth/rbac";
import { ApiError, handleApiError, requireTenantSession } from "@/lib/api/context";
import { getAutomationVersionDetail } from "@/lib/services/automations";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? "",
});

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireTenantSession();

    if (!can(session, "automation:read", { type: "automation_version", tenantId: session.tenantId })) {
      throw new ApiError(403, "Forbidden");
    }

    if (!process.env.OPENAI_API_KEY) {
      throw new ApiError(500, "OpenAI API key not configured");
    }

    const detail = await getAutomationVersionDetail(session.tenantId, params.id);
    if (!detail) {
      throw new ApiError(404, "Automation version not found");
    }

    const contextParts = [
      detail.automation?.name ? `Name: ${detail.automation.name}` : null,
      detail.automation?.description ? `Description: ${detail.automation.description}` : null,
      detail.version.summary ? `Summary: ${detail.version.summary}` : null,
      detail.version.requirementsText ? `Requirements: ${detail.version.requirementsText.slice(0, 1200)}` : null,
    ].filter(Boolean);

    const prompt = [
      "Generate tags for this automation.",
      "Return a JSON array with exactly three strings in this order: [Department, Business Outcome, Complexity].",
      "Department examples: Sales, Marketing, Support, Finance, Ops, HR, IT, Product, Engineering.",
      "Business Outcome options: Efficiency, Productivity, Innovation, Compliance, Quality, Cost Savings, Risk Reduction, Revenue Growth, Customer Experience.",
      "Complexity options: Easy, Medium, Complex.",
      "Use Title Case, 1-3 words each. Avoid private data, boilerplate, or quotes.",
      contextParts.join("\n"),
    ]
      .filter(Boolean)
      .join("\n\n");

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content:
            "You return only JSON arrays of short tags for automation workflows. Keep tags specific, 1-3 words, Title Case.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 200,
    });

    const raw = completion.choices[0]?.message?.content ?? "[]";
    const tags = coerceToStructuredTags(normalizeTags(raw));

    if (tags.length === 0) {
      throw new ApiError(500, "No tags generated");
    }

    return NextResponse.json({ tags });
  } catch (error) {
    return handleApiError(error);
  }
}

function normalizeTags(content: string): string[] {
  let cleaned = content.trim();

  // Strip markdown fences and leading language hints (```json)
  cleaned = cleaned.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
  cleaned = cleaned.replace(/^json\s*:/i, "").trim();

  let parsed: unknown = cleaned;

  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // fall through to string parsing
  }

  const candidateArray: string[] =
    Array.isArray(parsed) && parsed.every((item) => typeof item === "string")
      ? (parsed as string[])
      : cleaned.split(/[,;\n]/).map((item) => item.trim());

  const unique = new Set(
    candidateArray
      .map((tag) => tag.trim())
      .map((tag) => tag.replace(/[`"'“”‘’\[\]]/g, ""))
      .map((tag) => tag.replace(/^[-*]\s*/, "")) // bullet prefixes
      .map((tag) => tag.replace(/\s+/g, " ").trim())
      .map((tag) => tag.replace(/:$/, "")) // trailing colon
      .filter((tag) => tag.length > 0)
      .filter((tag) => !/^(json|tags?)$/i.test(tag))
  );

  return Array.from(unique).slice(0, 8);
}

function coerceToStructuredTags(candidates: string[]): string[] {
  const departments = [
    "Sales",
    "Marketing",
    "Support",
    "Finance",
    "Operations",
    "Ops",
    "HR",
    "IT",
    "Product",
    "Engineering",
    "Legal",
  ];
  const outcomesMap: Record<string, string> = {
    efficiency: "Efficiency",
    productivity: "Productivity",
    innovation: "Innovation",
    compliance: "Compliance",
    quality: "Quality",
    "cost savings": "Cost Savings",
    cost: "Cost Savings",
    "risk reduction": "Risk Reduction",
    risk: "Risk Reduction",
    "revenue growth": "Revenue Growth",
    growth: "Revenue Growth",
    "customer experience": "Customer Experience",
    cx: "Customer Experience",
  };
  const complexityAllowed = ["Easy", "Medium", "Complex"];

  const normalized = candidates.map((tag) => normalizeWord(tag));

  const pickFromList = (list: string[]) => {
    for (const cand of normalized) {
      const match = list.find((item) => item.toLowerCase() === cand.toLowerCase());
      if (match) return match;
    }
    return null;
  };

  const pickOutcome = () => {
    for (const cand of normalized) {
      const canonical = outcomesMap[cand.toLowerCase()];
      if (canonical) return canonical;
    }
    return null;
  };

  const department = pickFromList(departments) ?? "Operations";
  const outcome = pickOutcome() ?? "Efficiency";
  const complexity = pickFromList(complexityAllowed) ?? "Medium";

  return [department, outcome, complexity];
}

function normalizeWord(tag: string): string {
  const cleaned = tag.replace(/[^a-z0-9\s]/gi, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  return cleaned
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}
