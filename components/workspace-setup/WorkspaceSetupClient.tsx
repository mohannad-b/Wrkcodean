/* eslint-disable @next/next/no-img-element */
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Building2, Check, Clock, Link2, Loader2, Lock, Palette, Phone, ShieldCheck, Sparkles, Upload, Users, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  firstName: string;
  domain: string;
  suggestedName: string;
  suggestedSlug: string;
  isConsumerDomain: boolean;
  primaryColor: string;
  accentColor: string;
  simulate?: boolean;
};

type StepKey = "branding" | "phone" | "tos" | "imports";

const MIN_SLUG_LENGTH = 3;
const MAX_SLUG_LENGTH = 50;

function isValidSlugValue(value: string) {
  if (!value) return false;
  if (value.length < MIN_SLUG_LENGTH || value.length > MAX_SLUG_LENGTH) return false;
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export function WorkspaceSetupClient({
  firstName,
  domain,
  suggestedName,
  suggestedSlug,
  isConsumerDomain,
  primaryColor,
  accentColor,
  simulate = false,
}: Props) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<StepKey>("branding");
  const [workspaceName, setWorkspaceName] = useState(suggestedName);
  const [slug, setSlug] = useState(suggestedSlug);
  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "available" | "unavailable" | "invalid">("idle");
  const [slugMessage, setSlugMessage] = useState("");
  const [brandColor, setBrandColor] = useState(primaryColor);
  const [creating, setCreating] = useState(false);
  const [createdTenantId, setCreatedTenantId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoTab, setLogoTab] = useState<"upload" | "link" | "ai">("upload");
  const [logoLink, setLogoLink] = useState("");
  const [logoPrompt, setLogoPrompt] = useState("");
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(true);

  const [phone, setPhone] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [sendState, setSendState] = useState<"idle" | "sending" | "sent">("idle");
  const [verifyState, setVerifyState] = useState<"idle" | "verifying" | "verified">("idle");
  const [phoneSkipped, setPhoneSkipped] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [tosAccepted, setTosAccepted] = useState(false);
  const [tosSubmitting, setTosSubmitting] = useState(false);
  const [tosError, setTosError] = useState<string | null>(null);
  const [selectedImports, setSelectedImports] = useState<string[]>([]);
  const [industry, setIndustry] = useState("tech");
  const [currency, setCurrency] = useState("usd");
  const [timezone, setTimezone] = useState("est");

  const isBrandingComplete = Boolean(createdTenantId);
  const isPhoneComplete = verifyState === "verified" || phoneSkipped;

  const stepOrder: StepKey[] = ["branding", "phone", "tos", "imports"];

  useEffect(() => {
    if (simulate) return;
    const handler = setTimeout(() => {
      if (!slug) return;
      checkSlug(slug);
    }, 400);
    return () => clearTimeout(handler);
  }, [slug, simulate]);

  useEffect(() => {
    // Changing phone should reset verification state.
    setSendState("idle");
    setVerifyState("idle");
    setPhoneCode("");
    setPhoneError(null);
  }, [phone]);

  useEffect(() => {
    if (simulate) {
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        const data = await apiFetch("/api/me/onboarding", { method: "GET" });
        if (cancelled) return;
        if (data.phone) {
          setPhone(data.phone);
        }
        if (data.phoneVerified) {
          setVerifyState("verified");
          setSendState("sent");
        }
        if (data.tosAccepted) {
          setTosAccepted(true);
        }
        const next = computeInitialStep({
          hasTenant: isBrandingComplete,
          phoneVerified: Boolean(data.phoneVerified),
          tosAccepted: Boolean(data.tosAccepted),
        });
        setCurrentStep(next);
      } catch (err) {
        console.error(err);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [isBrandingComplete, simulate]);

  const slugValid = useMemo(() => {
    return isValidSlugValue(slug);
  }, [slug]);

  const colorOptions = useMemo(() => {
    const palette = [
      primaryColor,
      accentColor,
      "#E43632",
      "#2563EB",
      "#22C55E",
      "#F59E0B",
      "#8B5CF6",
      "#0F172A",
    ];
    return Array.from(new Set(palette));
  }, [primaryColor, accentColor]);

  async function checkSlug(nextSlug: string) {
    if (simulate) {
      setSlugStatus("available");
      setSlugMessage("Slug is available (simulation).");
      return;
    }
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
    form.append("resourceId", "setup");
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
    form.append("resourceId", "setup");
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

  async function handleCreateWorkspace() {
    setError(null);
    if (!workspaceName.trim()) {
      setError("Workspace name is required.");
      return;
    }
    if (!slugValid || slugStatus === "unavailable" || slugStatus === "invalid") {
      setError("Choose an available slug before continuing.");
      return;
    }

    if (simulate) {
      setCreatedTenantId("simulated-tenant");
      setCurrentStep("phone");
      setError(null);
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: workspaceName.trim(), slug: slug.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Unable to create workspace.");
        setCreating(false);
        return;
      }
      setCreatedTenantId(data.tenant?.id ?? null);
      setCurrentStep("phone");
      setError(null);
      router.refresh();
    } catch (err) {
      console.error(err);
      setError("Unexpected error creating workspace.");
    } finally {
      setCreating(false);
    }
  }

  async function handleSendCode() {
    if (!phone) return;
    setPhoneError(null);
    setSendState("sending");
    try {
      if (simulate) {
        setSendState("sent");
      } else {
        await postJson("/api/me/phone", { phone });
        setSendState("sent");
      }
    } catch (err) {
      setSendState("idle");
      setPhoneError(err instanceof Error ? err.message : "Failed to send code.");
    }
  }

  async function handleVerifyCode() {
    if (!phone || !phoneCode) return;
    setPhoneError(null);
    setVerifyState("verifying");
    try {
      if (simulate) {
        setVerifyState("verified");
      } else {
        await putJson("/api/me/phone", { phone, code: phoneCode });
        setVerifyState("verified");
      }
    } catch (err) {
      setVerifyState("idle");
      setPhoneError(err instanceof Error ? err.message : "Failed to verify code.");
    }
  }

  async function handleAcceptTos() {
    setTosError(null);
    setTosSubmitting(true);
    try {
      if (simulate) {
        setTosSubmitting(false);
        setTosAccepted(true);
        nextStep();
      } else {
        await postJson("/api/me/tos", { version: "2025-07-19" });
        setTosSubmitting(false);
        setTosAccepted(true);
        nextStep();
      }
    } catch (err) {
      setTosSubmitting(false);
      setTosError(err instanceof Error ? err.message : "Failed to record acceptance.");
    }
  }

  function computeInitialStep(input: { hasTenant: boolean; phoneVerified: boolean; tosAccepted: boolean }): StepKey {
    if (!input.hasTenant) return "branding";
    if (!input.phoneVerified) return "phone";
    if (!input.tosAccepted) return "tos";
    return "imports";
  }

  function nextStep() {
    const idx = stepOrder.indexOf(currentStep);
    if (idx < stepOrder.length - 1) {
      setCurrentStep(stepOrder[idx + 1]);
    }
  }

  function prevStep() {
    const idx = stepOrder.indexOf(currentStep);
    if (idx > 0) {
      setCurrentStep(stepOrder[idx - 1]);
    }
  }

  function skipPhoneStep() {
    setPhoneSkipped(true);
    setVerifyState("verified");
    setSendState("sent");
    setPhoneError(null);
    nextStep();
  }

  function toggleImport(source: string) {
    setSelectedImports((prev) => {
      if (prev.includes(source)) {
        return prev.filter((item) => item !== source);
      }
      return [...prev, source];
    });
  }

  function finish() {
    if (simulate) {
      setCurrentStep("branding");
      setCreatedTenantId(null);
      setVerifyState("idle");
      setPhoneSkipped(false);
      setSendState("idle");
      setPhone("");
      setPhoneCode("");
      setTosAccepted(false);
      setSelectedImports([]);
      setSlugStatus("idle");
      setSlugMessage("");
      return;
    }
    router.push("/dashboard");
  }

  const stepsMeta: Record<
    StepKey,
    {
      title: string;
      description: string;
      icon: JSX.Element;
      isComplete: boolean;
      isLocked: boolean;
      body: JSX.Element;
    }
  > = {
    branding: {
      title: "Set up your workspace",
      description: "This is where your team will collaborate on workflows.",
      icon: <Sparkles className="h-5 w-5 text-amber-600" />,
      isComplete: isBrandingComplete,
      isLocked: false,
      body: (
        <div className="space-y-8">
          <div className="w-full max-w-2xl mx-auto space-y-4">
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
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-800">Workspace Name</label>
              <input
                suppressHydrationWarning
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-900 shadow-inner focus:border-[#E43632] focus:bg-white focus:outline-none"
                placeholder="Acme Corp"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-800">Workspace URL</label>
              <div className="flex items-center rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 shadow-inner focus-within:border-[#E43632] focus-within:bg-white">
                <span className="text-sm text-gray-500">wrk.com/</span>
                <input
                  suppressHydrationWarning
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase())}
                  className="ml-2 w-full bg-transparent text-sm font-medium text-gray-900 outline-none"
                  placeholder="acme"
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-800">Industry</label>
              <Select value={industry} onValueChange={setIndustry}>
                <SelectTrigger className="rounded-2xl border border-gray-200 bg-gray-50 shadow-inner focus:border-[#E43632] focus:bg-white">
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
              <label className="text-sm font-semibold text-gray-800">Default Currency</label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="rounded-2xl border border-gray-200 bg-gray-50 shadow-inner focus:border-[#E43632] focus:bg-white">
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

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-semibold text-gray-800">Timezone</label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger className="pl-9 rounded-2xl border border-gray-200 bg-gray-50 shadow-inner focus:border-[#E43632] focus:bg-white">
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

          <div className="flex items-center justify-between pt-2">
            <button
              onClick={prevStep}
              className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-700 disabled:opacity-50"
              disabled
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <button
              onClick={handleCreateWorkspace}
              disabled={creating}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-black px-6 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#0A0A0A] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              {creating ? "Creating..." : isBrandingComplete ? "Workspace created" : "Next Step"}
              {!creating && <ArrowRight className="h-4 w-4" />}
            </button>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {isBrandingComplete && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              <Check className="h-4 w-4" />
              Workspace created. Continue to phone verification.
            </div>
          )}
        </div>
      ),
    },
    phone: {
      title: "Secure your account",
      description: "We use 2FA to keep your automations and data safe.",
      icon: <Phone className="h-5 w-5 text-blue-600" />,
      isComplete: isPhoneComplete,
      isLocked: !isBrandingComplete,
      body: (
        <div className="space-y-6">
          <p className="text-sm text-gray-600 text-center">Enter a mobile number. Use demo code 123456 in this environment.</p>

          <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 shadow-inner">
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Phone Number</label>
            <input
              suppressHydrationWarning
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 (555) 000-0000"
              className="mt-1 w-full bg-transparent text-base font-semibold text-gray-900 outline-none"
              disabled={!isBrandingComplete || sendState === "sending"}
            />
          </div>

          <p className="text-xs text-gray-500 text-center">We&apos;ll send a 6-digit code via SMS.</p>

          <div className="flex flex-col gap-4">
            <button
              onClick={handleSendCode}
              disabled={!isBrandingComplete || !phone || sendState === "sending"}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-800 transition hover:-translate-y-0.5 hover:border-gray-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sendState === "sending" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {sendState === "sent" ? "Code sent" : "Send Code"}
            </button>

            <div className="relative flex items-center justify-center gap-2">
              <input
                suppressHydrationWarning
                value={phoneCode}
                onChange={(e) => setPhoneCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                placeholder="123456"
                className="absolute inset-0 h-full w-full opacity-0"
                disabled={!isBrandingComplete || sendState !== "sent" || verifyState === "verifying"}
                maxLength={6}
                inputMode="numeric"
                aria-label="Verification code"
              />
              {Array.from({ length: 6 }).map((_, idx) => {
                const val = phoneCode[idx] ?? "";
                return (
                  <div
                    key={idx}
                    className="flex h-12 w-12 items-center justify-center rounded-lg border border-gray-200 bg-white text-lg font-semibold text-gray-900 shadow-inner"
                  >
                    {val || "-"}
                  </div>
                );
              })}
            </div>
          </div>

            <div className="flex items-center justify-between pt-2">
            <button
              onClick={prevStep}
              className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-700"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
              <div className="flex flex-col items-end gap-2">
                {isPhoneComplete ? (
                  <button
                    onClick={nextStep}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0A0A0A] px-6 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-black"
                  >
                    Next Step
                    <ArrowRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    onClick={handleVerifyCode}
                    disabled={!isBrandingComplete || sendState !== "sent" || !phoneCode || verifyState === "verifying"}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0A0A0A] px-6 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {verifyState === "verifying" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Next Step
                    {verifyState !== "verifying" && <ArrowRight className="h-4 w-4" />}
                  </button>
                )}
                <button
                  type="button"
                  onClick={skipPhoneStep}
                  className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-700"
                >
                  Skip for now
                </button>
              </div>
          </div>

          {verifyState === "verified" && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              <Check className="h-4 w-4" />
              Phone verified. SMS/2FA ready.
            </div>
          )}
          {phoneError && <p className="text-sm text-red-600">{phoneError}</p>}
        </div>
      ),
    },
    tos: {
      title: "Terms of Service",
      description: "Please review our terms to continue using Wrk.",
      icon: <ShieldCheck className="h-5 w-5 text-emerald-600" />,
      isComplete: tosAccepted,
      isLocked: !isBrandingComplete,
      body: (
        <div className="space-y-6">
          <div className="max-h-96 overflow-y-auto rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm leading-relaxed text-gray-800 shadow-inner">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Last Update: July 19, 2025</p>
            <p className="mt-3">
              These WRK Terms of Service (the “Terms of Service”) apply to Customer’s access to and use of the WRK Delivery Platform. These Terms of Service, together with
              the order or online registration form (“Order Form”) referencing these Terms of Service (collectively, the “Agreement”), form a binding legal agreement between
              Wrk Technologies Inc. (“WRK”, “Wrk”, “us”, “we”, “our”) and Customer. The term “Customer” refers to the organization agreeing to these Terms of Service or, if the
              Terms of Service are being agreed to by an individual who is not formally affiliated with an organization, Customer is such individual. The “Parties” refer to WRK and
              Customer and “Party” refers to each of WRK and Customer.
            </p>
            <p className="mt-3 font-semibold text-gray-900">
              BY USING THE WRK DELIVERY PLATFORM (INCLUDING THE WEBSITE), CUSTOMER ACKNOWLEDGES THAT CUSTOMER HAS READ, ACCEPTS AND AGREES TO BE BOUND BY AND COMPLY WITH
              THE TERMS AND CONDITIONS SET OUT IN THIS AGREEMENT, AS AMENDED FROM TIME TO TIME IN ACCORDANCE WITH SECTION 13(k). IF CUSTOMER DOES NOT ACCEPT AND AGREE TO BE
              BOUND BY THIS AGREEMENT, CUSTOMER WILL IMMEDIATELY CEASE ANY FURTHER USE OF THE WRK DELIVERY PLATFORM.
            </p>
            <p className="mt-3">
              CUSTOMER REPRESENTS AND WARRANTS TO WRK THAT CUSTOMER HAS THE CAPACITY TO ENTER INTO THIS LEGALLY BINDING AGREEMENT. IF CUSTOMER IS USING THE WRK DELIVERY PLATFORM
              ON BEHALF OF ANOTHER PERSON, CUSTOMER HEREBY REPRESENTS AND WARRANTS TO WRK THAT CUSTOMER HAS THE AUTHORITY TO BIND SUCH PERSON TO THIS AGREEMENT.
            </p>

            <h3 className="mt-5 text-base font-bold text-gray-900">1. Definitions</h3>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>“Commitment Period” means the period in time during which Customer will meet the Minimum Commitment set out in, or referenced by, the Order Form.</li>
              <li>“Customer Data” means any data, information, content, records, and files, including any Customer Processes that Customer (or any of its Users) loads, transmits to or enters into the WRK Automation Platform, including but not limited to Personal Information.</li>
              <li>“Customer Processes” means Customer’s proprietary or non-public processes or any process improvements to Public Workflows that Customer makes available in connection with Customer’s use of the WRK Automation Platform.</li>
              <li>“Deliverables” means information, content, documents, work product, data, media, and all digital or physical materials that are described in an Order Confirmation, created by or on behalf of WRK during the provision of WRK Fulfilment Services, and that are provided to Customer.</li>
              <li>“Fees” has the meaning set out in Section 7.</li>
              <li>“Loss” or “Losses” means any and all losses, damages, claims, actions, judgments, settlements, interest, awards, penalties, fines, costs, or expenses of whatever kind, including reasonable legal fees and the costs of enforcing any right to indemnification hereunder and the cost of pursuing any insurance providers.</li>
              <li>“Minimum Commitment” means the minimum financial spend for the Commitment Period set out in, or referenced by, the Order Form.</li>
              <li>“Modifications” means modifications, improvements, customizations, patches, bug fixes, updates, enhancements, aggregations, compilations, derivative works, translations and adaptations, and “Modify” has a corresponding meaning.</li>
              <li>“Personal Information” means information about an identifiable individual.</li>
              <li>“Private Workflow” means a Workflow created by Customer using Customer Processes.</li>
              <li>“Public Workflow” means all Workflows including Workflows licensed, procured, or developed by or for WRK, other than Private Workflows.</li>
              <li>“Services” means the WRK Delivery Platform and the WRK Fulfilment Services.</li>
              <li>“Support Services” has the meaning set out in Section 6.</li>
              <li>“Term” has the meaning set out in Section 12.</li>
              <li>“User” has the meaning set out in Section 5.</li>
              <li>“Website” means any websites used by WRK to provide the WRK Delivery Platform, including the websites located at *.wrk.com, and any other domains or subdomains it may use in the future.</li>
              <li>“Workflow” means an object in the WRK Automation Platform that reflects the description and mapping of a business process, that comprises of a sequence of micro-tasks, and that is used by Customer to request Deliverables through the WRK Delivery Platform.</li>
              <li>“WRK Delivery Platform” means WRK’s online platform through which WRK makes available its services to fulfil requests for Workflows including by delegating micro-tasks in such Workflows to a combination of humans and machines.</li>
              <li>“WRK Fulfilment Services” means the services provided by WRK to fulfill and execute Workflows.</li>
              <li>“Unit of Work” means the output of a Workflow as a result of one or more related set of input (e.g. one SKU loaded, one PDF generated, or one transaction verified).</li>
            </ol>

            <h3 className="mt-4 text-base font-bold text-gray-900">2. The Wrk Delivery Platform</h3>
            <p className="mt-2"><span className="font-semibold">a. Provisioning.</span> Subject to compliance with this Agreement, WRK makes the Platform available during the Term; Customer is responsible for identifying/authenticating Users and their compliance.</p>
            <p><span className="font-semibold">b. Orders.</span> Customer may request Private Workflows and place Order Requests for WRK Fulfilment Services; accepted requests are summarized in Order Confirmations incorporated by reference.</p>
            <p><span className="font-semibold">c. Restrictions of Use.</span> No sub-licensing, resale, timesharing, unlawful orders, security threats, unauthorized Personal Information collection, subcontractor data surveys, malicious/unlawful data, modification/reverse engineering/removal of notices, competitive use, or vulnerability testing.</p>
            <p><span className="font-semibold">d. Suspension / Modifications.</span> WRK may suspend for violations, emergencies, or legal requirements, and may modify the Platform.</p>
            <p><span className="font-semibold">e. Updates.</span> Customer must accept patches, bug fixes, and updates.</p>
            <p><span className="font-semibold">f. Subcontracting.</span> WRK may use third parties (humans and/or software) to provide Services; geographic limits may affect cost/speed.</p>

            <h3 className="mt-4 text-base font-bold text-gray-900">3. Ownership; Reservation of Rights</h3>
            <p>Customer retains rights in Customer Data and grants WRK rights to process it to provide and improve Services. WRK will not use Customer Processes except to provide Services. WRK assigns Deliverables IP to Customer. WRK retains rights in the Platform, Fulfilment Services, Workflows, and derivatives. All other rights are reserved.</p>

            <h3 className="mt-4 text-base font-bold text-gray-900">4. Privacy</h3>
            <p>Personal Information is treated per WRK’s Privacy Policy at www.wrk.com/privacy-policy.</p>

            <h3 className="mt-4 text-base font-bold text-gray-900">5. Customer User Account</h3>
            <p><span className="font-semibold">a. User Accounts.</span> WRK issues Customer User Accounts for Internal Users; sharing is prohibited. Unauthorized use must be reported. Accounts may be suspended if misused.</p>
            <p><span className="font-semibold">b. Authority.</span> Users may act on Customer’s behalf; Customer is responsible for associated Fees.</p>

            <h3 className="mt-4 text-base font-bold text-gray-900">6. Support</h3>
            <p>Support generally available 9am–7pm EST, Monday–Friday, via support@wrk.com.</p>

            <h3 className="mt-4 text-base font-bold text-gray-900">7. Service Levels</h3>
            <p>WRK targets 99% monthly availability (24x7x365), excluding maintenance or Force Majeure.</p>

            <h3 className="mt-4 text-base font-bold text-gray-900">8. Fees and Payment</h3>
            <p><span className="font-semibold">a.</span> Customer pays Fees per Order Form/Confirmations. <span className="font-semibold">b.</span> Disputes must be raised within 30 days; undisputed amounts remain payable. <span className="font-semibold">c.</span> Late payments may incur 1.5% monthly interest and suspension. <span className="font-semibold">d.</span> Customer pays applicable taxes. <span className="font-semibold">e.</span> Suspension does not excuse payment.</p>

            <h3 className="mt-4 text-base font-bold text-gray-900">10. Confidential Information</h3>
            <p>Confidential Information includes non-public information (including Customer Data). Recipient must protect it, limit disclosure, and may disclose only as required by law, to advisors, or (for WRK) to potential acquirers.</p>

            <h3 className="mt-4 text-base font-bold text-gray-900">11. Warranty; Disclaimer; Indemnity</h3>
            <p>Customer warrants necessary notices/consents for Personal Information. SERVICES ARE PROVIDED “AS IS” AND “AS AVAILABLE”; no warranty of uninterrupted or error-free service. WRK indemnifies Customer for IP infringement claims (with exclusions). Customer indemnifies WRK for Customer Data, misuse, excluded claims, and Deliverables-related claims.</p>

            <h3 className="mt-4 text-base font-bold text-gray-900">12. Limitation of Liabilities</h3>
            <p>Aggregate liability is capped at Fees paid in the three months preceding the claim; no liability for indirect, special, or consequential damages, lost profits, data, etc., subject to stated exceptions (indemnities, certain breaches, gross negligence/willful misconduct).</p>

            <h3 className="mt-4 text-base font-bold text-gray-900">13. Term and Termination</h3>
            <p>Agreement lasts for the Term in the Order Form. Either party may terminate for material breach not cured within 60 days; termination for convenience with 60 days’ notice unless Order Form/Confirmation states otherwise. Certain sections survive termination.</p>

            <h3 className="mt-4 text-base font-bold text-gray-900">14. General Provisions</h3>
            <p>Notices: WRK, 1250 René Lévesque Boulevard West, Suite 2200, Montreal, QC, H3B 4W8, Canada. Customer notices go to contacts on file. WRK may reference Customer. Assignment: Customer needs consent; WRK may assign. Governing law: Quebec, Canada; venue: Montreal. Export compliance required. Force Majeure applies. Amendments may be posted by WRK. English language governs.</p>
          </div>
          <label className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 shadow-sm">
            <input
              type="checkbox"
              checked={tosAccepted}
              onChange={(e) => setTosAccepted(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
              disabled={!isBrandingComplete}
            />
            <span>I agree to the Terms of Service and Privacy Policy.</span>
          </label>
          {tosError && <p className="text-sm text-red-600">{tosError}</p>}
          <div className="flex items-center justify-between">
            <button onClick={prevStep} className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-700">
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <button
              onClick={handleAcceptTos}
              disabled={!tosAccepted || tosSubmitting}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0A0A0A] px-6 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
            >
              {tosSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {tosAccepted ? "Accepted" : "Next Step"}
              {!tosSubmitting && <ArrowRight className="h-4 w-4" />}
            </button>
          </div>
        </div>
      ),
    },
    imports: {
      title: "Import Workflows",
      description: "Migrating from another tool? Import existing automations.",
      icon: <Users className="h-5 w-5 text-purple-600" />,
      isComplete: false,
      isLocked: !isBrandingComplete,
      body: (
        <div className="space-y-6">
          <div className="flex justify-center">
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Optional
            </span>
          </div>
          <div className="space-y-3">
            {[
              { name: "Zapier", description: "Import Zaps as workflows", key: "zapier" },
              { name: "Make (Integromat)", description: "Import Scenarios", key: "make" },
              { name: "n8n", description: "Import workflows JSON", key: "n8n" },
            ].map((item) => {
              const active = selectedImports.includes(item.key);
              return (
                <div
                  key={item.key}
                  className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white px-4 py-4 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-xs font-semibold text-gray-600">
                      {item.name.charAt(0)}
                    </div>
                    <div>
                      <div className="text-base font-semibold text-gray-900">{item.name}</div>
                      <div className="text-sm text-gray-600">{item.description}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleImport(item.key)}
                    className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${
                      active ? "border-[#E43632] bg-[#E43632]" : "border-gray-300 bg-white"
                    }`}
                    aria-label={`Toggle ${item.name}`}
                  >
                    {active && <Check className="h-3 w-3 text-white" />}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between">
            <button onClick={prevStep} className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-700">
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <button
              onClick={finish}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#E43632] px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-[#C12E2A]"
            >
              Launch Studio
              <Link2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      ),
    },
  };

  const current = stepsMeta[currentStep];

  const progressSteps = useMemo(
    () => {
      const statusFor = (key: StepKey): "complete" | "current" | "upcoming" => {
        if (key === "branding") {
          if (isBrandingComplete) return "complete";
          if (currentStep === "branding") return "current";
          return "upcoming";
        }
        if (key === "phone") {
          if (isPhoneComplete) return "complete";
          if (currentStep === "phone") return "current";
          return isBrandingComplete ? "upcoming" : "upcoming";
        }
        if (key === "tos") {
          if (tosAccepted) return "complete";
          if (currentStep === "tos") return "current";
        return "upcoming";
        }
        if (key === "imports") {
          if (currentStep === "imports") return "current";
          return "upcoming";
        }
        return "upcoming";
      };

      return [
        { key: "account", label: "Create Account", status: "complete" as const, icon: <Lock className="h-4 w-4" /> },
        { key: "branding", label: "Workspace", status: statusFor("branding"), icon: <Building2 className="h-4 w-4" /> },
        { key: "phone", label: "Verify", status: statusFor("phone"), icon: <Phone className="h-4 w-4" /> },
        { key: "tos", label: "Terms", status: statusFor("tos"), icon: <ShieldCheck className="h-4 w-4" /> },
        { key: "imports", label: "Import", status: statusFor("imports"), icon: <Users className="h-4 w-4" /> },
      ];
    },
    [currentStep, isBrandingComplete, verifyState, tosAccepted, phoneSkipped]
  );

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#FFF5F1,transparent_35%),radial-gradient(circle_at_bottom_right,#F6F7FB,transparent_40%)] text-[#0A0A0A]">
      <div className="mx-auto flex max-w-5xl flex-col items-center px-4 py-12">
        <header className="mb-8 flex w-full flex-col items-center gap-3 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm text-gray-700 shadow-sm">
            <Workflow className="h-4 w-4 text-emerald-600" />
            {simulate ? (
              <>
                Simulation mode · {firstName}
                {domain && !isConsumerDomain ? ` @ ${domain}` : ""}
              </>
            ) : (
              <>
                Authenticated as {firstName}
                {domain && !isConsumerDomain ? ` @ ${domain}` : ""}
              </>
            )}
          </div>
        </header>

        <div className="mb-8 w-full flex justify-center">
          <div className="flex w-full max-w-4xl items-center justify-between gap-2">
            {progressSteps.map((step, idx) => {
              const isComplete = step.status === "complete";
              const isCurrent = step.status === "current";
              const isLast = idx === progressSteps.length - 1;
              return (
                <div key={step.key} className="flex min-w-0 flex-1 items-center">
                  <div className="flex flex-col items-center gap-2">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-full border-[3px] ${
                      isComplete
                        ? "border-[#E43632] bg-[#E43632] text-white"
                        : isCurrent
                          ? "border-[#E43632] bg-white text-[#E43632]"
                          : "border-gray-200 bg-white text-gray-300"
                    }`}
                  >
                    {isComplete ? <Check className="h-5 w-5" /> : step.icon}
                  </div>
                    <span
                      className={`text-[11px] font-semibold uppercase tracking-wide ${
                        isComplete || isCurrent ? "text-gray-900" : "text-gray-400"
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                  {!isLast && (
                    <div
                      className={`mx-2 h-[3px] flex-1 rounded-full ${
                        isComplete || isCurrent ? "bg-[#E43632]" : "bg-gray-200"
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <section className="w-full max-w-4xl rounded-[32px] border border-gray-200 bg-white/95 p-8 shadow-xl">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-900">{current.title}</h1>
            <p className="mt-2 text-base text-gray-600">{current.description}</p>
          </div>
          <div className="mt-8">{current.body}</div>
        </section>

        <div className="mt-8 flex flex-wrap items-center gap-3 text-sm text-gray-600">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          Identity: Auth0 SSO · Workspace creation live · Phone + TOS persisted. Imports/invites pending.
        </div>
      </div>
    </main>
  );
}

async function apiFetch(path: string, options: RequestInit) {
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data && data.error) || "Unexpected error";
    throw new Error(msg);
  }
  return data;
}

async function postJson(path: string, body: any) {
  return apiFetch(path, { method: "POST", body: JSON.stringify(body) });
}

async function putJson(path: string, body: any) {
  return apiFetch(path, { method: "PUT", body: JSON.stringify(body) });
}

export default WorkspaceSetupClient;