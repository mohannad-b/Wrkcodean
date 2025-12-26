"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import type { WrkStaffRole } from "@/db/schema";

const defaultRole: WrkStaffRole = "wrk_viewer";

export function AddStaffForm() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WrkStaffRole>(defaultRole);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();
  const toast = useToast();

  async function submit() {
    if (!email.trim()) {
      toast({ title: "Email required", variant: "error" });
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/platform/staff/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      if (!res.ok) {
        const text = await res.text();
        let message = "Failed to send invite";
        try {
          const body = JSON.parse(text);
          message = body.error || message;
        } catch {
          message = text || message;
        }
        throw new Error(message);
      }
      toast({ title: "Invite sent", variant: "success" });
      setEmail("");
      setRole(defaultRole);
      router.refresh();
    } catch (error) {
      toast({ title: "Action failed", description: (error as Error).message, variant: "error" });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Input
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-64"
      />
      <Select value={role} onValueChange={(val) => setRole(val as WrkStaffRole)}>
        <SelectTrigger className="w-48">
          <SelectValue placeholder="Role" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="wrk_master_admin">Master Admin</SelectItem>
          <SelectItem value="wrk_admin">Admin</SelectItem>
          <SelectItem value="wrk_operator">Operator</SelectItem>
          <SelectItem value="wrk_viewer">Viewer</SelectItem>
        </SelectContent>
      </Select>
      <Button onClick={submit} disabled={isSubmitting}>
        Add Staff
      </Button>
    </div>
  );
}

