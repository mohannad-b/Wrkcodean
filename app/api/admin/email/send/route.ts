import { NextResponse } from "next/server";
import { getTemplate } from "@/lib/email/templates/registry";
import { EmailService } from "@/lib/email/service";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { to, templateId, variables, campaignId } = body ?? {};

    if (!to || typeof to !== "string") {
      return NextResponse.json({ error: "Missing or invalid 'to'" }, { status: 400 });
    }
    if (!templateId || typeof templateId !== "string") {
      return NextResponse.json({ error: "Missing or invalid 'templateId'" }, { status: 400 });
    }

    const template = getTemplate(templateId);
    const idempotencyKey = `${templateId}:${to}:${Date.now()}`;

    if (template.category === "marketing") {
      await EmailService.sendMarketing({
        audience: [to],
        templateId,
        variables,
        campaignId: campaignId ?? "admin-manual",
        idempotencyKey,
      });
    } else if (template.category === "notification") {
      await EmailService.sendNotification({
        to,
        templateId,
        variables,
        idempotencyKey,
      });
    } else {
      await EmailService.sendTransactional({
        to,
        templateId,
        variables,
        idempotencyKey,
      });
    }

    return NextResponse.json({ ok: true, templateId, to });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

