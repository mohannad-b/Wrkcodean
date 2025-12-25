import type { EmailProvider, ProviderSendRequest, ProviderSendResponse } from "@/lib/email/types";

function assertEnv(value: string | undefined, name: string) {
  if (!value) throw new Error(`${name} not set`);
  return value;
}

export class MailgunProvider implements EmailProvider {
  name = "mailgun";

  async send(request: ProviderSendRequest): Promise<ProviderSendResponse> {
    const apiKey = assertEnv(process.env.MAILGUN_API_KEY, "MAILGUN_API_KEY");
    const domain = assertEnv(process.env.MAILGUN_DOMAIN, "MAILGUN_DOMAIN");
    const apiBase = process.env.MAILGUN_API_BASE || "https://api.mailgun.net";

    const form = new FormData();
    form.append("from", request.from);
    form.append("to", request.to);
    form.append("subject", request.subject);
    form.append("html", request.html);
    form.append("text", request.text);
    form.append("o:tag", request.category);
    if (request.headers) {
      for (const [key, value] of Object.entries(request.headers)) {
        form.append(`h:${key}`, value);
      }
    }
    if (request.attachments) {
      for (const att of request.attachments) {
        const buffer = Buffer.from(att.content, "base64");
        form.append("attachment", new Blob([buffer], { type: att.mimeType ?? "application/octet-stream" }), att.filename);
      }
    }

    const res = await fetch(`${apiBase}/v3/${domain}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString("base64")}`,
      },
      body: form,
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Mailgun send failed: ${res.status} ${body}`);
    }

    const data = (await res.json()) as { id: string };
    return { providerMessageId: data.id };
  }
}

