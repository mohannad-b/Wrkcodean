import type { EmailProvider, ProviderSendRequest, ProviderSendResponse } from "@/lib/email/types";

export class PostmarkProvider implements EmailProvider {
  name = "postmark";

  async send(request: ProviderSendRequest): Promise<ProviderSendResponse> {
    const token = process.env.POSTMARK_SERVER_TOKEN;
    if (!token) {
      throw new Error("POSTMARK_SERVER_TOKEN not set");
    }

    const payload = {
      From: request.from,
      To: request.to,
      Subject: request.subject,
      HtmlBody: request.html,
      TextBody: request.text,
      MessageStream: request.category === "marketing" ? "broadcast" : "outbound",
      Headers: Object.entries(request.headers || {}).map(([Name, Value]) => ({ Name, Value })),
      Metadata: request.metadata,
      Attachments: request.attachments?.map((att) => ({
        Name: att.filename,
        Content: att.content,
        ContentType: att.mimeType ?? "application/octet-stream",
      })),
    };

    const res = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Postmark-Server-Token": token,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Postmark send failed: ${res.status} ${body}`);
    }

    const data = (await res.json()) as { MessageID: string };
    return { providerMessageId: data.MessageID };
  }
}

