"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Settings,
  Users,
  Shield,
  CreditCard,
  History,
  Bell,
  Save,
  HardDrive,
  Plus,
  XCircle,
  X,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  CreditCard as CardIcon,
  ExternalLink,
  FileText,
  Archive as ArchiveIcon,
  Trash2,
  Slack,
  Mail,
  Loader2,
  Sparkles,
} from "lucide-react";
import { motion } from "motion/react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";

// Mock Data
const USAGE_DATA = Array.from({ length: 30 }, (_, i) => ({
  day: `Day ${i + 1}`,
  units: Math.floor(Math.random() * 500) + 100,
}));

const USERS = [
  {
    id: 1,
    name: "Sarah Chen",
    email: "sarah@company.com",
    role: "Owner",
    avatar: "https://github.com/shadcn.png",
  },
  { id: 2, name: "Mike Ross", email: "mike@company.com", role: "Editor", avatar: "" },
  { id: 3, name: "Jessica Pearson", email: "jessica@company.com", role: "Viewer", avatar: "" },
];

const VERSIONS = [
  {
    id: "v1.1",
    status: "building",
    date: "Nov 12, 2023",
    summary: "Delta: +3 steps, +1 integration",
    author: "Sarah Chen",
  },
  {
    id: "v1.0",
    status: "active",
    date: "Oct 24, 2023",
    summary: "Initial Release",
    author: "Sarah Chen",
  },
  {
    id: "v0.9",
    status: "superseded",
    date: "Oct 10, 2023",
    summary: "Beta Release",
    author: "Mike Ross",
  },
];

const SYSTEMS = [
  {
    id: 1,
    name: "Salesforce",
    icon: "cloud",
    status: "connected",
    usage: "Create Opp, Update Contact",
  },
  { id: 2, name: "Xero", icon: "file-text", status: "attention", usage: "Create Draft Bill" },
  {
    id: 3,
    name: "Google Drive",
    icon: "hard-drive",
    status: "connected",
    usage: "Store PDF Reports",
  },
];

type SettingsTabType =
  | "general"
  | "permissions"
  | "systems"
  | "billing"
  | "versions"
  | "notifications"
  | "data";

interface SettingsTabProps {
  onInviteUser?: () => void;
  onAddSystem?: () => void;
  onNewVersion?: (copyFromVersionId?: string | null) => void;
  onManageCredentials?: (systemName: string) => void;
  onNavigateToTab?: (tab: string) => void;
  onNavigateToSettings?: () => void;
  automationId?: string | null;
  automationName?: string;
  automationDescription?: string | null;
  tags?: string[];
  automationCreatedAt?: string | null;
  automationUpdatedAt?: string | null;
  onGeneralSaved?: () => void;
  currentVersionId?: string | null;
  versions?: Array<{
    id: string;
    versionLabel?: string | null;
    status?: string;
    summary?: string | null;
    updatedAt?: string | null;
    latestQuote?: { status?: string | null } | null;
  }>;
  onArchiveVersion?: (versionId: string) => Promise<void> | void;
  onDeleteVersion?: (versionId: string) => Promise<void> | void;
  archivingVersionId?: string | null;
  deletingVersionId?: string | null;
  creatingVersion?: boolean;
}

export function SettingsTab({
  onInviteUser,
  onAddSystem,
  onNewVersion,
  onManageCredentials,
  onNavigateToTab,
  onNavigateToSettings,
  automationId,
  automationName,
  automationDescription,
  tags,
  automationCreatedAt,
  automationUpdatedAt,
  onGeneralSaved,
  currentVersionId,
  versions = [],
  onArchiveVersion,
  onDeleteVersion,
  archivingVersionId,
  deletingVersionId,
  creatingVersion,
}: SettingsTabProps = {}) {
  const [activeTab, setActiveTab] = useState<SettingsTabType>("general");
  const toast = useToast();

  const [name, setName] = useState<string>(automationName ?? "");
  const [description, setDescription] = useState<string>(automationDescription ?? "");
  const [tagList, setTagList] = useState<string[]>(tags ?? []);
  const [savingGeneral, setSavingGeneral] = useState(false);
  const [generatingTags, setGeneratingTags] = useState(false);

  const initialState = useMemo(
    () => ({
      name: automationName ?? "",
      description: automationDescription ?? "",
      tags: (tags ?? []).filter(Boolean),
    }),
    [automationName, automationDescription, tags]
  );

  useEffect(() => {
    setName(initialState.name);
    setDescription(initialState.description);
    setTagList(initialState.tags);
  }, [initialState]);

  const tagsEqual = useCallback((a: string[], b: string[]) => {
    const normalize = (arr: string[]) => Array.from(new Set(arr.map((tag) => tag.trim()).filter(Boolean))).sort();
    const left = normalize(a);
    const right = normalize(b);
    if (left.length !== right.length) return false;
    return left.every((value, idx) => value === right[idx]);
  }, []);

  const generalDirty = useMemo(() => {
    return (
      name.trim() !== initialState.name.trim() ||
      (description ?? "").trim() !== (initialState.description ?? "").trim() ||
      !tagsEqual(tagList, initialState.tags)
    );
  }, [description, initialState.description, initialState.name, initialState.tags, name, tagList, tagsEqual]);

  const handleSaveGeneral = useCallback(async () => {
    if (!currentVersionId) {
      toast({ title: "Select a version", description: "Choose a version before saving settings.", variant: "error" });
      return;
    }
    setSavingGeneral(true);
    try {
      const response = await fetch(`/api/automation-versions/${currentVersionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          automationName: name.trim(),
          automationDescription: description?.trim() ?? null,
          tags: tagList,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Unable to save settings");
      }
      toast({ title: "Settings saved", description: "General details updated.", variant: "success" });
      onGeneralSaved?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to save settings";
      toast({ title: "Save failed", description: message, variant: "error" });
    } finally {
      setSavingGeneral(false);
    }
  }, [currentVersionId, description, name, onGeneralSaved, tagList, toast]);

  const handleGenerateTags = useCallback(async () => {
    if (!currentVersionId) {
      toast({ title: "Select a version", description: "Choose a version before generating tags.", variant: "error" });
      return;
    }
    setGeneratingTags(true);
    try {
      const response = await fetch(`/api/automation-versions/${currentVersionId}/copilot/tags`, {
        method: "POST",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Unable to generate tags");
      }
      const data = await response.json();
      const generated = Array.isArray(data.tags) ? data.tags : [];
      setTagList(generated);
      toast({ title: "Tags generated", description: "LLM tags were applied.", variant: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to generate tags";
      toast({ title: "Generation failed", description: message, variant: "error" });
    } finally {
      setGeneratingTags(false);
    }
  }, [currentVersionId, toast]);

  const handleAddTag = useCallback((tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed) return;
    setTagList((prev) => Array.from(new Set([...prev, trimmed])).slice(0, 12));
  }, []);

  const handleRemoveTag = useCallback((tag: string) => {
    setTagList((prev) => prev.filter((t) => t !== tag));
  }, []);

  const tabs = [
    { id: "general", label: "General", icon: Settings },
    { id: "permissions", label: "Permissions", icon: Users },
    { id: "systems", label: "Systems & Access", icon: HardDrive },
    { id: "billing", label: "Billing & Usage", icon: CreditCard },
    { id: "versions", label: "Versions", icon: History },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "data", label: "Data & Risk", icon: Shield },
  ];

  return (
    <div className="flex h-full bg-gray-50/50">
      {/* Left Navigation */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col h-full">
        <div className="p-6 pb-2">
          <h2 className="text-lg font-bold text-[#0A0A0A]">Settings</h2>
          <p className="text-xs text-gray-500">Manage automation configuration</p>
        </div>
        <div className="flex-1 py-4 px-3 space-y-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as SettingsTabType)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "bg-red-50 text-[#E43632]"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <tab.icon size={18} />
              {tab.label}
            </button>
          ))}
        </div>
        <div className="p-4 border-t border-gray-100">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-xs font-medium text-gray-600">All Systems Operational</span>
          </div>
        </div>
      </div>

      {/* Right Content */}
      <div className="flex-1 overflow-y-auto p-8 md:p-12">
        <div className="max-w-4xl mx-auto">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === "general" && (
              <GeneralSettings
                name={name}
                description={description}
                tags={tagList}
                createdAt={automationCreatedAt}
                updatedAt={automationUpdatedAt}
                saving={savingGeneral}
                generatingTags={generatingTags}
                dirty={generalDirty}
                versionPresent={Boolean(currentVersionId)}
                onNameChange={setName}
                onDescriptionChange={setDescription}
                onAddTag={handleAddTag}
                onRemoveTag={handleRemoveTag}
                onGenerateTags={handleGenerateTags}
                onSave={handleSaveGeneral}
              />
            )}
            {activeTab === "notifications" && <NotificationsSettings />}
            {activeTab === "permissions" && <PermissionsSettings onInvite={onInviteUser} />}
            {activeTab === "systems" && (
              <SystemsSettings
                onAddSystem={onAddSystem}
                onManageCredentials={onManageCredentials}
              />
            )}
            {activeTab === "billing" && <BillingSettings onUpdatePayment={onNavigateToSettings} />}
            {activeTab === "versions" && (
              <VersionsSettings
                onNewVersion={onNewVersion}
                currentVersionId={currentVersionId}
                onNavigateToOverview={() => onNavigateToTab?.("Overview")}
                onNavigateToTab={onNavigateToTab}
                versions={versions}
                onArchiveVersion={onArchiveVersion}
                onDeleteVersion={onDeleteVersion}
                archivingVersionId={archivingVersionId}
                deletingVersionId={deletingVersionId}
              />
            )}
            {activeTab === "data" && <DataSettings />}
          </motion.div>
        </div>
      </div>
    </div>
  );
}

// General Settings
function GeneralSettings({
  name,
  description,
  tags,
  createdAt,
  updatedAt,
  saving,
  generatingTags,
  dirty,
  versionPresent,
  onNameChange,
  onDescriptionChange,
  onAddTag,
  onRemoveTag,
  onGenerateTags,
  onSave,
}: {
  name: string;
  description: string;
  tags: string[];
  createdAt?: string | null;
  updatedAt?: string | null;
  saving: boolean;
  generatingTags: boolean;
  dirty: boolean;
  versionPresent: boolean;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onAddTag: (value: string) => void;
  onRemoveTag: (value: string) => void;
  onGenerateTags: () => void;
  onSave: () => void;
}) {
  const [tagInput, setTagInput] = useState("");

  const handleAdd = () => {
    if (!tagInput.trim()) return;
    onAddTag(tagInput);
    setTagInput("");
  };

  const formatDate = (value?: string | null) => {
    if (!value) return "—";
    try {
      return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
    } catch {
      return value;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-xl font-bold text-[#0A0A0A]">General Information</h3>
        <Button
          className="bg-[#0A0A0A] hover:bg-gray-800 text-white"
          disabled={saving || !dirty || !versionPresent}
          onClick={onSave}
        >
          {saving ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Save size={16} className="mr-2" />} Save
          Changes
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-6">
        <div className="grid gap-6">
          <div className="space-y-2">
            <Label className="text-sm font-bold text-gray-700">Automation Name</Label>
            <Input value={name} onChange={(e) => onNameChange(e.target.value)} className="font-medium" />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-bold text-gray-700">Description</Label>
            <Textarea
              className="min-h-[100px] resize-none"
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder="Describe the automation goal and scope."
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-bold text-gray-700 flex items-center justify-between">
              Tags
              <Button
                variant="ghost"
                size="sm"
                className="text-xs gap-1 text-gray-600"
                onClick={onGenerateTags}
                disabled={generatingTags || !versionPresent}
              >
                {generatingTags ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                Generate
              </Button>
            </Label>
            <div className="flex flex-wrap gap-2 p-2 border border-gray-200 rounded-md min-h-[42px]">
              {tags.length === 0 ? (
                <span className="text-xs text-gray-400">No tags yet.</span>
              ) : (
                tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="bg-gray-100 text-gray-700 flex items-center gap-1">
                    {tag}
                    <button
                      type="button"
                      className="text-gray-400 hover:text-[#E43632]"
                      onClick={() => onRemoveTag(tag)}
                      aria-label={`Remove ${tag}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))
              )}
              <div className="flex items-center gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAdd();
                    }
                  }}
                  placeholder="Add tag"
                  className="h-8 w-28 text-xs"
                />
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleAdd}
                  className="text-xs bg-[#0A0A0A] hover:bg-gray-800 text-white"
                >
                  Add
                </Button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

// Permissions Settings
function PermissionsSettings({ onInvite }: { onInvite?: () => void } = {}) {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-2">
        <div>
          <h3 className="text-xl font-bold text-[#0A0A0A]">Team & Permissions</h3>
          <p className="text-sm text-gray-500">Manage who can view and edit this automation.</p>
        </div>
        <Button className="bg-[#E43632] hover:bg-[#C12E2A] text-white" onClick={() => onInvite?.()}>
          <Plus size={16} className="mr-2" /> Invite User
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-6 space-y-6">
          {USERS.map((user) => (
            <div key={user.id} className="flex items-center justify-between group">
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarImage src={user.avatar} />
                  <AvatarFallback className="bg-gray-100 text-gray-600 font-bold">
                    {user.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-bold text-[#0A0A0A]">{user.name}</p>
                  <p className="text-xs text-gray-500">{user.email}</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <Select defaultValue={user.role.toLowerCase()}>
                  <SelectTrigger className="w-[130px] h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">Owner</SelectItem>
                    <SelectItem value="editor">Editor</SelectItem>
                    <SelectItem value="contributor">Contributor</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <XCircle size={16} />
                </Button>
              </div>
            </div>
          ))}
        </div>
        <div className="bg-gray-50 p-4 border-t border-gray-100 text-xs text-gray-500 flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5 text-amber-500" />
          <p>
            Note: Only <strong>Owners</strong> can delete this automation. <strong>Editors</strong>{" "}
            can deploy new versions.
          </p>
        </div>
      </div>
    </div>
  );
}

// Systems Settings
function SystemsSettings({
  onAddSystem,
  onManageCredentials,
}: { onAddSystem?: () => void; onManageCredentials?: (systemName: string) => void } = {}) {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-2">
        <div>
          <h3 className="text-xl font-bold text-[#0A0A0A]">Connected Systems</h3>
          <p className="text-sm text-gray-500">Manage authentication and access scopes.</p>
        </div>
        <Button
          variant="outline"
          className="border-gray-200 text-gray-700"
          onClick={() => onAddSystem?.()}
        >
          <Plus size={16} className="mr-2" /> Add New System
        </Button>
      </div>

      <div className="bg-amber-50 border border-amber-100 rounded-lg p-4 flex items-start gap-3 text-amber-800">
        <AlertTriangle size={18} className="mt-0.5 shrink-0" />
        <div className="text-sm">
          <span className="font-bold">Action Required:</span> One or more systems need reconnection.
          Please update credentials to ensure automation continuity.
        </div>
      </div>

      <div className="grid gap-4">
        {SYSTEMS.map((system) => (
          <div
            key={system.id}
            className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex items-center justify-between"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gray-50 rounded-lg flex items-center justify-center text-gray-500 border border-gray-100">
                {system.name === "Salesforce" && (
                  <span className="font-bold text-blue-500">SF</span>
                )}
                {system.name === "Xero" && <span className="font-bold text-blue-400">X</span>}
                {system.name === "Google Drive" && <HardDrive size={20} />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-[#0A0A0A]">{system.name}</h4>
                  {system.status === "connected" ? (
                    <Badge
                      variant="outline"
                      className="text-emerald-600 bg-emerald-50 border-emerald-200 text-[10px] gap-1 px-1.5 py-0 h-5"
                    >
                      <CheckCircle2 size={10} /> Connected
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-amber-600 bg-amber-50 border-amber-200 text-[10px] gap-1 px-1.5 py-0 h-5"
                    >
                      <AlertTriangle size={10} /> Reconnect
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1">Used for: {system.usage}</p>
              </div>
            </div>

            <Button
              variant={system.status === "connected" ? "outline" : "default"}
              className={
                system.status === "connected"
                  ? "border-gray-200 text-gray-600 hover:bg-gray-50"
                  : "bg-[#E43632] hover:bg-[#C12E2A] text-white shadow-sm"
              }
              size="sm"
              onClick={() => onManageCredentials?.(system.name)}
            >
              {system.status === "connected" ? "Manage Access" : "Reconnect Now"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

// Billing Settings
function BillingSettings({ onUpdatePayment }: { onUpdatePayment?: () => void } = {}) {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-xl font-bold text-[#0A0A0A]">Billing & Usage</h3>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span>Next billing date:</span>
          <span className="font-bold text-[#0A0A0A]">Dec 1, 2023</span>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Header / Active Plan */}
        <div className="p-6 border-b border-gray-100 bg-gray-50/50">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-1">
                Active Plan (v1.0)
              </h4>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold text-[#0A0A0A]">$570.00</span>
                <span className="text-sm text-gray-500">/month (est)</span>
              </div>
            </div>
            <div className="flex items-center gap-8 text-sm">
              <div>
                <p className="text-xs text-gray-400 mb-1">Unit Price</p>
                <p className="font-mono font-medium">$0.038 / unit</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">Volume Tier</p>
                <p className="font-mono font-medium">15k units</p>
              </div>
              <Button variant="link" className="text-[#E43632] h-auto p-0">
                View Signed Quote
              </Button>
            </div>
          </div>
        </div>

        {/* Usage Chart */}
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h4 className="font-bold text-[#0A0A0A]">30 Day Consumption</h4>
            <Select defaultValue="30">
              <SelectTrigger className="w-[120px] h-8 text-xs">
                <SelectValue placeholder="Last 30 Days" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">Last 30 Days</SelectItem>
                <SelectItem value="90">Last 90 Days</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={USAGE_DATA}>
                <defs>
                  <linearGradient id="colorUnits" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#E43632" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="#E43632" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="day" hide />
                <YAxis axisLine={false} tickLine={false} fontSize={12} tick={{ fill: "#9ca3af" }} />
                <RechartsTooltip
                  contentStyle={{
                    borderRadius: "8px",
                    border: "none",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                  }}
                  labelStyle={{ color: "#6b7280", fontSize: "12px" }}
                />
                <Area
                  type="monotone"
                  dataKey="units"
                  stroke="#E43632"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorUnits)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Payment Method */}
        <div className="p-6 border-t border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-8 bg-gray-100 rounded border border-gray-200 flex items-center justify-center">
              <CardIcon size={16} className="text-gray-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-[#0A0A0A]">Visa ending in 4242</p>
              <p className="text-xs text-gray-500">Expires 12/25</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="text-gray-600"
            onClick={() => onUpdatePayment?.()}
          >
            Update Payment Method
          </Button>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-100 rounded-lg p-4 flex items-start gap-3 text-amber-800">
        <AlertTriangle size={18} className="mt-0.5 shrink-0" />
        <div className="text-sm">
          <span className="font-bold">Note:</span> You have a draft version (v1.1) in progress.
          Changes may require re-approval and updated pricing before going live.
        </div>
      </div>
    </div>
  );
}

// Versions Settings
function VersionsSettings({
  onNewVersion,
  onNavigateToOverview,
  onNavigateToTab,
  currentVersionId,
  creatingVersion,
  versions = [],
  onArchiveVersion,
  onDeleteVersion,
  archivingVersionId,
  deletingVersionId,
}: {
  onNewVersion?: (copyFromVersionId?: string | null) => void;
  onNavigateToOverview?: () => void;
  onNavigateToTab?: (tab: string) => void;
  currentVersionId?: string | null;
  creatingVersion?: boolean;
  versions?: Array<{
    id: string;
    versionLabel?: string | null;
    status?: string;
    summary?: string | null;
    updatedAt?: string | null;
    latestQuote?: { status?: string | null } | null;
  }>;
  onArchiveVersion?: (versionId: string) => void;
  onDeleteVersion?: (versionId: string) => void;
  archivingVersionId?: string | null;
  deletingVersionId?: string | null;
} = {}) {
  const [confirmAction, setConfirmAction] = useState<{ type: "archive" | "delete"; versionId: string } | null>(
    null
  );
  const statusLabel = (status?: string | null) => {
    switch (status) {
      case "IntakeInProgress":
        return "Draft";
      case "NeedsPricing":
        return "Needs Pricing";
      case "AwaitingClientApproval":
        return "Awaiting Approval";
      case "ReadyForBuild":
        return "Ready for Build";
      case "BuildInProgress":
        return "Build in Progress";
      case "QATesting":
        return "QA & Testing";
      case "Live":
        return "Active";
      case "Archived":
        return "Archived";
      default:
        return "Draft";
    }
  };

  const getStatusBadge = (status?: string | null, signedContract?: boolean) => {
    if (status === "Live" && signedContract) {
      return (
        <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white border-none">
          Active Version
        </Badge>
      );
    }
    if (status === "Live") {
      return (
        <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white border-none">
          Active
        </Badge>
      );
    }
    if (status === "Archived") {
      return (
        <Badge variant="outline" className="bg-gray-100 text-gray-500 border-gray-200">
          Archived
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
        {statusLabel(status)}
      </Badge>
    );
  };

  const canDelete = (status?: string | null) => status === "IntakeInProgress";
  const hasSignedContract = (quoteStatus?: string | null) => (quoteStatus ?? "").toLowerCase() === "accepted";
  const canArchive = (status?: string | null, quoteStatus?: string | null) => {
    if (!status) return true;
    if (status === "Live" && hasSignedContract(quoteStatus)) {
      return false;
    }
    if (status === "BuildInProgress") {
      return false;
    }
    return status !== "Archived";
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-2">
        <div>
          <h3 className="text-xl font-bold text-[#0A0A0A]">Version History</h3>
          <p className="text-sm text-gray-500">Manage deployment lifecycle and history.</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="bg-[#0A0A0A] hover:bg-gray-800 text-white" disabled={creatingVersion}>
              {creatingVersion ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" /> Creating new version...
                </>
              ) : (
                <>
                  <Plus size={16} className="mr-2" /> Start New Version
                  <ChevronDown size={16} className="ml-2" />
                </>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuItem
              onClick={() => onNewVersion?.(null)}
              className="cursor-pointer data-[highlighted]:bg-gray-50 data-[highlighted]:text-gray-900 focus:bg-gray-50 focus:text-gray-900"
            >
              <div className="flex flex-col">
                <span className="font-semibold">Start from scratch</span>
                <span className="text-xs text-gray-500">Create a new empty version</span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onNewVersion?.(currentVersionId ?? null)}
              className="cursor-pointer data-[highlighted]:bg-gray-50 data-[highlighted]:text-gray-900 focus:bg-gray-50 focus:text-gray-900"
            >
              <div className="flex flex-col">
                <span className="font-semibold">Copy from this version</span>
                <span className="text-xs text-gray-500">Duplicate the current version</span>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="space-y-4">
        {versions.length === 0 ? (
          <div className="text-sm text-gray-500 border border-dashed border-gray-200 rounded-lg p-4">
            No versions yet. Create a new version to get started.
          </div>
        ) : (
          versions.map((version) => {
            const status = version.status;
            const quoteStatus = version.latestQuote?.status ?? null;
            const deletable = canDelete(status);
            const archivable = canArchive(status, quoteStatus);
            const archiveTooltip = archivable
              ? "Archive version"
              : status === "Live" && hasSignedContract(quoteStatus)
                ? "Active with signed contract; cancel or pause before archiving."
                : status === "BuildInProgress"
                  ? "Cannot archive while build is in progress."
                  : "Archive not allowed.";
            const deleteTooltip = deletable ? "Delete draft version" : "Only draft versions can be deleted";
            const archiving = archivingVersionId === version.id;
            const deleting = deletingVersionId === version.id;
            const signedContract = hasSignedContract(quoteStatus) && version.status === "Live";
            const archiveDisabled = !archivable || archiving;
            const deleteDisabled = !deletable || deleting;

            return (
              <div
                key={version.id}
                className={cn(
                  "bg-white rounded-xl border p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all",
                  version.status === "Live"
                    ? "border-emerald-200 shadow-emerald-500/5 shadow-sm ring-1 ring-emerald-100"
                    : "border-gray-200 shadow-sm opacity-90 hover:opacity-100"
                )}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <h4 className="text-lg font-bold text-[#0A0A0A]">
                      {version.versionLabel ?? version.id}
                    </h4>
                    {getStatusBadge(version.status, signedContract)}
                  </div>
                  <p className="text-sm text-gray-600">{version.summary ?? "No summary yet."}</p>
                  {version.updatedAt ? (
                    <div className="flex items-center gap-2 text-xs text-gray-400 mt-2">
                      <span>Updated</span>
                      <span>{new Date(version.updatedAt).toLocaleDateString()}</span>
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-gray-200"
                    onClick={() => {
                      if (version.status === "BuildInProgress") {
                        onNavigateToTab?.("Build Status");
                      } else {
                        onNavigateToOverview?.();
                      }
                    }}
                  >
                    View <ChevronRight size={14} className="ml-1" />
                  </Button>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={archiveDisabled}
                          onClick={() => {
                            if (archiveDisabled) return;
                            setConfirmAction({ type: "archive", versionId: version.id });
                          }}
                          className="border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
                        >
                          {archiving ? (
                            <Loader2 size={14} className="mr-1 animate-spin" />
                          ) : (
                            <ArchiveIcon size={14} className="mr-1" />
                          )}
                          Archive
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <span>{archiveDisabled ? archiveTooltip : "Archive version"}</span>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex">
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={deleteDisabled}
                          onClick={() => {
                            if (deleteDisabled) return;
                            setConfirmAction({ type: "delete", versionId: version.id });
                          }}
                          title={deleteTooltip}
                          className="bg-red-600 hover:bg-red-700 text-white"
                        >
                          {deleting ? (
                            <Loader2 size={14} className="mr-1 animate-spin" />
                          ) : (
                            <Trash2 size={14} className="mr-1" />
                          )}
                          Delete
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <span>{deleteDisabled ? deleteTooltip : "Delete draft version"}</span>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
            );
          })
        )}
      </div>

      <AlertDialog open={Boolean(confirmAction)} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent className="bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.type === "delete" ? "Delete version?" : "Archive version?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === "delete"
                ? "This will permanently delete this draft version. This cannot be undone."
                : "Archive this version? Live versions with signed contracts cannot be archived until cancelled or paused."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmAction(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={
                confirmAction?.type === "delete"
                  ? "bg-red-600 hover:bg-red-700 text-white"
                  : "bg-amber-500 hover:bg-amber-600 text-white"
              }
              onClick={() => {
                const versionId = confirmAction?.versionId;
                const type = confirmAction?.type;
                setConfirmAction(null);
                if (!versionId || !type) return;
                if (type === "delete") {
                  onDeleteVersion?.(versionId);
                } else {
                  onArchiveVersion?.(versionId);
                }
              }}
            >
              {confirmAction?.type === "delete" ? "Delete" : "Archive"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Notifications Settings
function NotificationsSettings() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-2">
        <div>
          <h3 className="text-xl font-bold text-[#0A0A0A]">Notification Preferences</h3>
          <p className="text-sm text-gray-500">Control when and how your team is alerted.</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="grid grid-cols-1 divide-y divide-gray-100">
          {[
            {
              label: "Exceptions & Errors",
              desc: "When automation fails or needs human review",
              critical: true,
            },
            { label: "Approval Required", desc: "When a new version or quote needs signature" },
            { label: "Build Ready for Review", desc: "When a version passes automated testing" },
            { label: "Version Live", desc: "When a new version is successfully deployed" },
            { label: "Payment Issues", desc: "Failed charges or card expiration warnings" },
          ].map((item, idx) => (
            <div
              key={idx}
              className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="flex-1">
                <h4 className="font-bold text-[#0A0A0A] flex items-center gap-2">
                  {item.label}
                  {item.critical && (
                    <Badge
                      variant="outline"
                      className="text-[10px] text-red-600 border-red-100 bg-red-50 px-1 py-0"
                    >
                      Critical
                    </Badge>
                  )}
                </h4>
                <p className="text-xs text-gray-500">{item.desc}</p>
              </div>

              <div className="flex items-center gap-6">
                <div className="flex flex-col items-center gap-1">
                  <Slack size={16} className={item.critical ? "text-gray-800" : "text-gray-400"} />
                  <Switch defaultChecked={item.critical} />
                </div>
                <div className="flex flex-col items-center gap-1">
                  <Mail size={16} className="text-gray-800" />
                  <Switch defaultChecked={true} />
                </div>
                <div className="flex flex-col items-center gap-1">
                  <Bell size={16} className="text-gray-400" />
                  <Switch defaultChecked={item.critical} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Data Settings
function DataSettings() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-2">
        <div>
          <h3 className="text-xl font-bold text-[#0A0A0A]">Data Governance</h3>
          <p className="text-sm text-gray-500">
            Manage data retention, privacy, and compliance settings.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <h4 className="text-sm font-bold text-[#0A0A0A] border-b border-gray-100 pb-2">
              Data Sensitivity
            </h4>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm text-gray-600">Classification</label>
                <Select defaultValue="medium">
                  <SelectTrigger className="w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium (Internal)</SelectItem>
                    <SelectItem value="high">High (Confidential)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <label className="text-sm text-gray-600">PII Handling</label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">{true ? "Detected" : "None"}</span>
                  <Switch defaultChecked={true} />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-bold text-[#0A0A0A] border-b border-gray-100 pb-2">
              Access Controls
            </h4>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm text-gray-600">Data Export</label>
                <Select defaultValue="owner">
                  <SelectTrigger className="w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">Owners Only</SelectItem>
                    <SelectItem value="editors">Editors & Owners</SelectItem>
                    <SelectItem value="all">All Users</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <label className="text-sm text-gray-600">Retention Period</label>
                <Select defaultValue="90">
                  <SelectTrigger className="w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 Days</SelectItem>
                    <SelectItem value="90">90 Days</SelectItem>
                    <SelectItem value="365">1 Year</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white rounded border border-gray-200 text-gray-500">
              <FileText size={18} />
            </div>
            <div>
              <p className="text-sm font-bold text-[#0A0A0A]">Audit Log</p>
              <p className="text-xs text-gray-500">
                View all administrative actions and access events.
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="bg-white hover:bg-gray-50 text-gray-700">
            View Logs <ExternalLink size={14} className="ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}
