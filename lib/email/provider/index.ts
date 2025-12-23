import { PostmarkProvider } from "@/lib/email/provider/postmark";
import { SesProvider } from "@/lib/email/provider/ses";
import type { EmailProvider, ProviderSendRequest, ProviderSendResponse } from "@/lib/email/types";

function buildProviders(): EmailProvider[] {
  const configured = (process.env.EMAIL_PROVIDERS || "postmark,ses")
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);

  const providers: EmailProvider[] = [];
  for (const name of configured) {
    if (name === "postmark") providers.push(new PostmarkProvider());
    if (name === "ses") providers.push(new SesProvider());
  }

  if (providers.length === 0) {
    throw new Error("No email providers configured; set EMAIL_PROVIDERS env");
  }
  return providers;
}

const providers = buildProviders();

export async function sendWithRoundRobin(
  request: ProviderSendRequest,
  startIndex = 0
): Promise<{ response: ProviderSendResponse; provider: EmailProvider }> {
  let lastError: unknown;
  for (let i = 0; i < providers.length; i++) {
    const provider = providers[(startIndex + i) % providers.length];
    try {
      const response = await provider.send(request);
      return { response, provider };
    } catch (error) {
      lastError = error;
      continue;
    }
  }
  throw lastError ?? new Error("Email send failed for all providers");
}

export function getProviders() {
  return providers;
}

