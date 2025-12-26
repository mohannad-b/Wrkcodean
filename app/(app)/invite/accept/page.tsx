"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, Mail, ShieldCheck } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";

type Status = "idle" | "loading" | "success" | "error";

export default function AcceptInvitePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = useMemo(() => searchParams.get("token") ?? "", [searchParams]);

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setError("Invite token is missing.");
      return;
    }

    const accept = async () => {
      setStatus("loading");
      setError(null);
      try {
        const res = await fetch("/api/workspaces/invites/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const json = await res.json();
        if (!res.ok) {
          const message = json?.error ?? "Unable to accept invite.";
          setError(message);
          setStatus("error");
          return;
        }

        setStatus("success");
        setTimeout(() => {
          router.replace("/app/workspace-settings?tab=teams");
        }, 800);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unexpected error accepting invite.");
        setStatus("error");
      }
    };

    accept().catch(() => null);
  }, [router, token]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-xl rounded-2xl border border-gray-200 bg-white shadow-sm p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-red-50 text-[#E43632] flex items-center justify-center">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#0A0A0A]">Accept workspace invite</h1>
            <p className="text-sm text-gray-500">We’re finishing setting up your access.</p>
          </div>
        </div>

        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 flex items-center gap-3 text-sm text-gray-700">
          <Mail className="h-4 w-4 text-gray-500" />
          <span>{token ? `Token: ${token.slice(0, 6)}•••${token.slice(-4)}` : "Awaiting token"}</span>
        </div>

        <div className="space-y-3 text-sm text-gray-700">
          {status === "loading" && (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-[#E43632]" />
              <span>Verifying your invite…</span>
            </div>
          )}

          {status === "success" && (
            <div className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="h-5 w-5" />
              <span>Invite accepted. Redirecting to your workspace…</span>
            </div>
          )}

          {status === "error" && (
              <div className="flex flex-col gap-2 text-red-600">
                <span>{error ?? "Unable to accept invite."}</span>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => router.push("/")}>
                    Sign in
                  </Button>
                  <Button onClick={() => router.refresh()}>Try again</Button>
                </div>
              </div>
          )}
        </div>
      </div>
    </div>
  );
}

