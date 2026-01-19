import { VersionSelector, type VersionOption } from "@/components/ui/VersionSelector";

interface AutomationVersionSelectorProps {
  versionOptions: VersionOption[];
  selectedVersionId: string | null;
  creatingVersion: boolean;
  onVersionChange: (versionId: string) => void;
  onNewVersion: () => void;
}

export function AutomationVersionSelector({
  versionOptions,
  selectedVersionId,
  creatingVersion,
  onVersionChange,
  onNewVersion,
}: AutomationVersionSelectorProps) {
  return (
    <VersionSelector
      currentVersionId={selectedVersionId ?? versionOptions[0]?.id ?? null}
      versions={versionOptions}
      creatingVersion={creatingVersion}
      onChange={onVersionChange}
      onNewVersion={onNewVersion}
    />
  );
}
