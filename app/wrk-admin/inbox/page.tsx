import { requireWrkStaffSession } from "@/lib/api/context";
import { WrkInboxView } from "@/components/wrk-inbox/WrkInboxView";

export const dynamic = "force-dynamic";

export default async function WrkAdminInboxPage() {
  await requireWrkStaffSession();
  return (
    <div className="h-full overflow-hidden">
      <WrkInboxView />
    </div>
  );
}

