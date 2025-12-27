"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type State = { status: "loading" | "success" | "error"; message?: string };

export default function StaffInviteAcceptPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams?.get("token");
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    async function accept() {
      if (!token) {
        setState({ status: "error", message: "Missing invite token." });
        return;
      }
      try {
        const res = await fetch("/api/platform/staff/invite/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (res.status === 401) {
          const returnTo = `/invite/staff/accept?token=${encodeURIComponent(token)}`;
          window.location.href = `/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
          return;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Unable to accept invite.");
        }
        setState({ status: "success" });
      } catch (error) {
        setState({ status: "error", message: (error as Error).message });
      }
    }
    accept();
  }, [token]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle>Staff Invitation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {state.status === "loading" && <p className="text-sm text-muted-foreground">Accepting your invite…</p>}
          {state.status === "success" && (
            <>
              <p className="text-sm text-green-700">You’re all set. Your staff access is active.</p>
            <Button className="w-full" onClick={() => router.push("/wrk-admin/workspaces")}>
                Go to Admin
              </Button>
            </>
          )}
          {state.status === "error" && (
            <>
              <p className="text-sm text-red-600">{state.message ?? "Unable to accept invite."}</p>
              <Button variant="outline" className="w-full" onClick={() => router.push("/")}>
                Back to home
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

