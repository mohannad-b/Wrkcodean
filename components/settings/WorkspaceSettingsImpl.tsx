"use client";

import { useState, useEffect, useRef } from "react";
import {
  Building2,
  CreditCard,
  Save,
  Download,
  CheckCircle2,
  Clock,
  Mail,
  FileText,
  LogOut,
  Upload,
  Link2,
  Sparkles,
  Check,
  Loader2,
  Palette,
  Users,
} from "lucide-react";
import { motion } from "motion/react";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import { logger } from "@/lib/logger";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { TeamsPanel } from "@/components/settings/TeamsPanel";

// --- Mock Data ---
const USAGE_DATA = Array.from({ length: 12 }, (_, i) => ({
  month: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][i],
  units: Math.floor(Math.random() * 50000) + 10000,
  cost: Math.floor(Math.random() * 2000) + 500,
}));

const INVOICES = [
  { id: "INV-2023-012", date: "Nov 01, 2023", amount: "$1,250.00", status: "Paid" },
  { id: "INV-2023-011", date: "Oct 01, 2023", amount: "$1,180.50", status: "Paid" },
  { id: "INV-2023-010", date: "Sep 01, 2023", amount: "$950.00", status: "Paid" },
];

type SettingsTab = "profile" | "billing" | "teams";

export const WorkspaceSettings: React.FC<{ defaultTab?: SettingsTab }> = ({
  defaultTab = "profile",
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>(defaultTab);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [workspaceDisplayName, setWorkspaceDisplayName] = useState<string>("");
  const [membershipMeta, setMembershipMeta] = useState<{ primaryRole: string; canViewBilling: boolean }>({
    primaryRole: "viewer",
    canViewBilling: false,
  });

  // Effect to update activeTab if defaultTab changes
  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  useEffect(() => {
    async function loadMembership() {
      try {
        const res = await fetch("/api/me/membership", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { primaryRole: string; canViewBilling: boolean };
        setMembershipMeta({
          primaryRole: json.primaryRole,
          canViewBilling: Boolean(json.canViewBilling),
        });
        setActiveTab((prev) => {
          if (!json.canViewBilling && prev === "billing") {
            return "profile";
          }
          if (json.primaryRole === "billing") {
            return "billing";
          }
          return prev;
        });
      } catch (err) {
      logger.warn("Unable to load membership metadata", err);
      }
    }
    loadMembership().catch(() => null);
  }, []);

  const handleDownloadInvoice = () => {
    // TODO: Download invoice
  };

  const handleUpdateCard = () => {
    // TODO: Open payment method update modal
  };

  const handleAddContact = () => {
    // TODO: Open add contact modal
  };

  const tabs = [
    { id: "profile", label: "Workspace Profile", icon: Building2 },
    ...(membershipMeta.canViewBilling ? [{ id: "billing", label: "Billing & Usage", icon: CreditCard }] : []),
    { id: "teams", label: "Teams", icon: Users },
  ];

  return (
    <div className="flex h-full bg-gray-50/50">
      {/* Left Navigation */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col h-full shrink-0">
        <div className="p-6 pb-4">
          <h2 className="text-lg font-bold text-[#0A0A0A]">Workspace</h2>
          <p className="text-xs text-gray-500">
            {workspaceDisplayName ? `${workspaceDisplayName} Settings` : "Workspace Settings"}
          </p>
        </div>
        <div className="flex-1 py-2 px-3 space-y-1 overflow-y-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as SettingsTab)}
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
          <Button
            variant="outline"
            className="w-full justify-start text-gray-500 hover:text-red-600 hover:bg-red-50 border-transparent"
          >
            <LogOut size={16} className="mr-2" /> Sign Out
          </Button>
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
            {activeTab === "profile" && (
              <ProfileSettings 
                isSaving={isSaving}
                saveError={saveError}
                saveSuccess={saveSuccess}
                onWorkspaceNameChange={setWorkspaceDisplayName}
                onSaveStateChange={(error, success, saving) => {
                  setSaveError(error);
                  setSaveSuccess(success);
                  setIsSaving(saving ?? false);
                }}
              />
            )}
            {activeTab === "billing" && (
              <BillingSettings
                onDownloadInvoice={handleDownloadInvoice}
                onUpdateCard={handleUpdateCard}
                onAddContact={handleAddContact}
              />
            )}
            {activeTab === "teams" && <TeamsPanel />}
          </motion.div>
        </div>
      </div>
    </div>
  );
};

// --- 1. Workspace Profile ---
const ProfileSettings = ({
  isSaving,
  saveError,
  saveSuccess,
  onSaveStateChange,
  onWorkspaceNameChange,
}: { 
  isSaving?: boolean;
  saveError?: string | null;
  saveSuccess?: boolean;
  onSaveStateChange?: (error: string | null, success: boolean, saving?: boolean) => void;
  onWorkspaceNameChange?: (name: string) => void;
} = {}) => {
  const [workspaceName, setWorkspaceName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "available" | "unavailable" | "invalid">("idle");
  const [slugMessage, setSlugMessage] = useState("");
  const [brandColor, setBrandColor] = useState("#E43632");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoTab, setLogoTab] = useState<"upload" | "link" | "ai">("upload");
  const [logoLink, setLogoLink] = useState("");
  const [logoPrompt, setLogoPrompt] = useState("");
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(true);
  const [industry, setIndustry] = useState("tech");
  const [currency, setCurrency] = useState("usd");
  const [timezone, setTimezone] = useState("est");
  const [loading, setLoading] = useState(true);
  const [originalSlug, setOriginalSlug] = useState("");
  const loadWorkspaceRef = useRef<Promise<void> | null>(null);

  const MIN_SLUG_LENGTH = 3;
  const MAX_SLUG_LENGTH = 50;

  function isValidSlugValue(value: string) {
    if (!value) return false;
    if (value.length < MIN_SLUG_LENGTH || value.length > MAX_SLUG_LENGTH) return false;
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
  }

  const colorOptions = ["#E43632", "#2563EB", "#22C55E", "#F59E0B", "#8B5CF6", "#0F172A"];

  // Load initial workspace data
  useEffect(() => {
    let cancelled = false;

    // Prevent duplicate requests from React Strict Mode
    if (loadWorkspaceRef.current) {
      return;
    }

    async function loadWorkspace() {
      try {
        const res = await fetch("/api/workspaces");
        if (cancelled) return;

        if (res.ok) {
          const data = await res.json();
          if (cancelled) return;

          if (data.tenant) {
            setWorkspaceName(data.tenant.name || "");
            onWorkspaceNameChange?.(data.tenant.name || "");
            onWorkspaceNameChange?.(data.tenant.name || "");
            setSlug(data.tenant.slug || "");
            setOriginalSlug(data.tenant.slug || "");
            setIndustry(data.tenant.industry || "tech");
            setCurrency(data.tenant.currency || "usd");
            setTimezone(data.tenant.timezone || "est");
            // If slug matches original, mark as available
            if (data.tenant.slug) {
              setSlugStatus("available");
              setSlugMessage("Current workspace URL");
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          logger.error("Failed to load workspace:", err);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
        loadWorkspaceRef.current = null;
      }
    }

    loadWorkspaceRef.current = loadWorkspace();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => {
      if (!slug) return;
      // Don't check if it's the original slug
      if (slug === originalSlug) {
        setSlugStatus("available");
        setSlugMessage("Current workspace URL");
        return;
      }
      checkSlug(slug);
    }, 400);
    return () => clearTimeout(handler);
  }, [slug, originalSlug]);

  async function checkSlug(nextSlug: string) {
    if (!nextSlug) return;
    if (!isValidSlugValue(nextSlug)) {
      setSlugStatus("invalid");
      setSlugMessage("Use 3-50 chars, lowercase, numbers, hyphens.");
      return;
    }

    setSlugStatus("checking");
    const res = await fetch(`/api/workspaces/check-slug?slug=${encodeURIComponent(nextSlug)}`);
    const data = await res.json();
    if (res.ok && data.available) {
      setSlugStatus("available");
      setSlugMessage("Slug is available.");
    } else {
      setSlugStatus(res.ok ? "unavailable" : "invalid");
      setSlugMessage(data.reason ?? "Slug is not available.");
    }
  }

  async function uploadLogoFromFile(file: File) {
    const form = new FormData();
    form.append("purpose", "workspace_logo");
    form.append("resourceType", "workspace");
    form.append("resourceId", "current");
    form.append("title", "Workspace Logo");
    form.append("file", file);
    const res = await fetch("/api/uploads", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error ?? "Upload failed");
    }
    if (data.version?.storageUrl) {
      setLogoUrl(data.version.storageUrl);
      setShowUpload(false);
    }
    return data;
  }

  async function uploadLogoFromUrl(url: string) {
    const form = new FormData();
    form.append("purpose", "workspace_logo");
    form.append("resourceType", "workspace");
    form.append("resourceId", "current");
    form.append("title", "Workspace Logo");
    form.append("url", url);
    const res = await fetch("/api/uploads", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error ?? "Unable to fetch logo.");
    }
    if (data.version?.storageUrl) {
      setLogoUrl(data.version.storageUrl);
      setShowUpload(false);
    }
    return data;
  }

  async function handleSave() {
    if (!workspaceName.trim()) {
      onSaveStateChange?.("Workspace name is required.", false, false);
      return;
    }

    if (slugStatus === "unavailable" || slugStatus === "invalid") {
      onSaveStateChange?.("Please fix the workspace URL before saving.", false, false);
      return;
    }

    if (slugStatus === "checking") {
      onSaveStateChange?.("Please wait for URL validation to complete.", false, false);
      return;
    }

    onSaveStateChange?.(null, false, true);

    try {
      const res = await fetch("/api/workspaces", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: workspaceName.trim(),
          slug: slug.trim().toLowerCase(),
          industry: industry,
          currency: currency,
          timezone: timezone,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        onSaveStateChange?.(data.error ?? "Failed to save workspace settings.", false, false);
        return;
      }

      if (data.tenant) {
        setOriginalSlug(data.tenant.slug || slug);
        onSaveStateChange?.(null, true, false);
        // Clear success message after 3 seconds
        setTimeout(() => {
          onSaveStateChange?.(null, false, false);
        }, 3000);
      }
    } catch (err) {
      onSaveStateChange?.(err instanceof Error ? err.message : "Unexpected error saving workspace settings.", false, false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-xl font-bold text-[#0A0A0A]">Workspace Profile</h3>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#E43632]" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-xl font-bold text-[#0A0A0A]">Workspace Profile</h3>
        <Button
          className="bg-[#0A0A0A] hover:bg-gray-800 text-white"
          onClick={handleSave}
          disabled={isSaving || loading}
        >
          <Save size={16} className="mr-2" /> {isSaving ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      {saveError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {saveError}
        </div>
      )}

      {saveSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm text-emerald-700 flex items-center gap-2">
          <CheckCircle2 size={16} />
          Workspace settings saved successfully!
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 space-y-8">
        <div className="space-y-4">
          <h4 className="font-bold text-[#0A0A0A]">Workspace Logo</h4>
          <p className="text-sm text-gray-500">Used in emails, PDFs, and task notifications.</p>
          
          {logoUrl && (
            <div className="flex items-center justify-center pt-2">
              <div className="relative h-24 w-24 rounded-2xl overflow-hidden border border-gray-200 shadow-sm bg-black">
                <img src={logoUrl} alt="Workspace logo preview" className="h-full w-full object-cover" />
                <button
                  type="button"
                  aria-label="Delete logo"
                  className="absolute -top-2 -right-2 h-8 w-8 rounded-full bg-white shadow border border-gray-200 flex items-center justify-center text-gray-600 hover:text-red-600"
                  onClick={() => {
                    setLogoUrl(null);
                    setShowUpload(true);
                  }}
                >
                  ×
                </button>
              </div>
            </div>
          )}

          {showUpload && (
            <>
              <div className="flex gap-2 bg-gray-100 rounded-full p-1 text-sm font-semibold text-gray-700">
                {[
                  { id: "upload", label: "Upload", icon: <Upload size={16} /> },
                  { id: "link", label: "Link URL", icon: <Link2 size={16} /> },
                  { id: "ai", label: "AI Gen", icon: <Sparkles size={16} /> },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setLogoTab(tab.id as typeof logoTab)}
                    className={`flex-1 inline-flex items-center justify-center gap-2 rounded-full px-3 py-2 transition ${
                      logoTab === tab.id ? "bg-white shadow-sm text-[#0A0A0A]" : "text-gray-600"
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </div>

              {logoError && <p className="text-sm text-red-600 text-center">{logoError}</p>}

              {logoTab === "upload" && (
                <label className="block border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50 hover:border-[#E43632] hover:bg-white transition cursor-pointer">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setLogoError(null);
                      setLogoUploading(true);
                      try {
                        await uploadLogoFromFile(file);
                      } catch (err) {
                        setLogoError(err instanceof Error ? err.message : "Upload failed.");
                      } finally {
                        setLogoUploading(false);
                      }
                    }}
                  />
                  <div className="py-10 px-6 flex flex-col items-center justify-center text-center space-y-2">
                    {logoUploading ? (
                      <Loader2 className="h-8 w-8 animate-spin text-[#E43632]" />
                    ) : (
                      <Upload className="h-8 w-8 text-[#E43632]" />
                    )}
                    <p className="text-sm font-semibold text-[#0A0A0A]">Click to upload or drag & drop</p>
                    <p className="text-xs text-gray-500">SVG, PNG, JPG (max 2MB)</p>
                  </div>
                </label>
              )}

              {logoTab === "link" && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 rounded-full bg-gray-100 px-4 py-3 text-sm text-gray-600">
                    <Link2 size={16} />
                    <input
                      type="url"
                      placeholder="https://example.com/logo.png"
                      className="flex-1 bg-transparent outline-none"
                      value={logoLink}
                      onChange={(e) => setLogoLink(e.target.value)}
                    />
                  </div>
                  <Button
                    className="w-full rounded-full bg-[#0A0A0A] hover:bg-black text-white"
                    disabled={logoUploading || !logoLink}
                    onClick={async () => {
                      setLogoError(null);
                      setLogoUploading(true);
                      try {
                        await uploadLogoFromUrl(logoLink);
                      } catch (err) {
                        setLogoError(err instanceof Error ? err.message : "Unable to fetch logo.");
                      } finally {
                        setLogoUploading(false);
                      }
                    }}
                  >
                    {logoUploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Fetch Logo
                  </Button>
                </div>
              )}

              {logoTab === "ai" && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 rounded-full bg-white border border-gray-200 px-4 py-3 text-sm text-gray-700">
                    <Sparkles size={16} className="text-[#9b87f5]" />
                    <input
                      type="text"
                      placeholder="e.g. Minimalist geometric fox"
                      className="flex-1 bg-transparent outline-none"
                      value={logoPrompt}
                      onChange={(e) => setLogoPrompt(e.target.value)}
                    />
                  </div>
                  <Button
                    className="w-full rounded-full bg-[#9b87f5] hover:bg-[#8b79e0] text-white"
                    disabled={logoUploading || !logoPrompt}
                    onClick={() => {
                      setLogoError("AI generation coming soon.");
                    }}
                  >
                    Generate with AI
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        <Separator />

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-800">Workspace Name</label>
            <input
              value={workspaceName}
              onChange={(e) => {
                const next = e.target.value;
                setWorkspaceName(next);
                onWorkspaceNameChange?.(next);
              }}
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-900 shadow-inner focus:border-[#E43632] focus:bg-white focus:outline-none"
              placeholder={workspaceName || "Workspace name"}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-800">Workspace URL</label>
            <div className="flex items-center rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 shadow-inner focus-within:border-[#E43632] focus-within:bg-white">
              <span className="text-sm text-gray-500">wrk.com/</span>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                className="ml-2 w-full bg-transparent text-sm font-medium text-gray-900 outline-none"
                placeholder={slug || originalSlug || "workspace"}
              />
              {slugStatus === "checking" && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
              {slugStatus === "available" && <Check className="h-4 w-4 text-emerald-600" />}
            </div>
            {slugMessage && <p className="text-xs text-gray-600">{slugMessage}</p>}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-800">Brand Color</label>
            <div className="flex flex-wrap gap-3">
              {colorOptions.map((color) => {
                const isActive = brandColor === color;
                return (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setBrandColor(color)}
                    className={`flex h-11 w-11 items-center justify-center rounded-full border-2 transition ${
                      isActive ? "border-[#E43632] ring-2 ring-[#E43632]/40" : "border-white shadow-sm hover:shadow"
                    }`}
                    style={{ backgroundColor: color }}
                    aria-label={`Choose color ${color}`}
                  >
                    {isActive ? <Check className="h-4 w-4 text-white" /> : <Palette className="h-4 w-4 text-white/80" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <Separator />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700">Industry</label>
            <Select value={industry} onValueChange={setIndustry}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tech">Technology</SelectItem>
                <SelectItem value="finance">Finance</SelectItem>
                <SelectItem value="health">Healthcare</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700">Default Currency</label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="usd">USD ($)</SelectItem>
                <SelectItem value="cad">CAD ($)</SelectItem>
                <SelectItem value="eur">EUR (€)</SelectItem>
                <SelectItem value="gbp">GBP (£)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700">Timezone</label>
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger className="pl-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="est">Eastern Time (US & Canada)</SelectItem>
                  <SelectItem value="pst">Pacific Time (US & Canada)</SelectItem>
                  <SelectItem value="utc">UTC</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- 2. Billing ---
const BillingSettings = ({
  onDownloadInvoice,
  onUpdateCard,
  onAddContact,
}: {
  onDownloadInvoice?: () => void;
  onUpdateCard?: () => void;
  onAddContact?: () => void;
} = {}) => (
  <div className="space-y-6">
    <div className="flex justify-between items-center mb-2">
      <h3 className="text-xl font-bold text-[#0A0A0A]">Billing & Usage</h3>
      <Button
        className="bg-[#E43632] hover:bg-[#C12E2A] text-white"
        onClick={() => onDownloadInvoice?.()}
      >
        <Download size={16} className="mr-2" /> Download Latest Invoice
      </Button>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Summary Cards */}
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <p className="text-xs font-bold text-gray-400 uppercase mb-2">Current Monthly Spend</p>
        <p className="text-3xl font-bold text-[#0A0A0A]">$3,450.00</p>
        <p className="text-xs text-emerald-600 mt-1 font-medium flex items-center gap-1">
          <CheckCircle2 size={12} /> Paid on Nov 1
        </p>
      </div>
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <p className="text-xs font-bold text-gray-400 uppercase mb-2">Total Active Automations</p>
        <p className="text-3xl font-bold text-[#0A0A0A]">12</p>
        <p className="text-xs text-gray-500 mt-1">Across 4 departments</p>
      </div>
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <p className="text-xs font-bold text-gray-400 uppercase mb-2">Total Units (30d)</p>
        <p className="text-3xl font-bold text-[#0A0A0A]">145.2k</p>
        <p className="text-xs text-gray-500 mt-1">+12% from last month</p>
      </div>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Usage Chart */}
      <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <h4 className="font-bold text-[#0A0A0A]">Workspace Consumption</h4>
          <Select defaultValue="2023">
            <SelectTrigger className="w-[100px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2023">2023</SelectItem>
              <SelectItem value="2022">2022</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="h-[250px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={USAGE_DATA}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis
                dataKey="month"
                axisLine={false}
                tickLine={false}
                fontSize={12}
                tick={{ fill: "#9ca3af" }}
              />
              <YAxis axisLine={false} tickLine={false} fontSize={12} tick={{ fill: "#9ca3af" }} />
              <Tooltip
                cursor={{ fill: "#f9fafb" }}
                contentStyle={{
                  borderRadius: "8px",
                  border: "none",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                }}
              />
              <Bar dataKey="units" fill="#E43632" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Payment & Billing Info */}
      <div className="space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h4 className="font-bold text-[#0A0A0A] mb-4">Payment Method</h4>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-8 bg-gray-100 rounded border border-gray-200 flex items-center justify-center">
              <div className="w-4 h-4 bg-blue-600 rounded-sm" /> {/* Visa Mock */}
            </div>
            <div>
              <p className="text-sm font-bold text-[#0A0A0A]">Visa ending in 4242</p>
              <p className="text-xs text-gray-500">Expires 12/25</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs"
            onClick={() => onUpdateCard?.()}
          >
            Update Card
          </Button>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h4 className="font-bold text-[#0A0A0A] mb-4">Billing Contacts</h4>
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Mail size={14} /> finance@acmecorp.com
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Mail size={14} /> sarah@acmecorp.com
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 h-8 text-xs text-[#E43632] p-0 hover:bg-transparent hover:underline"
            onClick={() => onAddContact?.()}
          >
            + Add Contact
          </Button>
        </div>
      </div>
    </div>

    {/* Invoices Table */}
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
        <h4 className="font-bold text-[#0A0A0A]">Invoice History</h4>
      </div>
      <div className="divide-y divide-gray-100">
        {INVOICES.map((inv) => (
          <div
            key={inv.id}
            className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="p-2 bg-gray-100 rounded text-gray-500">
                <FileText size={16} />
              </div>
              <div>
                <p className="text-sm font-bold text-[#0A0A0A]">{inv.id}</p>
                <p className="text-xs text-gray-500">{inv.date}</p>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <span className="text-sm font-mono font-medium">{inv.amount}</span>
              <Badge
                variant="outline"
                className="bg-emerald-50 text-emerald-700 border-emerald-200"
              >
                {inv.status}
              </Badge>
              <Button variant="ghost" size="icon" onClick={() => onDownloadInvoice?.()}>
                <Download size={16} className="text-gray-400" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);
