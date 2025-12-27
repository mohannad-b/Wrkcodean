import { redirect } from "next/navigation";

import auth0 from "@/lib/auth/auth0";
import { NoTenantMembershipError, getSession } from "@/lib/auth/session";
import { suggestBrandingFromDomain } from "@/lib/branding/suggest";
import { WorkspaceSetupClient } from "@/components/workspace-setup/WorkspaceSetupClient";

export const metadata = {
  title: "Workspace setup",
};

const CONSUMER_DOMAINS = ["gmail.com", "outlook.com", "hotmail.com", "yahoo.com", "icloud.com", "proton.me", "protonmail.com", "me.com", "live.com"];

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 50);
}

type Props = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default async function WorkspaceSetupPage({ searchParams }: Props) {
  const simulate = (searchParams?.simulate ?? "") === "1" || (searchParams?.simulate ?? "") === "true";
  const allowSimulate = process.env.NODE_ENV !== "production" && simulate;

  try {
    if (!allowSimulate) {
      await getSession();
    }
    // User already has a tenant membership; send them to the app.
    if (!allowSimulate) {
      return redirect("/dashboard");
    }
  } catch (error) {
    if (error instanceof NoTenantMembershipError) {
      // Expected for first-time SSO users without a workspace; continue into wizard.
    } else if (error instanceof Error && error.message.includes("not authenticated")) {
      if (!allowSimulate) {
        return redirect("/auth/login?returnTo=/workspace-setup");
      }
    } else {
      throw error;
    }
  }

  const authSession = allowSimulate ? null : await auth0.getSession();
  const mockEmail = "demo@acme.com";
  const email = authSession?.user?.email ?? mockEmail;
  const domain = email.includes("@") ? email.split("@")[1] : "";
  const displayName = authSession?.user?.name ?? (allowSimulate ? "Demo User" : email);
  const firstName = displayName.split(" ")[0] ?? displayName;

  const isConsumer = CONSUMER_DOMAINS.includes(domain);
  const fallbackName = `${firstName}'s Workspace`;
  const fallbackSlug = slugify(firstName || "my-workspace");
  const inferred = suggestBrandingFromDomain(domain, fallbackName, fallbackSlug);
  const suggestedName = inferred.name;
  const suggestedSlug = inferred.slug;

  return (
    <WorkspaceSetupClient
      firstName={firstName}
      domain={domain}
      suggestedName={suggestedName}
      suggestedSlug={suggestedSlug}
      isConsumerDomain={isConsumer}
      primaryColor={inferred.primaryColor}
      accentColor={inferred.accentColor}
      simulate={allowSimulate}
    />
  );
}
