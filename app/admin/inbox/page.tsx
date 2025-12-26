"use client";

import { redirect } from "next/navigation";

export default function LegacyWrkInboxRedirect() {
  redirect("/wrk-admin/inbox");
}

