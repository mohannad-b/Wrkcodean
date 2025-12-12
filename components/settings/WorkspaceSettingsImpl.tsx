"use client";

import { useState, useEffect } from "react";
import { Building2, CreditCard, Save, Download, CheckCircle2, Globe, Clock, Mail, FileText, LogOut } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SecureUploader } from "@/components/files/SecureUploader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

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

type SettingsTab = "profile" | "billing";

export const WorkspaceSettings: React.FC<{ defaultTab?: SettingsTab }> = ({
  defaultTab = "profile",
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>(defaultTab);
  const [isSaving, setIsSaving] = useState(false);

  // Effect to update activeTab if defaultTab changes
  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      // TODO: Show success message
    }, 500);
  };

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
    { id: "billing", label: "Billing & Usage", icon: CreditCard },
  ];

  return (
    <div className="flex h-full bg-gray-50/50">
      {/* Left Navigation */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col h-full shrink-0">
        <div className="p-6 pb-4">
          <h2 className="text-lg font-bold text-[#0A0A0A]">Workspace</h2>
          <p className="text-xs text-gray-500">Acme Corp Global Settings</p>
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
            {activeTab === "profile" && <ProfileSettings onSave={handleSave} isSaving={isSaving} />}
            {activeTab === "billing" && (
              <BillingSettings
                onDownloadInvoice={handleDownloadInvoice}
                onUpdateCard={handleUpdateCard}
                onAddContact={handleAddContact}
              />
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
};

// --- 1. Workspace Profile ---
const ProfileSettings = ({
  onSave,
  isSaving,
}: { onSave?: () => void; isSaving?: boolean } = {}) => (
  <div className="space-y-6">
    <div className="flex justify-between items-center mb-2">
      <h3 className="text-xl font-bold text-[#0A0A0A]">Workspace Profile</h3>
      <Button
        className="bg-[#0A0A0A] hover:bg-gray-800 text-white"
        onClick={() => onSave?.()}
        disabled={isSaving}
      >
        <Save size={16} className="mr-2" /> {isSaving ? "Saving..." : "Save Changes"}
      </Button>
    </div>

    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 space-y-8">
      <div className="space-y-2">
        <h4 className="font-bold text-[#0A0A0A]">Workspace Logo</h4>
        <p className="text-sm text-gray-500">Used in emails, PDFs, and task notifications.</p>
        <SecureUploader
          purpose="workspace_logo"
          resourceType="workspace"
          resourceId="current"
          accept="image/png,image/jpeg,image/webp, image/svg+xml"
          maxSizeMb={8}
          title="Workspace Logo"
        />
      </div>

      <Separator />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-sm font-bold text-gray-700">Workspace Name</label>
          <Input defaultValue="Acme Corp" />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-bold text-gray-700">Company Domain</label>
          <div className="relative">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <Input defaultValue="acmecorp.com" className="pl-9 bg-gray-50" readOnly />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-600 flex items-center gap-1 text-xs font-bold">
              <CheckCircle2 size={12} /> Verified
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-bold text-gray-700">Industry</label>
          <Select defaultValue="tech">
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
          <Select defaultValue="usd">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="usd">USD ($)</SelectItem>
              <SelectItem value="eur">EUR (€)</SelectItem>
              <SelectItem value="gbp">GBP (£)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-bold text-gray-700">Timezone</label>
          <div className="relative">
            <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <Select defaultValue="est">
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
