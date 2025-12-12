import { NextResponse } from "next/server";
import OpenAI from "openai";
import { requireTenantSession, handleApiError } from "@/lib/api/context";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? "",
});

export async function POST(request: Request) {
  try {
    await requireTenantSession();

    const body = await request.json();
    const description = typeof body.description === "string" ? body.description.trim() : null;
    const expansionLevel =
      typeof body.expansionLevel === "string" ? body.expansionLevel.trim().toLowerCase() : "medium";

    if (!description || description.length === 0) {
      return NextResponse.json({ error: "Description is required" }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 500 });
    }

    const expansionStyles: Record<string, string> = {
      basic:
        "Fill obvious gaps, clarify intent, and add missing but implied details. Keep length close to the original without over-expanding.",
      medium:
        "Polish and enrich the description. Add structure, key steps, data inputs/outputs, and typical decision points. Moderate length increase is fine.",
      expert:
        "Fully build out the workflow end-to-end with triggers, actors, systems, inputs/outputs, success criteria, edge cases, and sequencing. Make it actionable and comprehensive.",
    };

    const level = expansionStyles[expansionLevel] ? expansionLevel : "medium";

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content: `You are a helpful assistant that expands process descriptions for automation workflows. 
Your task is to take a brief or high-level process description and expand it into a more detailed, thorough description.

Guidelines:
- Keep the original intent and meaning
- Add more specific details about triggers, steps, systems, and outcomes
- Include information about data flow, decision points, and integrations
- Make it more actionable and complete
- Maintain a professional, clear tone
- Do not add information that wasn't implied in the original description
- Return only the expanded description, no additional commentary`,
        },
        {
          role: "user",
          content: `Expansion style: ${expansionStyles[level]}

Expand this process description with more detail:\n\n${description}`,
        },
      ],
      max_tokens: 1000,
    });

    const expandedDescription = completion.choices[0]?.message?.content?.trim();

    if (!expandedDescription) {
      return NextResponse.json({ error: "Failed to generate expanded description" }, { status: 500 });
    }

    return NextResponse.json({ expandedDescription });
  } catch (error) {
    return handleApiError(error);
  }
}

