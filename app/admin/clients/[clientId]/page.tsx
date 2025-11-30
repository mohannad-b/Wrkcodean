"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Mail,
  MessageSquare,
  ExternalLink,
  MoreHorizontal,
  Plus,
  DollarSign,
  FileText,
  BarChart3,
  LayoutGrid,
} from "lucide-react";
import { mockClients, Client } from "@/lib/mock-clients";
import { mockAdminProjects, getClientSpendSummary, ProjectMessage, AdminProject, SpendSummary } from "@/lib/admin-mock";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ConversationThread } from "@/components/admin/ConversationThread";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface ClientDetailPageProps {
  params: {
    clientId: string;
  };
}


// Mock data for client-specific features
const mockClientQuotes = [
  { id: "Q-1024", project: "Invoice Processing", version: "v1.1", fee: 1350, price: 0.04, tier: "Standard", status: "Draft", date: "Oct 24, 2025" },
  { id: "Q-1020", project: "Inventory Sync", version: "v2.0", fee: 2500, price: 0.085, tier: "High Vol", status: "Signed", date: "Oct 10, 2025" },
  { id: "Q-1005", project: "Invoice Processing", version: "v1.0", fee: 1000, price: 0.04, tier: "Standard", status: "Signed", date: "Sep 15, 2025" },
];

const mockClientContacts = [
  { name: "John Doe", email: "john@acme.com", role: "VP of Ops", channel: "Slack" },
  { name: "Jane Smith", email: "jane@acme.com", role: "Finance Lead", channel: "Email" },
  { name: "Robert Tables", email: "bobby@acme.com", role: "IT Admin", channel: "Email" },
];

const mockClientChat: ProjectMessage[] = [
  {
    id: "1",
    projectId: "",
    type: "client",
    sender: { name: "John Doe", role: "Client Lead" },
    text: "Hey Sarah, quick question about the Invoice Processing update.",
    timestamp: "2h ago",
  },
  {
    id: "2",
    projectId: "",
    type: "ops",
    sender: { name: "Sarah Connor", role: "Head of Ops", avatar: "https://github.com/shadcn.png" },
    text: "Hi John! Sure thing, what's on your mind?",
    timestamp: "1h ago",
  },
  {
    id: "3",
    projectId: "",
    type: "client",
    sender: { name: "John Doe", role: "Client Lead" },
    text: "Are we still on track for the v1.1 release next week?",
    timestamp: "1h ago",
  },
  {
    id: "4",
    projectId: "",
    type: "ops",
    sender: { name: "Sarah Connor", role: "Head of Ops", avatar: "https://github.com/shadcn.png" },
    text: "Yes, we are currently in the final QA phase. Looks good for Tuesday.",
    timestamp: "30m ago",
  },
];

// Overview Tab
function OverviewTab({ client, clientProjects, spendSummary }: { client: Client; clientProjects: AdminProject[]; spendSummary: SpendSummary }) {
  const utilization = spendSummary.utilizationPercent;

  return (
    <div className="p-6 space-y-8 h-full overflow-y-auto">
      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="p-4 flex flex-col gap-2 border-gray-200 shadow-sm">
          <div className="flex justify-between items-start">
            <p className="text-xs font-bold text-gray-500 uppercase">Active Spend</p>
            <DollarSign size={16} className="text-gray-400" />
          </div>
          <div>
            <p className="text-2xl font-bold font-mono text-[#0A0A0A]">
              ${spendSummary.currentMonthSpend.toLocaleString()}
            </p>
            <p className="text-xs text-gray-400 mt-1">Monthly recurring</p>
          </div>
        </Card>

        <Card className="p-4 flex flex-col gap-2 border-gray-200 shadow-sm">
          <div className="flex justify-between items-start">
            <p className="text-xs font-bold text-gray-500 uppercase">Committed</p>
            <FileText size={16} className="text-gray-400" />
          </div>
          <div>
            <p className="text-2xl font-bold font-mono text-gray-500">
              ${spendSummary.committedMonthlySpend.toLocaleString()}
            </p>
            <p className="text-xs text-gray-400 mt-1">Contracted minimums</p>
          </div>
        </Card>

        <Card className="p-4 flex flex-col gap-2 border-gray-200 shadow-sm">
          <div className="flex justify-between items-start">
            <p className="text-xs font-bold text-gray-500 uppercase">Utilization</p>
            <BarChart3 size={16} className="text-gray-400" />
          </div>
          <div>
            <p
              className={cn(
                "text-2xl font-bold font-mono",
                utilization > 100 ? "text-red-600" : "text-emerald-600"
              )}
            >
              {utilization.toFixed(0)}%
            </p>
            <p className="text-xs text-gray-400 mt-1">Active / Committed</p>
          </div>
        </Card>

        <Card className="p-4 flex flex-col gap-2 border-gray-200 shadow-sm">
          <div className="flex justify-between items-start">
            <p className="text-xs font-bold text-gray-500 uppercase">Active Projects</p>
            <LayoutGrid size={16} className="text-gray-400" />
          </div>
          <div>
            <p className="text-2xl font-bold font-mono text-[#0A0A0A]">{clientProjects.length}</p>
            <p className="text-xs text-gray-400 mt-1">
              {clientProjects.filter((p) => p.status === "Live").length} Live,{" "}
              {clientProjects.filter((p) => p.status === "Build in Progress").length} In Build
            </p>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Projects Table (2/3) */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-gray-200 flex justify-between items-center">
            <h3 className="font-bold text-[#0A0A0A]">Spend by Project</h3>
            <Button variant="ghost" size="sm" className="text-xs text-gray-500">
              View All
            </Button>
          </div>
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-xs uppercase font-bold text-gray-500 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3">Project</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Spend / Commit</th>
                <th className="px-4 py-3 text-right">Util %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {clientProjects.slice(0, 5).map((p) => {
                const projUtil = p.estimatedVolume && p.unitPrice
                  ? ((p.estimatedVolume * p.unitPrice) / (p.estimatedVolume * p.unitPrice)) * 100
                  : 0;
                return (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-bold text-[#0A0A0A]">{p.name}</div>
                      <div className="text-[10px] text-gray-400">
                        {p.version} • Owner: {p.owner.name}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant="outline"
                        className={cn(
                          "font-medium border px-2 py-0.5 rounded-full text-[10px]",
                          p.status === "Live"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : p.status === "Build in Progress"
                            ? "bg-blue-50 text-blue-700 border-blue-200"
                            : "bg-gray-100 text-gray-600 border-gray-200"
                        )}
                      >
                        {p.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">
                      ${p.estimatedVolume && p.unitPrice ? (p.estimatedVolume * p.unitPrice).toLocaleString() : "0"} /{" "}
                      <span className="text-gray-400">
                        ${p.estimatedVolume && p.unitPrice ? (p.estimatedVolume * p.unitPrice).toLocaleString() : "0"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={cn(
                          "font-bold text-xs",
                          projUtil > 100 ? "text-red-500" : "text-emerald-600"
                        )}
                      >
                        {projUtil.toFixed(0)}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Health & Owner Card (1/3) */}
        <Card className="p-6 flex flex-col gap-6">
          <div>
            <h3 className="font-bold text-[#0A0A0A] mb-4">Account Health</h3>
            <div className="flex items-center gap-2 mb-2">
              <Badge
                className={cn(
                  "border-none px-3 py-1 text-sm gap-2",
                  client.health === "Good"
                    ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                    : client.health === "At Risk"
                    ? "bg-amber-100 text-amber-700 hover:bg-amber-100"
                    : "bg-red-100 text-red-700 hover:bg-red-100"
                )}
              >
                <CheckCircle2 size={14} /> {client.health}
              </Badge>
            </div>
            <p className="text-xs text-gray-500">
              Last check-in: {client.lastActivity}. Client is happy with the latest updates.
            </p>
          </div>

          <Separator />

          <div>
            <h3 className="font-bold text-[#0A0A0A] mb-4">Account Owner</h3>
            <div className="flex items-center gap-3">
              <Avatar className="w-10 h-10 border border-gray-200">
                <AvatarImage src={client.owner.avatar} />
                <AvatarFallback>SC</AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-bold text-[#0A0A0A]">{client.owner.name}</p>
                <p className="text-xs text-gray-500">Head of Ops</p>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button variant="outline" size="sm" className="flex-1 text-xs">
                <Mail size={14} className="mr-2" /> Email
              </Button>
              <Button variant="outline" size="sm" className="flex-1 text-xs">
                <MessageSquare size={14} className="mr-2" /> Chat
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// Projects Tab
function ProjectsTab({ clientProjects }: { clientProjects: AdminProject[] }) {
  return (
    <div className="p-6 h-full overflow-y-auto">
      <Card className="overflow-hidden border-gray-200 shadow-sm">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase font-bold text-gray-500">
            <tr>
              <th className="px-6 py-4">Project</th>
              <th className="px-6 py-4">Version</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Owner</th>
              <th className="px-6 py-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {clientProjects.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50 transition-colors group">
                <td className="px-6 py-4 font-bold text-[#0A0A0A]">{p.name}</td>
                <td className="px-6 py-4">
                  <Badge variant="outline" className="bg-gray-50 border-gray-200 font-mono text-xs text-gray-600">
                    {p.version}
                  </Badge>
                </td>
                <td className="px-6 py-4">
                  <Badge
                    className={cn(
                      "border font-medium px-2.5 py-0.5 rounded-full shadow-none",
                      p.status === "Live"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : p.status === "Build in Progress"
                        ? "bg-blue-50 text-blue-700 border-blue-200"
                        : "bg-gray-100 text-gray-600 border-gray-200"
                    )}
                  >
                    {p.status}
                  </Badge>
                </td>
                <td className="px-6 py-4 text-gray-600 text-xs">{p.owner.name}</td>
                <td className="px-6 py-4 text-right">
                  <Link href={`/admin/projects/${p.id}`}>
                    <Button variant="ghost" size="sm" className="text-xs text-gray-500 hover:text-[#0A0A0A]">
                      Open Project <ExternalLink size={12} className="ml-1" />
                    </Button>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// Quotes Tab
function QuotesTab() {
  return (
    <div className="p-6 h-full overflow-y-auto">
      <Card className="overflow-hidden border-gray-200 shadow-sm">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase font-bold text-gray-500">
            <tr>
              <th className="px-6 py-4 w-[100px]">ID</th>
              <th className="px-6 py-4">Automation</th>
              <th className="px-6 py-4">Version</th>
              <th className="px-6 py-4">Fees</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Date</th>
              <th className="px-6 py-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {mockClientQuotes.map((q) => (
              <tr key={q.id} className="hover:bg-gray-50 transition-colors group">
                <td className="px-6 py-4 font-mono text-xs font-bold text-gray-600">{q.id}</td>
                <td className="px-6 py-4 font-medium text-[#0A0A0A]">{q.project}</td>
                <td className="px-6 py-4 text-xs text-gray-500">{q.version}</td>
                <td className="px-6 py-4">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold">${q.fee.toLocaleString()}</span>
                    <span className="text-[10px] text-gray-400 font-mono">${q.price.toFixed(3)} / run</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <Badge
                    variant="outline"
                    className={cn(
                      "font-medium px-2 py-0.5 rounded-full shadow-none border",
                      q.status === "Signed"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : q.status === "Draft"
                        ? "bg-amber-50 text-amber-700 border-amber-200"
                        : "bg-gray-100 text-gray-600 border-gray-200"
                    )}
                  >
                    {q.status}
                  </Badge>
                </td>
                <td className="px-6 py-4 text-xs text-gray-500">{q.date}</td>
                <td className="px-6 py-4 text-right">
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400">
                    <MoreHorizontal size={16} />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// Contacts Tab
function ContactsTab() {
  return (
    <div className="p-6 h-full overflow-y-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {mockClientContacts.map((c, i) => (
          <Card key={i} className="p-4 flex items-start gap-4 border-gray-200 shadow-sm">
            <Avatar className="w-10 h-10 border border-gray-100">
              <AvatarFallback className="bg-gray-100 text-gray-600 font-bold">{c.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h4 className="font-bold text-[#0A0A0A]">{c.name}</h4>
              <p className="text-xs text-gray-500 mb-2">{c.role}</p>
              <div className="flex flex-col gap-1 text-xs text-gray-600">
                <div className="flex items-center gap-2">
                  <Mail size={12} className="text-gray-400" /> {c.email}
                </div>
                <div className="flex items-center gap-2">
                  <MessageSquare size={12} className="text-gray-400" /> Prefers: {c.channel}
                </div>
              </div>
            </div>
          </Card>
        ))}
        <button className="border-2 border-dashed border-gray-200 rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-gray-300 hover:text-gray-600 transition-colors h-full min-h-[140px]">
          <Plus size={24} />
          <span className="text-xs font-bold">Add Contact</span>
        </button>
      </div>
    </div>
  );
}

export default function ClientDetailPage({ params }: ClientDetailPageProps) {
  const client = mockClients.find((c) => c.id === params.clientId);
  const [activeTab, setActiveTab] = useState("overview");

  if (!client) {
    notFound();
  }

  const clientProjects = mockAdminProjects.filter((p) => p.clientId === params.clientId);
  const spendSummary = getClientSpendSummary(client);

  return (
    <div className="flex flex-col h-full bg-gray-50 text-[#1A1A1A] font-sans">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-8 py-6 shrink-0 z-10">
        <div className="flex flex-col gap-6">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Link href="/admin/clients" className="hover:text-[#0A0A0A] flex items-center gap-1 transition-colors">
              <ArrowLeft size={12} /> Clients
            </Link>
            <span>/</span>
            <span className="font-bold text-[#0A0A0A]">{client.name}</span>
          </div>

          <div className="flex justify-between items-start">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center border border-gray-200 text-gray-500 font-bold text-xl">
                {client.name.charAt(0)}
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold text-[#0A0A0A]">{client.name}</h1>
                  <Badge
                    className={cn(
                      "border-none gap-1.5",
                      client.health === "Good"
                        ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                        : client.health === "At Risk"
                        ? "bg-amber-100 text-amber-700 hover:bg-amber-100"
                        : "bg-red-100 text-red-700 hover:bg-red-100"
                    )}
                  >
                    <CheckCircle2 size={12} /> {client.health}
                  </Badge>
                </div>
                <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                  <Building2 size={12} /> {client.industry} • Managed by{" "}
                  <span className="font-bold text-gray-700">{client.owner.name}</span>
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="border-gray-200">
                Edit Client
              </Button>
              <Button 
                className="bg-[#0A0A0A] text-white"
                onClick={() => {
                  // TODO: Open new project modal with client pre-selected
                  alert(`New Project creation flow for ${client.name} will be implemented here`);
                }}
              >
                New Project
              </Button>
            </div>
          </div>

          {/* Key Metrics Row */}
          <div className="flex gap-8 pt-2">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase mb-0.5">Active Monthly Spend</p>
              <p className="text-lg font-mono font-bold text-[#0A0A0A]">
                ${spendSummary.currentMonthSpend.toLocaleString()}
              </p>
            </div>
            <div className="w-px h-10 bg-gray-100" />
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase mb-0.5">Committed Spend</p>
              <p className="text-lg font-mono font-bold text-gray-500">
                ${spendSummary.committedMonthlySpend.toLocaleString()}
              </p>
            </div>
            <div className="w-px h-10 bg-gray-100" />
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase mb-0.5">Utilization</p>
              <p className="text-lg font-mono font-bold text-emerald-600">
                {spendSummary.utilizationPercent.toFixed(0)}%
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* TABS */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <div className="px-8 border-b border-gray-200 bg-white shrink-0">
          <TabsList className="h-12 bg-transparent p-0 gap-8">
            {["Overview", "Projects", "Billing & Quotes", "Contacts", "Chat"].map((tab) => {
              const value = tab.toLowerCase().replace(/ & /g, "-").replace(/ /g, "-");
              return (
                <TabsTrigger
                  key={value}
                  value={value}
                  className={cn(
                    "h-full rounded-none border-b-2 bg-transparent px-0 text-sm font-medium text-gray-500 shadow-none transition-none data-[state=active]:border-[#E43632] data-[state=active]:text-[#E43632] data-[state=active]:shadow-none hover:text-gray-900"
                  )}
                >
                  {tab}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        <div className="flex-1 bg-gray-50 overflow-hidden">
          <TabsContent value="overview" className="h-full m-0 data-[state=inactive]:hidden">
            <OverviewTab client={client} clientProjects={clientProjects} spendSummary={spendSummary} />
          </TabsContent>
          <TabsContent value="projects" className="h-full m-0 data-[state=inactive]:hidden">
            <ProjectsTab clientProjects={clientProjects} />
          </TabsContent>
          <TabsContent value="billing-quotes" className="h-full m-0 data-[state=inactive]:hidden">
            <QuotesTab />
          </TabsContent>
          <TabsContent value="contacts" className="h-full m-0 data-[state=inactive]:hidden">
            <ContactsTab />
          </TabsContent>
          <TabsContent value="chat" className="h-full m-0 data-[state=inactive]:hidden">
            <ConversationThread messages={mockClientChat} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
