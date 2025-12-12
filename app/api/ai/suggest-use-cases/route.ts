import { NextResponse } from "next/server";
import OpenAI from "openai";
import { requireTenantSession, handleApiError } from "@/lib/api/context";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? "",
});

const FALLBACK_SUGGESTIONS = [
  {
    text: "Sync form submissions to CRM with enrichment and alerts",
    description:
      "When a new form is submitted, enrich the contact, create a record in the CRM, and alert the owner in Slack with context.",
  },
  {
    text: "Automate approvals for spend requests",
    description:
      "Route spend requests for approval based on amount and department, log decisions, and notify requesters automatically.",
  },
  {
    text: "Onboard new customers with checklist and messaging",
    description:
      "After a deal closes, create onboarding tasks, schedule kickoff calls, and send welcome messages with next steps.",
  },
  {
    text: "Generate weekly performance snapshots",
    description:
      "Aggregate key metrics each week, generate a summary, and send it to stakeholders via email and Slack.",
  },
  {
    text: "Escalate critical incidents with runbook links",
    description:
      "Detect critical incidents, spin up a command channel, share the runbook, and page the on-call owner.",
  },
  {
    text: "Re-engage inactive users with personalized nudges",
    description:
      "Detect inactivity, segment users, and send tailored email/SMS nudges with helpful tips to drive reactivation.",
  },
];

export async function POST(request: Request) {
  try {
    await requireTenantSession();

    const body = await request.json();
    const context = typeof body.context === "string" ? body.context.trim() : "";

    if (!context) {
      return NextResponse.json({ error: "Context is required" }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ useCases: FALLBACK_SUGGESTIONS });
    }

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'You are an automation architect. Provide up to 6 actionable, platform-specific workflow automations tailored to the user’s context. Each idea must name concrete tools/APIs and include triggers, systems, and outcomes (e.g., "When a lead is created in Salesforce, enrich with Clearbit, post to Slack, open an Asana task"). Respond strictly as JSON with shape: {"useCases":[{"text":"short title","description":"1-2 sentence description"}]}. Do not include any other fields or commentary.',
        },
        {
          role: "user",
          content: `Context for workflows: ${context}`,
        },
      ],
      max_tokens: 700,
    });

    const content = completion.choices[0]?.message?.content;

    if (!content) {
      throw new Error("Failed to generate suggestions");
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      throw new Error("Unable to parse AI suggestions");
    }

    const useCases = Array.isArray(parsed?.useCases) ? parsed.useCases : [];

    if (useCases.length === 0) {
      throw new Error("No AI suggestions returned");
    }

    return NextResponse.json({ useCases: useCases.slice(0, 6) });
  } catch (error) {
    return handleApiError(error);
  }
}


