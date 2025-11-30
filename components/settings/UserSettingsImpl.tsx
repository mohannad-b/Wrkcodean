"use client";

import { useState } from "react";
import {
  User,
  Bell,
  Shield,
  Link,
  AlertTriangle,
  Camera,
  LogOut,
  Smartphone,
  Globe,
  Clock,
  CheckCircle2,
  Laptop,
  Key,
  Mail,
  Slack,
  LayoutTemplate,
  ChevronRight,
} from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import { currentUser } from "@/lib/mock-automations";

// --- Mock Data ---

const CONNECTED_ACCOUNTS = [
  {
    id: 1,
    name: "Google Drive",
    status: "connected",
    icon: LayoutTemplate,
    lastUsed: "2 hours ago",
  },
  { id: 2, name: "Salesforce", status: "expired", icon: Link, lastUsed: "3 days ago" },
  { id: 3, name: "Slack", status: "connected", icon: Slack, lastUsed: "Just now" },
];

const SESSIONS = [
  {
    id: 1,
    device: 'MacBook Pro 16"',
    location: "San Francisco, US",
    ip: "192.168.1.1",
    active: true,
    time: "Current Session",
  },
  {
    id: 2,
    device: "iPhone 14 Pro",
    location: "San Francisco, US",
    ip: "192.168.1.45",
    active: false,
    time: "Active 2h ago",
  },
  {
    id: 3,
    device: "Chrome / Windows",
    location: "Austin, US",
    ip: "10.0.0.4",
    active: false,
    time: "Active 1d ago",
  },
];

type UserTab = "profile" | "notifications" | "security" | "accounts" | "billing" | "danger";

export const UserSettings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<UserTab>("profile");
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      // TODO: Show success message
    }, 500);
  };

  const handleLogout = () => {
    // TODO: Handle logout
  };

  const handleConnectAccount = () => {
    // TODO: Open connect account modal
  };

  const handleReauthorize = () => {
    // TODO: Open reauthorize modal
  };

  const handleDisconnect = () => {
    // TODO: Open confirmation modal
  };

  const handleLogoutAll = () => {
    // TODO: Open confirmation modal
  };

  const handleDeleteAccount = () => {
    // TODO: Open confirmation modal
  };

  const tabs = [
    { id: "profile", label: "My Profile", icon: User },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "security", label: "Security", icon: Shield },
    { id: "accounts", label: "Connected Accounts", icon: Link },
  ];

  return (
    <div className="flex h-full bg-gray-50/50">
      {/* Left Navigation */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col h-full shrink-0">
        <div className="p-6 pb-4">
          <h2 className="text-lg font-bold text-[#0A0A0A]">Account Settings</h2>
          <p className="text-xs text-gray-500">Manage your personal preferences</p>
        </div>

        <div className="flex-1 py-2 px-3 space-y-1 overflow-y-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as UserTab)}
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

          <div className="pt-4 mt-4 border-t border-gray-100">
            <button
              onClick={() => setActiveTab("danger")}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                activeTab === "danger"
                  ? "bg-red-50 text-red-600"
                  : "text-gray-500 hover:bg-red-50 hover:text-red-600"
              )}
            >
              <AlertTriangle size={18} />
              Danger Zone
            </button>
          </div>

          <div className="pt-2">
            <Button
              variant="ghost"
              className="w-full justify-start text-gray-500 hover:text-gray-900 hover:bg-gray-50 px-3"
              onClick={handleLogout}
            >
              <LogOut size={18} className="mr-3" />
              Log Out
            </Button>
          </div>
        </div>
      </div>

      {/* Right Content */}
      <div className="flex-1 overflow-y-auto p-8 md:p-12">
        <div className="max-w-3xl mx-auto">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === "profile" && <ProfileTab onSave={handleSave} isSaving={isSaving} />}
            {activeTab === "notifications" && <NotificationsTab />}
            {activeTab === "security" && <SecurityTab onLogoutAll={handleLogoutAll} />}
            {activeTab === "accounts" && (
              <AccountsTab
                onConnect={handleConnectAccount}
                onReauthorize={handleReauthorize}
                onDisconnect={handleDisconnect}
              />
            )}
            {activeTab === "danger" && <DangerTab onDelete={handleDeleteAccount} />}
          </motion.div>
        </div>
      </div>
    </div>
  );
};

// --- 1. Profile ---
const ProfileTab = ({ onSave, isSaving }: { onSave?: () => void; isSaving?: boolean } = {}) => (
  <div className="space-y-6">
    <h3 className="text-xl font-bold text-[#0A0A0A] mb-6">My Profile</h3>

    {/* Task Snapshot */}
    <div className="bg-gradient-to-br from-[#0A0A0A] to-[#222] rounded-xl p-6 text-white shadow-lg flex items-center justify-between">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle2 size={18} className="text-[#E43632]" />
          <span className="text-sm font-bold uppercase tracking-wider text-gray-400">
            Pending Tasks
          </span>
        </div>
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-bold">4</span>
          <span className="text-sm text-gray-400">assigned to you</span>
        </div>
        <div className="mt-2 flex gap-2">
          <Badge
            variant="outline"
            className="bg-white/10 border-white/10 text-white hover:bg-white/20"
          >
            2 Approval Requests
          </Badge>
          <Badge
            variant="outline"
            className="bg-white/10 border-white/10 text-white hover:bg-white/20"
          >
            2 Reviews
          </Badge>
        </div>
      </div>
      <Button
        variant="outline"
        className="border-white/20 text-black hover:bg-white hover:text-black"
      >
        View All Tasks <ChevronRight size={16} className="ml-1" />
      </Button>
    </div>

    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 space-y-8">
      {/* Avatar */}
      <div className="flex items-center gap-6">
        <div className="relative group">
          <Avatar className="w-24 h-24 border-4 border-gray-50">
            <AvatarImage src={currentUser.avatar} />
            <AvatarFallback className="text-2xl bg-gray-100">AM</AvatarFallback>
          </Avatar>
          <div className="absolute inset-0 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
            <Camera className="text-white" size={24} />
          </div>
        </div>
        <div className="space-y-1">
          <h4 className="font-bold text-[#0A0A0A]">Profile Picture</h4>
          <p className="text-sm text-gray-500">JPG, GIF or PNG. Max 1MB.</p>
          <Button size="sm" variant="outline" className="mt-2 text-xs">
            Upload New
          </Button>
        </div>
      </div>

      <Separator />

      {/* Fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-sm font-bold text-gray-700">Full Name</label>
          <Input defaultValue={currentUser.name} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-bold text-gray-700">Email Address</label>
          <div className="relative">
            <Input
              defaultValue="adrian@wrk.com"
              readOnly
              className="bg-gray-50 pr-12 text-gray-500"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <Badge variant="secondary" className="text-[10px] h-5 bg-gray-200 text-gray-600">
                SSO
              </Badge>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-bold text-gray-700">Role</label>
          <Input defaultValue="Engineering Lead" readOnly className="bg-gray-50 text-gray-500" />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-bold text-gray-700">Phone Number</label>
          <div className="relative">
            <Smartphone
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              size={16}
            />
            <Input className="pl-9" placeholder="+1 (555) 000-0000" />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-bold text-gray-700">Preferred Language</label>
          <div className="relative">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <Select defaultValue="en">
              <SelectTrigger className="pl-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English (US)</SelectItem>
                <SelectItem value="fr">French</SelectItem>
                <SelectItem value="es">Spanish</SelectItem>
              </SelectContent>
            </Select>
          </div>
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

      <div className="flex justify-end pt-4">
        <Button
          className="bg-[#E43632] hover:bg-[#C12E2A] text-white"
          onClick={() => onSave?.()}
          disabled={isSaving}
        >
          {isSaving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  </div>
);

// --- 2. Notifications ---
const NotificationsTab = () => (
  <div className="space-y-6">
    <h3 className="text-xl font-bold text-[#0A0A0A] mb-2">Notification Preferences</h3>

    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-8">
      <div className="grid grid-cols-3 gap-4 bg-gray-50 p-4 rounded-lg">
        <div className="col-span-3 md:col-span-1">
          <h4 className="font-bold text-[#0A0A0A]">Channels</h4>
          <p className="text-xs text-gray-500">Where should we send alerts?</p>
        </div>
        <div className="col-span-3 md:col-span-2 flex flex-wrap gap-6">
          <div className="flex items-center gap-2">
            <Switch defaultChecked id="email-notif" />
            <label htmlFor="email-notif" className="text-sm font-medium flex items-center gap-2">
              <Mail size={14} /> Email
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Switch defaultChecked id="slack-notif" />
            <label htmlFor="slack-notif" className="text-sm font-medium flex items-center gap-2">
              <Slack size={14} /> Slack
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Switch defaultChecked id="inapp-notif" />
            <label htmlFor="inapp-notif" className="text-sm font-medium flex items-center gap-2">
              <Bell size={14} /> In-App
            </label>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="font-bold text-[#0A0A0A] border-b border-gray-100 pb-2">Activity Alerts</h4>

        {[
          {
            label: "Approval Requests",
            desc: "When a quote or automation needs your approval",
            default: true,
          },
          {
            label: "Review Requests",
            desc: "When you are tagged for a peer review",
            default: true,
          },
          {
            label: "Missing Information",
            desc: "When a workflow is blocked by missing data",
            default: true,
          },
          {
            label: "Exceptions & Errors",
            desc: "Critical failures in your owned automations",
            default: true,
          },
          {
            label: "Version Approved",
            desc: "When a version you created is approved",
            default: false,
          },
          { label: "Build Completed", desc: "When an automation build finishes", default: true },
          {
            label: "Access Issues",
            desc: "When a user requests access to your resources",
            default: false,
          },
        ].map((item, i) => (
          <div key={i} className="flex items-center justify-between py-1">
            <div>
              <p className="text-sm font-bold text-gray-700">{item.label}</p>
              <p className="text-xs text-gray-500">{item.desc}</p>
            </div>
            <Switch defaultChecked={item.default} />
          </div>
        ))}
      </div>

      <div className="space-y-4 pt-2">
        <h4 className="font-bold text-[#0A0A0A] border-b border-gray-100 pb-2">Digests</h4>
        <div className="flex items-center justify-between py-1">
          <div>
            <p className="text-sm font-bold text-gray-700">Daily Digest</p>
            <p className="text-xs text-gray-500">Summary of day&apos;s activity at 9:00 AM</p>
          </div>
          <Switch />
        </div>
        <div className="flex items-center justify-between py-1">
          <div>
            <p className="text-sm font-bold text-gray-700">Weekly Report</p>
            <p className="text-xs text-gray-500">Performance insights every Monday</p>
          </div>
          <Switch defaultChecked />
        </div>
      </div>
    </div>
  </div>
);

// --- 3. Connected Accounts ---
const AccountsTab = ({
  onConnect,
  onReauthorize,
  onDisconnect,
}: {
  onConnect?: () => void;
  onReauthorize?: (name: string) => void;
  onDisconnect?: (name: string) => void;
} = {}) => (
  <div className="space-y-6">
    <div className="flex justify-between items-center mb-2">
      <h3 className="text-xl font-bold text-[#0A0A0A]">Connected Accounts</h3>
      <Button variant="outline" onClick={() => onConnect?.()}>
        <Link size={16} className="mr-2" /> Connect New Account
      </Button>
    </div>

    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="grid grid-cols-1 divide-y divide-gray-100">
        {CONNECTED_ACCOUNTS.map((acc) => (
          <div
            key={acc.id}
            className="p-6 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center text-gray-600 border border-gray-200">
                <acc.icon size={24} />
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h4 className="font-bold text-[#0A0A0A]">{acc.name}</h4>
                  {acc.status === "connected" ? (
                    <Badge
                      variant="outline"
                      className="text-emerald-600 bg-emerald-50 border-emerald-200 text-[10px]"
                    >
                      Connected
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-red-600 bg-red-50 border-red-200 text-[10px]"
                    >
                      Needs Reauth
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1">Last used {acc.lastUsed}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {acc.status === "expired" && (
                <Button
                  size="sm"
                  className="bg-[#E43632] hover:bg-[#C12E2A] text-white"
                  onClick={() => onReauthorize?.(acc.name)}
                >
                  Reauthorize
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="text-gray-600 border-gray-200 hover:text-red-600 hover:bg-red-50 hover:border-red-200"
                onClick={() => onDisconnect?.(acc.name)}
              >
                Disconnect
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// --- 4. Security ---
const SecurityTab = ({ onLogoutAll }: { onLogoutAll?: () => void } = {}) => (
  <div className="space-y-6">
    <h3 className="text-xl font-bold text-[#0A0A0A] mb-2">Security</h3>

    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-8">
      {/* SSO Status */}
      <div className="flex items-start gap-4 p-4 bg-blue-50 border border-blue-100 rounded-lg">
        <div className="p-2 bg-blue-100 rounded-full text-blue-600 shrink-0">
          <Shield size={18} />
        </div>
        <div>
          <h4 className="font-bold text-blue-900 text-sm">SSO Enabled</h4>
          <p className="text-xs text-blue-700 mt-1">
            Your account is managed via your organization&apos;s Identity Provider (Okta). Password
            changes must be handled there.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="font-bold text-[#0A0A0A] border-b border-gray-100 pb-2">Authentication</h4>
        <div className="flex items-center justify-between py-2">
          <div>
            <p className="text-sm font-bold text-gray-700">Password</p>
            <p className="text-xs text-gray-500">Last changed 3 months ago</p>
          </div>
          <Button variant="outline" disabled>
            Change Password
          </Button>
        </div>
        <div className="flex items-center justify-between py-2">
          <div>
            <p className="text-sm font-bold text-gray-700">Two-Factor Authentication (2FA)</p>
            <p className="text-xs text-gray-500">Secure your account with an authenticator app</p>
          </div>
          <Button variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50">
            Enabled
          </Button>
        </div>
      </div>

      <div className="space-y-4 pt-2">
        <div className="flex items-center justify-between border-b border-gray-100 pb-2">
          <h4 className="font-bold text-[#0A0A0A]">Active Sessions</h4>
          <Button
            variant="ghost"
            className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8 text-xs"
            onClick={() => onLogoutAll?.()}
          >
            Log Out of All Devices
          </Button>
        </div>

        <div className="space-y-3">
          {SESSIONS.map((session) => (
            <div
              key={session.id}
              className="flex items-center justify-between p-3 border border-gray-100 rounded-lg"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gray-100 rounded text-gray-500">
                  {session.device.includes("iPhone") ? (
                    <Smartphone size={18} />
                  ) : (
                    <Laptop size={18} />
                  )}
                </div>
                <div>
                  <p className="text-sm font-bold text-[#0A0A0A]">{session.device}</p>
                  <p className="text-xs text-gray-500">
                    {session.location} • {session.ip}
                  </p>
                </div>
              </div>
              <div className="text-right">
                {session.active ? (
                  <Badge
                    variant="outline"
                    className="text-emerald-600 bg-emerald-50 border-emerald-200"
                  >
                    Current
                  </Badge>
                ) : (
                  <span className="text-xs text-gray-400">{session.time}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* API Tokens (Collapsed) */}
      <div className="pt-4">
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 flex items-center justify-between cursor-pointer">
            <div className="flex items-center gap-2">
              <Key size={16} className="text-gray-500" />
              <span className="text-sm font-bold text-gray-700">Personal API Tokens</span>
            </div>
            <Badge variant="secondary" className="text-[10px]">
              0 Active
            </Badge>
          </div>
        </div>
      </div>
    </div>
  </div>
);

// --- 5. Danger Zone ---
const DangerTab = ({ onDelete }: { onDelete?: () => void } = {}) => (
  <div className="space-y-6">
    <h3 className="text-xl font-bold text-red-600 mb-2">Danger Zone</h3>

    <div className="bg-white rounded-xl border border-red-100 shadow-sm p-6">
      <div className="space-y-6">
        <div>
          <h4 className="font-bold text-[#0A0A0A] text-lg">Delete Account</h4>
          <p className="text-sm text-gray-500 mt-1 max-w-xl">
            Permanently remove your account and all of its content from the WRK platform. This
            action is not reversible, so please continue with caution.
          </p>
        </div>

        <div className="p-4 bg-red-50 border border-red-100 rounded-lg text-sm text-red-800 flex items-start gap-3">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Warning</p>
            <p className="text-xs mt-1 text-red-700">
              Since you are a Workspace Admin, you must transfer ownership of{" "}
              <strong>Acme Corp</strong> before deleting your account.
            </p>
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <Button
            variant="destructive"
            className="bg-red-600 hover:bg-red-700"
            onClick={() => onDelete?.()}
          >
            Delete My Account
          </Button>
        </div>
      </div>
    </div>
  </div>
);
