import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });
dotenv.config({ override: true });

import { getEmailQueue } from "@/lib/email/queue/bullmq";

const CLEAN = process.argv.includes("--clean");
const OBLITERATE = process.argv.includes("--obliterate");

async function main() {
  const q = await getEmailQueue();
  if (CLEAN) {
    // Grace of 0 removes anything older than now; limit 1000 to be safe.
    await q.clean(0, "failed", 1000);
    await q.clean(0, "delayed", 1000);
    await q.clean(0, "completed", 1000);
    await q.clean(0, "wait", 1000);
  }
  if (OBLITERATE) {
    // Forcefully removes all jobs/keys for this queue.
    await q.obliterate({ force: true });
  }
  const counts = await q.getJobCounts();
  const failed = await q.getJobs(["failed"], 0, 10);
  // eslint-disable-next-line no-console
  console.log(counts);
  // eslint-disable-next-line no-console
  console.log(
    "failed jobs",
    failed.map((j) => ({ id: j.id, reason: j.failedReason }))
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

