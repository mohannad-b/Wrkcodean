import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });
dotenv.config({ override: true });
import { getEmailWorker } from "@/lib/email/queue/bullmq";
import { EmailService } from "@/lib/email/service";

type TransactionalParams = Parameters<typeof EmailService.sendTransactional>[0];
type NotificationParams = Parameters<typeof EmailService.sendNotification>[0];
type MarketingParams = Parameters<typeof EmailService.sendMarketing>[0];

type JobData =
  | { kind: "transactional"; params: TransactionalParams }
  | { kind: "notification"; params: NotificationParams }
  | { kind: "marketing"; params: MarketingParams };

async function main() {
  await getEmailWorker(async (job) => {
    const data = job.data as JobData;
    switch (data.kind) {
      case "transactional":
        return EmailService.sendTransactional(data.params);
      case "notification":
        return EmailService.sendNotification(data.params);
      case "marketing":
        return EmailService.sendMarketing(data.params);
      default:
        throw new Error(`Unknown job kind: ${(data as { kind?: string }).kind ?? "undefined"}`);
    }
  });

  // eslint-disable-next-line no-console
  console.log("Email worker started");
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Email worker failed to start", err);
  process.exit(1);
});

