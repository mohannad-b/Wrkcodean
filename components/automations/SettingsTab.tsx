"use client";

import { useState } from "react";
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
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  CreditCard as CardIcon,
  ExternalLink,
  FileText,
  Slack,
  Mail,
} from "lucide-react";
import { motion } from "motion/react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
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
import { cn } from "@/lib/utils";

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
  onNewVersion?: () => void;
  onManageCredentials?: (systemName: string) => void;
  onNavigateToTab?: (tab: string) => void;
  onNavigateToSettings?: () => void;
}

export function SettingsTab({
  onInviteUser,
  onAddSystem,
  onNewVersion,
  onManageCredentials,
  onNavigateToTab,
  onNavigateToSettings,
}: SettingsTabProps = {}) {
  const [activeTab, setActiveTab] = useState<SettingsTabType>("general");

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
            {activeTab === "general" && <GeneralSettings />}
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
                onNavigateToOverview={() => onNavigateToTab?.("Overview")}
                onNavigateToTab={onNavigateToTab}
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
function GeneralSettings() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-xl font-bold text-[#0A0A0A]">General Information</h3>
        <Button className="bg-[#0A0A0A] hover:bg-gray-800 text-white">
          <Save size={16} className="mr-2" /> Save Changes
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-6">
        <div className="grid gap-6">
          <div className="space-y-2">
            <Label className="text-sm font-bold text-gray-700">Automation Name</Label>
            <Input defaultValue="Invoice Processing v1" className="font-medium" />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-bold text-gray-700">Description</Label>
            <Textarea
              className="min-h-[100px] resize-none"
              defaultValue="Automates the ingestion of PDF invoices from email, extracts key data points using OCR, and creates draft bills in Xero for approval."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-sm font-bold text-gray-700">Business Owner</Label>
              <Select defaultValue="sarah">
                <SelectTrigger>
                  <SelectValue placeholder="Select owner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sarah">Sarah Chen</SelectItem>
                  <SelectItem value="mike">Mike Ross</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-bold text-gray-700">Tags</Label>
              <div className="flex flex-wrap gap-2 p-2 border border-gray-200 rounded-md min-h-[42px]">
                <Badge variant="secondary" className="bg-gray-100 hover:bg-gray-200 text-gray-700">
                  Finance
                </Badge>
                <Badge variant="secondary" className="bg-gray-100 hover:bg-gray-200 text-gray-700">
                  Accounts Payable
                </Badge>
                <button className="text-xs text-gray-400 hover:text-[#E43632] px-2 font-medium">
                  + Add
                </button>
              </div>
            </div>
          </div>

          <Separator className="my-2" />

          <div className="grid grid-cols-2 gap-6 text-sm text-gray-500">
            <div>
              <span className="block text-xs font-medium text-gray-400 mb-1">Created on</span>
              Oct 24, 2023 by Sarah Chen
            </div>
            <div>
              <span className="block text-xs font-medium text-gray-400 mb-1">Last updated</span>
              Nov 12, 2023 at 2:40 PM
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
                <Tooltip
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
}: {
  onNewVersion?: () => void;
  onNavigateToOverview?: () => void;
  onNavigateToTab?: (tab: string) => void;
} = {}) {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return (
          <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white border-none">
            Active Version
          </Badge>
        );
      case "building":
        return (
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
            Build in Progress
          </Badge>
        );
      case "superseded":
        return (
          <Badge variant="outline" className="bg-gray-100 text-gray-400 border-gray-200">
            Superseded
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-2">
        <div>
          <h3 className="text-xl font-bold text-[#0A0A0A]">Version History</h3>
          <p className="text-sm text-gray-500">Manage deployment lifecycle and history.</p>
        </div>
        <Button
          className="bg-[#0A0A0A] hover:bg-gray-800 text-white"
          onClick={() => onNewVersion?.()}
        >
          <Plus size={16} className="mr-2" /> Start New Version
        </Button>
      </div>

      <div className="space-y-4">
        {VERSIONS.map((version) => (
          <div
            key={version.id}
            className={cn(
              "bg-white rounded-xl border p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all",
              version.status === "active"
                ? "border-emerald-200 shadow-emerald-500/5 shadow-sm ring-1 ring-emerald-100"
                : "border-gray-200 shadow-sm opacity-90 hover:opacity-100"
            )}
          >
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <h4 className="text-lg font-bold text-[#0A0A0A]">{version.id}</h4>
                {getStatusBadge(version.status)}
              </div>
              <p className="text-sm text-gray-600">{version.summary}</p>
              <div className="flex items-center gap-4 text-xs text-gray-400 mt-2">
                <span>Created {version.date}</span>
                <span>•</span>
                <span>by {version.author}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {version.status !== "superseded" && (
                <Button variant="outline" size="sm" className="border-gray-200">
                  View Signed Quote
                </Button>
              )}
              <Button
                size="sm"
                className={cn(
                  version.status === "active"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-[#0A0A0A] hover:bg-gray-800"
                )}
                onClick={() => {
                  if (version.status === "building") {
                    onNavigateToTab?.("Build Status");
                  } else {
                    onNavigateToOverview?.();
                  }
                }}
              >
                {version.status === "building" ? "Open Build Status" : "View Configuration"}{" "}
                <ChevronRight size={14} className="ml-1" />
              </Button>
            </div>
          </div>
        ))}
      </div>
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
