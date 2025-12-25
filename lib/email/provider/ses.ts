import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import type { EmailProvider, ProviderSendRequest, ProviderSendResponse } from "@/lib/email/types";

let client: SESv2Client | undefined;

function getClient() {
  if (client) return client;
  const region = process.env.AWS_SES_REGION;
  const accessKeyId = process.env.AWS_SES_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SES_SECRET_ACCESS_KEY;

  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error("AWS SES env vars missing (AWS_SES_REGION, AWS_SES_ACCESS_KEY_ID, AWS_SES_SECRET_ACCESS_KEY)");
  }

  client = new SESv2Client({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
  return client;
}

export class SesProvider implements EmailProvider {
  name = "ses";

  async send(request: ProviderSendRequest): Promise<ProviderSendResponse> {
    if (request.attachments && request.attachments.length > 0) {
      throw new Error("SES provider (simple send) does not support attachments in v1");
    }

    const configurationSet = process.env.AWS_SES_CONFIGURATION_SET;
    const cmd = new SendEmailCommand({
      FromEmailAddress: request.from,
      Destination: { ToAddresses: [request.to] },
      Content: {
        Simple: {
          Subject: { Data: request.subject, Charset: "UTF-8" },
          Body: {
            Html: { Data: request.html, Charset: "UTF-8" },
            Text: { Data: request.text, Charset: "UTF-8" },
          },
        },
      },
      EmailTags: [{ Name: "category", Value: request.category }],
      ConfigurationSetName: configurationSet,
    });

    const res = await getClient().send(cmd);
    return { providerMessageId: res.MessageId ?? "unknown" };
  }
}

