import type { ToastOptions } from "@/components/ui/use-toast";

type CreateVersionArgs = {
  automationId: string;
  copyFromVersionId?: string | null;
  notes: string;
  selectedVersion: {
    summary: string | null;
    intakeNotes: string | null;
  } | null;
  fetchAutomation: (options?: { preserveSelection?: boolean }) => Promise<void>;
  setSelectedVersionId: (id: string) => void;
  toast: (toast: ToastOptions) => void;
};

/**
 * Creates a new automation version, refreshes data, and focuses the newly created version.
 * Used by both "Start New Version" entry points.
 */
export async function createVersionWithRedirect({
  automationId,
  copyFromVersionId,
  notes,
  selectedVersion,
  fetchAutomation,
  setSelectedVersionId,
  toast,
}: CreateVersionArgs) {
  const versionId = typeof copyFromVersionId === "string" ? copyFromVersionId : null;

  const response = await fetch(`/api/automations/${automationId}/versions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: selectedVersion?.summary ?? "",
      intakeNotes: versionId ? selectedVersion?.intakeNotes ?? notes : notes,
      copyFromVersionId: versionId,
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload.error ?? "Unable to create version";
    throw new Error(message);
  }

  const newVersionId = typeof payload.version?.id === "string" ? payload.version.id : null;

  await fetchAutomation({ preserveSelection: true });

  if (newVersionId) {
    setSelectedVersionId(newVersionId);
  }

  toast({
    title: "New version created",
    description: versionId ? "A new version copied from the current version is ready." : "A draft version is ready.",
    variant: "success",
  });
}

