import type { EmailProvider, ProviderSendRequest, ProviderSendResponse } from "@/lib/email/types";

export class SesProvider implements EmailProvider {
  name = "ses";

  async send(_request: ProviderSendRequest): Promise<ProviderSendResponse> {
    // Placeholder to avoid introducing AWS SDK dependency now.
    throw new Error("SES provider not implemented yet");
  }
}

