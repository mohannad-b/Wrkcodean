import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });
dotenv.config({ override: true });
import { getEmailQueue } from "@/lib/email/queue/bullmq";

async function main() {
  const queue = await getEmailQueue();
  await queue.add("send", {
    kind: "marketing",
    params: {
      audience: ["test@example.com"], // TODO: replace with your recipient list
      templateId: "marketing.welcome",
      variables: {
        firstName: "Sarah",
        ctaLink: "https://app.wrkcopilot.com",
        documentationLink: "https://wrkcopilot.com/docs",
        unsubscribeLink: "https://wrkcopilot.com/unsubscribe",
        privacyLink: "https://wrkcopilot.com/privacy",
        helpLink: "https://wrkcopilot.com/help",
        physicalAddress: "888 Brannan St, San Francisco, CA 94103",
      },
      campaignId: "welcome-v1",
      idempotencyKey: `welcome-test-${Date.now()}`,
    },
  });
  // eslint-disable-next-line no-console
  console.log("Enqueued test email job");
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

