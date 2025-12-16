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
      "When a new form is submitted, enrich the contact with Clearbit, create a Lead in Salesforce, push the MQL to HubSpot, and alert the owner in Slack with score and source context.",
  },
  {
    text: "Automate approvals for spend requests",
    description:
      "Route spend requests from Coupa based on amount and department, collect approvals in Slack, update the request status in NetSuite, and notify requesters automatically with the decision trail.",
  },
  {
    text: "Onboard new customers with checklist and messaging",
    description:
      "After a deal closes in Salesforce, create onboarding tasks in Asana, schedule a kickoff in Google Calendar, provision the account in Stripe, and send welcome emails via SendGrid with next steps.",
  },
  {
    text: "Generate weekly performance snapshots",
    description:
      "Pull weekly KPIs from Snowflake and Looker dashboards, generate a PDF/slide snapshot, post to a Slack channel, and email budget owners with variance highlights.",
  },
  {
    text: "Escalate critical incidents with runbook links",
    description:
      "When Datadog triggers a P1 alert, open a Slack incident channel, attach the PagerDuty runbook, create a Jira issue with logs, and page the on-call owner.",
  },
  {
    text: "Re-engage inactive users with personalized nudges",
    description:
      "Detect 14-day inactivity in Segment, cohort users by plan/tier, send personalized email/SMS nudges via Customer.io, and update the reactivation experiment dashboard in Amplitude.",
  },
];

export async function POST(request: Request) {
  try {
    await requireTenantSession();

    const body = await request.json();
    const context = typeof body.context === "string" ? body.context.trim() : "";
    const selectedSystem = typeof body.selectedSystem === "string" ? body.selectedSystem.trim() : null;
    const availableSystems = Array.isArray(body.availableSystems) ? body.availableSystems : null;

    if (!context) {
      return NextResponse.json({ error: "Context is required" }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ useCases: FALLBACK_SUGGESTIONS });
    }

    // Build system context for the prompt
    let systemContext = "";
    if (selectedSystem) {
      systemContext = `The user has specifically selected the system: ${selectedSystem}. Prioritize workflows that prominently feature ${selectedSystem} as a primary integration point.`;
    } else if (availableSystems && availableSystems.length > 0) {
      systemContext = `Common systems used in this context include: ${availableSystems.join(", ")}. When generating workflows, prioritize using these specific systems in your suggestions. Include actual system names (like ${availableSystems.slice(0, 3).join(", ")}) in both titles and descriptions.`;
    }

    const userPrompt = [
      `Context for workflows: ${context}`,
      systemContext,
    ].filter(Boolean).join("\n\n");

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'You are an automation architect. Provide up to 6 detailed, platform-specific workflow automations tailored to the user\'s context (industry and/or department). Each idea must: (1) include a clear trigger, (2) explicitly name specific systems/platforms in both the title and description (use actual system names like Shopify, Salesforce, QuickBooks, Xero, Epic, Zendesk, Stripe, etc. - avoid generic terms like "e-commerce platform" or "accounting software"), (3) describe 2–3 concrete steps with data passed between named systems, and (4) state the end outcome/owner update. IMPORTANT: Create descriptive, detailed titles (the "text" field) that include the trigger/source system, main processing actions, and destination systems - similar to examples like "Process invoices from Gmail, extract data with OCR, and create entries in Xero" or "Sync Shopify orders to QuickBooks and send confirmation emails via Gmail". Always use specific system names rather than generic descriptions. Titles should be specific and informative, not generic. Keep descriptions to 2 sentences max. Respond strictly as JSON with shape: {"useCases":[{"text":"descriptive detailed title with specific system names","description":"1-2 sentence description with specific system names"}]} with no other fields or commentary.',
        },
        {
          role: "user",
          content: userPrompt,
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


