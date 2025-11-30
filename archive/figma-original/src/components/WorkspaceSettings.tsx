import React, { useState } from 'react';
import { 
  Building2, 
  CreditCard, 
  Users, 
  HardDrive, 
  Bell, 
  Shield, 
  Palette, 
  Save, 
  Upload, 
  Download, 
  Plus, 
  CheckCircle2, 
  AlertTriangle, 
  ExternalLink,
  Globe,
  Clock,
  DollarSign,
  Slack,
  Mail,
  FileText,
  Lock,
  LogOut,
  ChevronRight
} from 'lucide-react';
import { motion } from 'motion/react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Separator } from "./ui/separator";
import { cn } from '../lib/utils';

// --- Mock Data ---
const USAGE_DATA = Array.from({ length: 12 }, (_, i) => ({
  month: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][i],
  units: Math.floor(Math.random() * 50000) + 10000,
  cost: Math.floor(Math.random() * 2000) + 500,
}));

const INVOICES = [
  { id: 'INV-2023-012', date: 'Nov 01, 2023', amount: '$1,250.00', status: 'Paid' },
  { id: 'INV-2023-011', date: 'Oct 01, 2023', amount: '$1,180.50', status: 'Paid' },
  { id: 'INV-2023-010', date: 'Sep 01, 2023', amount: '$950.00', status: 'Paid' },
];

const SYSTEMS = [
  { id: 1, name: "Salesforce", status: "connected", authBy: "Sarah Chen", date: "Oct 12, 2023" },
  { id: 2, name: "Xero", status: "reauth", authBy: "System", date: "Expired yesterday" },
  { id: 3, name: "Slack", status: "connected", authBy: "Mike Ross", date: "Sep 28, 2023" },
  { id: 4, name: "Google Drive", status: "connected", authBy: "Sarah Chen", date: "Aug 15, 2023" },
];

const AUDIT_LOGS = [
  { id: 1, action: 'Changed Payment Method', user: 'Sarah Chen', time: '2 hours ago', ip: '192.168.1.1' },
  { id: 2, action: 'Invited "Mike Ross" (Editor)', user: 'Sarah Chen', time: 'Yesterday', ip: '192.168.1.1' },
  { id: 3, action: 'Enabled MFA', user: 'System', time: 'Oct 25', ip: '-' },
];

type SettingsTab = 'profile' | 'billing' | 'members' | 'systems' | 'notifications' | 'security' | 'branding';

export const WorkspaceSettings: React.FC<{ defaultTab?: SettingsTab }> = ({ defaultTab = 'profile' }) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>(defaultTab);

  // Effect to update activeTab if defaultTab changes
  React.useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  const tabs = [
    { id: 'profile', label: 'Workspace Profile', icon: Building2 },
    { id: 'billing', label: 'Billing & Usage', icon: CreditCard },
    { id: 'members', label: 'Members & Roles', icon: Users },
    { id: 'systems', label: 'Global Systems', icon: HardDrive },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'branding', label: 'Branding', icon: Palette },
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
           <Button variant="outline" className="w-full justify-start text-gray-500 hover:text-red-600 hover:bg-red-50 border-transparent">
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
             {activeTab === 'profile' && <ProfileSettings />}
             {activeTab === 'billing' && <BillingSettings />}
             {activeTab === 'members' && <MembersSettings />}
             {activeTab === 'systems' && <SystemsSettings />}
             {activeTab === 'notifications' && <NotificationsSettings />}
             {activeTab === 'security' && <SecuritySettings />}
             {activeTab === 'branding' && <BrandingSettings />}
           </motion.div>
        </div>
      </div>
    </div>
  );
};

// --- 1. Workspace Profile ---
const ProfileSettings = () => (
  <div className="space-y-6">
    <div className="flex justify-between items-center mb-2">
      <h3 className="text-xl font-bold text-[#0A0A0A]">Workspace Profile</h3>
      <Button className="bg-[#0A0A0A] hover:bg-gray-800 text-white">
        <Save size={16} className="mr-2" /> Save Changes
      </Button>
    </div>

    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 space-y-8">
       <div className="flex items-center gap-6">
          <div className="w-24 h-24 rounded-xl bg-gray-100 flex items-center justify-center border-2 border-dashed border-gray-300 cursor-pointer hover:border-[#E43632] hover:bg-red-50 transition-colors group relative overflow-hidden">
             <Building2 size={32} className="text-gray-400 group-hover:text-[#E43632]" />
             <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 flex items-center justify-center transition-colors">
                <span className="text-xs font-bold text-[#E43632] opacity-0 group-hover:opacity-100">Change</span>
             </div>
          </div>
          <div className="space-y-1">
             <h4 className="font-bold text-[#0A0A0A]">Workspace Logo</h4>
             <p className="text-sm text-gray-500">Used in emails and PDF quotes.</p>
             <div className="flex gap-2 mt-2">
                <Button size="sm" variant="outline" className="text-xs">Remove</Button>
                <Button size="sm" variant="outline" className="text-xs">Upload New</Button>
             </div>
          </div>
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
const BillingSettings = () => (
  <div className="space-y-6">
    <div className="flex justify-between items-center mb-2">
      <h3 className="text-xl font-bold text-[#0A0A0A]">Billing & Usage</h3>
      <Button className="bg-[#E43632] hover:bg-[#C12E2A] text-white">
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
                   <XAxis dataKey="month" axisLine={false} tickLine={false} fontSize={12} tick={{fill: '#9ca3af'}} />
                   <YAxis axisLine={false} tickLine={false} fontSize={12} tick={{fill: '#9ca3af'}} />
                   <Tooltip cursor={{fill: '#f9fafb'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)'}} />
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
             <Button variant="outline" size="sm" className="w-full text-xs">Update Card</Button>
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
             <Button variant="ghost" size="sm" className="mt-2 h-8 text-xs text-[#E43632] p-0 hover:bg-transparent hover:underline">+ Add Contact</Button>
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
             <div key={inv.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
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
                   <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">{inv.status}</Badge>
                   <Button variant="ghost" size="icon">
                      <Download size={16} className="text-gray-400" />
                   </Button>
                </div>
             </div>
          ))}
       </div>
    </div>
  </div>
);

// --- 3. Workspace Members (Summary) ---
const MembersSettings = () => (
  <div className="space-y-6">
    <div className="bg-gradient-to-r from-[#0A0A0A] to-[#333] rounded-xl p-8 text-white shadow-lg relative overflow-hidden">
       <div className="relative z-10">
          <div className="flex items-center justify-between mb-4">
             <h3 className="text-2xl font-bold">Manage Your Team</h3>
             <Users size={32} className="opacity-50" />
          </div>
          <p className="text-gray-300 mb-6 max-w-lg">
             Control access, assign roles, and manage workspace permissions for all your team members in the dedicated Teams view.
          </p>
          <div className="flex items-center gap-4">
             <Button className="bg-white text-black hover:bg-gray-100 border-none">
                Go to Teams View <ExternalLink size={16} className="ml-2" />
             </Button>
             <div className="flex -space-x-2">
                {[1,2,3,4].map(i => (
                   <div key={i} className="w-8 h-8 rounded-full bg-gray-600 border-2 border-[#0A0A0A] flex items-center justify-center text-xs font-bold">
                      {String.fromCharCode(64+i)}
                   </div>
                ))}
                <div className="w-8 h-8 rounded-full bg-gray-700 border-2 border-[#0A0A0A] flex items-center justify-center text-xs text-gray-300">+5</div>
             </div>
          </div>
       </div>
       <div className="absolute right-0 bottom-0 opacity-10 transform translate-x-1/4 translate-y-1/4">
          <Users size={300} />
       </div>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
       <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h4 className="font-bold text-[#0A0A0A] mb-4">Default Permissions</h4>
          <div className="space-y-4">
             <div className="space-y-2">
                <label className="text-sm text-gray-600">New Member Default Role</label>
                <Select defaultValue="viewer">
                   <SelectTrigger>
                      <SelectValue />
                   </SelectTrigger>
                   <SelectContent>
                      <SelectItem value="viewer">Viewer</SelectItem>
                      <SelectItem value="editor">Editor (Invite Only)</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                   </SelectContent>
                </Select>
                <p className="text-xs text-gray-400">
                   Viewers can see all active automations but cannot make changes.
                </p>
             </div>
             <div className="flex items-center justify-between pt-2">
                <label className="text-sm text-gray-600">Allow Public Share Links</label>
                <Switch />
             </div>
          </div>
       </div>

       <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 opacity-50">
          <div className="flex items-center justify-between mb-4">
             <h4 className="font-bold text-[#0A0A0A] flex items-center gap-2">
                <Lock size={16} /> Single Sign-On (SSO)
             </h4>
             <Badge variant="outline">Enterprise</Badge>
          </div>
          <p className="text-sm text-gray-500 mb-4">
             Enforce SAML 2.0 authentication via Okta, Azure AD, or Google Workspace.
          </p>
          <Button variant="outline" disabled className="w-full">Upgrade to Enable SSO</Button>
       </div>
    </div>
  </div>
);

// --- 4. Global Systems ---
const SystemsSettings = () => (
  <div className="space-y-6">
    <div className="flex justify-between items-center mb-2">
      <h3 className="text-xl font-bold text-[#0A0A0A]">Global Integrations</h3>
      <Button className="bg-[#0A0A0A] hover:bg-gray-800 text-white">
        <Plus size={16} className="mr-2" /> Add System
      </Button>
    </div>

    <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex gap-3 text-blue-800">
       <Shield size={20} className="shrink-0" />
       <div>
          <p className="text-sm font-bold">Security Note</p>
          <p className="text-xs text-blue-700">
             Connections authenticated here are available to all workspace Editors. Use specific automation-level overrides for restricted accounts.
          </p>
       </div>
    </div>

    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
       <div className="grid grid-cols-1 divide-y divide-gray-100">
          {SYSTEMS.map((sys) => (
             <div key={sys.id} className="p-5 flex items-center justify-between hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-4">
                   <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-gray-500 border border-gray-200">
                      <HardDrive size={20} />
                   </div>
                   <div>
                      <div className="flex items-center gap-2">
                         <h4 className="font-bold text-[#0A0A0A]">{sys.name}</h4>
                         {sys.status === 'connected' ? (
                            <Badge variant="outline" className="text-emerald-600 bg-emerald-50 border-emerald-200 text-[10px] h-5 px-1.5">Connected</Badge>
                         ) : (
                            <Badge variant="outline" className="text-red-600 bg-red-50 border-red-200 text-[10px] h-5 px-1.5">Action Required</Badge>
                         )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                         Auth by {sys.authBy} • {sys.date}
                      </p>
                   </div>
                </div>
                <div className="flex items-center gap-2">
                   <Button variant="outline" size="sm" className="text-xs border-gray-200">Test Connection</Button>
                   {sys.status === 'reauth' ? (
                      <Button size="sm" className="bg-[#E43632] hover:bg-[#C12E2A] text-white text-xs">Reconnect</Button>
                   ) : (
                      <Button variant="ghost" size="icon" className="text-gray-400">
                         <ChevronRight size={16} />
                      </Button>
                   )}
                </div>
             </div>
          ))}
       </div>
    </div>
  </div>
);

// --- 5. Notifications ---
const NotificationsSettings = () => (
  <div className="space-y-6">
    <h3 className="text-xl font-bold text-[#0A0A0A] mb-2">Alerts & Notifications</h3>
    
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-6">
       <div className="space-y-4">
          <h4 className="font-bold text-[#0A0A0A] border-b border-gray-100 pb-2">Workspace Channels</h4>
          
          <div className="flex items-center justify-between">
             <div className="flex items-center gap-3">
                <div className="p-2 bg-gray-100 rounded">
                   <Slack size={20} />
                </div>
                <div>
                   <p className="text-sm font-bold text-[#0A0A0A]">Slack Alerts</p>
                   <p className="text-xs text-gray-500">Post critical errors to a channel</p>
                </div>
             </div>
             <Select defaultValue="eng-alerts">
                <SelectTrigger className="w-[200px]">
                   <SelectValue />
                </SelectTrigger>
                <SelectContent>
                   <SelectItem value="eng-alerts">#eng-alerts</SelectItem>
                   <SelectItem value="general">#general</SelectItem>
                   <SelectItem value="ops">#ops-notifications</SelectItem>
                </SelectContent>
             </Select>
          </div>

          <div className="flex items-center justify-between">
             <div className="flex items-center gap-3">
                <div className="p-2 bg-gray-100 rounded">
                   <Mail size={20} />
                </div>
                <div>
                   <p className="text-sm font-bold text-[#0A0A0A]">Weekly Digest</p>
                   <p className="text-xs text-gray-500">Summary of usage and performance</p>
                </div>
             </div>
             <Switch defaultChecked />
          </div>
       </div>

       <div className="space-y-4 pt-2">
          <h4 className="font-bold text-[#0A0A0A] border-b border-gray-100 pb-2">Global Triggers</h4>
          {[
            { label: 'Critical Errors & Exceptions', checked: true },
            { label: 'Volume Overage Warning (>80%)', checked: true },
            { label: 'New System Connection Added', checked: false },
            { label: 'Quote Ready for Signature', checked: true },
            { label: 'Automation Build Completed', checked: true },
          ].map((item, i) => (
             <div key={i} className="flex items-center justify-between py-1">
                <span className="text-sm text-gray-700">{item.label}</span>
                <Switch defaultChecked={item.checked} />
             </div>
          ))}
       </div>
    </div>
  </div>
);

// --- 6. Security ---
const SecuritySettings = () => (
  <div className="space-y-6">
    <h3 className="text-xl font-bold text-[#0A0A0A] mb-2">Security & Compliance</h3>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
       <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-4">
             <div className="p-2 bg-red-50 rounded text-[#E43632]">
                <Shield size={20} />
             </div>
             <h4 className="font-bold text-[#0A0A0A]">Access Control</h4>
          </div>
          <div className="space-y-4">
             <div className="flex items-center justify-between">
                <div>
                   <p className="text-sm font-bold text-gray-700">Enforce MFA</p>
                   <p className="text-xs text-gray-500">Require 2FA for all members</p>
                </div>
                <Switch />
             </div>
             <Separator />
             <div className="flex items-center justify-between">
                <div>
                   <p className="text-sm font-bold text-gray-700">Data Export</p>
                   <p className="text-xs text-gray-500">Who can download customer data?</p>
                </div>
                <Select defaultValue="admins">
                   <SelectTrigger className="w-[120px] h-8 text-xs">
                      <SelectValue />
                   </SelectTrigger>
                   <SelectContent>
                      <SelectItem value="admins">Admins Only</SelectItem>
                      <SelectItem value="editors">Editors+</SelectItem>
                   </SelectContent>
                </Select>
             </div>
          </div>
       </div>

       <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-4">
             <div className="p-2 bg-gray-100 rounded text-gray-600">
                <Lock size={20} />
             </div>
             <h4 className="font-bold text-[#0A0A0A]">Session Settings</h4>
          </div>
          <div className="space-y-4">
             <div className="space-y-2">
                <label className="text-sm text-gray-600">Session Timeout</label>
                <Select defaultValue="12h">
                   <SelectTrigger>
                      <SelectValue />
                   </SelectTrigger>
                   <SelectContent>
                      <SelectItem value="1h">1 Hour</SelectItem>
                      <SelectItem value="12h">12 Hours</SelectItem>
                      <SelectItem value="7d">7 Days</SelectItem>
                   </SelectContent>
                </Select>
             </div>
             <Button variant="outline" className="w-full text-red-600 border-red-100 hover:bg-red-50 hover:text-red-700">
                Revoke All Active Sessions
             </Button>
          </div>
       </div>
    </div>

    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
       <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
          <h4 className="font-bold text-[#0A0A0A]">Audit Log</h4>
          <Button variant="ghost" size="sm" className="text-xs text-gray-500">Export CSV</Button>
       </div>
       <div className="divide-y divide-gray-100">
          {AUDIT_LOGS.map((log) => (
             <div key={log.id} className="px-6 py-3 text-sm flex items-center justify-between">
                <div className="flex items-center gap-3">
                   <div className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                   <div>
                      <p className="font-medium text-[#0A0A0A]">{log.action}</p>
                      <p className="text-xs text-gray-500">by {log.user} • {log.time}</p>
                   </div>
                </div>
                <span className="text-xs font-mono text-gray-400">{log.ip}</span>
             </div>
          ))}
       </div>
    </div>
  </div>
);

// --- 7. Branding ---
const BrandingSettings = () => (
  <div className="space-y-6">
    <div className="flex justify-between items-center mb-2">
       <div>
          <h3 className="text-xl font-bold text-[#0A0A0A]">Custom Branding</h3>
          <p className="text-sm text-gray-500">Customize the look of contributor forms and PDF exports.</p>
       </div>
       <Button className="bg-[#0A0A0A] hover:bg-gray-800 text-white">Publish Changes</Button>
    </div>

    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8">
       <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          <div className="space-y-6">
             <div>
                <label className="text-sm font-bold text-gray-700 mb-2 block">Brand Color</label>
                <div className="flex gap-3">
                   <div className="w-10 h-10 rounded-lg bg-[#E43632] ring-2 ring-offset-2 ring-[#E43632] cursor-pointer" />
                   <div className="w-10 h-10 rounded-lg bg-[#0A0A0A] border border-gray-200 cursor-pointer" />
                   <div className="w-10 h-10 rounded-lg bg-blue-600 border border-gray-200 cursor-pointer" />
                   <div className="w-10 h-10 rounded-lg bg-white border border-dashed border-gray-300 flex items-center justify-center text-gray-400 cursor-pointer">
                      <Plus size={16} />
                   </div>
                </div>
             </div>

             <div>
                <label className="text-sm font-bold text-gray-700 mb-2 block">Company Logo (Dark Mode)</label>
                <div className="bg-gray-900 p-6 rounded-xl flex items-center justify-center border border-gray-700 border-dashed">
                   <div className="text-gray-500 text-sm flex flex-col items-center gap-2">
                      <Upload size={24} />
                      <span>Drag & drop logo here</span>
                   </div>
                </div>
             </div>
          </div>

          {/* Preview */}
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-6 relative overflow-hidden">
             <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Preview: Quote PDF</p>
             
             <div className="bg-white shadow-lg rounded-sm p-6 w-full h-[240px] flex flex-col border border-gray-100 relative">
                <div className="flex justify-between items-start mb-6">
                   <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-[#E43632] rounded" />
                      <span className="font-bold text-sm">Acme Corp</span>
                   </div>
                   <div className="text-[10px] text-right text-gray-400">
                      DATE: OCT 24<br/>
                      INV: #001
                   </div>
                </div>
                <div className="h-2 w-1/3 bg-gray-100 rounded mb-2" />
                <div className="h-2 w-1/2 bg-gray-100 rounded mb-6" />
                
                <div className="border-t border-gray-100 pt-4 mt-auto">
                   <div className="flex justify-between text-xs font-bold">
                      <span>Total</span>
                      <span>$1,250.00</span>
                   </div>
                </div>
             </div>
          </div>
       </div>
    </div>
  </div>
);
