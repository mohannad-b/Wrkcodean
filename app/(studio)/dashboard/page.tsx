"use client";

import { useState } from "react";
import { StatCard } from "@/components/ui/StatCard";
import { DashboardAutomationCard } from "@/components/ui/DashboardAutomationCard";
import { ActivityFeedItem } from "@/components/ui/ActivityFeedItem";
import { UsageChart } from "@/components/charts/UsageChart";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Zap,
  Filter,
  Search,
  Briefcase,
  ChevronDown,
  AlertTriangle,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { mockAutomations } from "@/lib/mock-automations";
import { mockActivityFeed, mockDashboardAutomations, mockUsageData } from "@/lib/mock-dashboard";
import { currentUser } from "@/lib/mock-automations";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const router = useRouter();
  const [showAlert, setShowAlert] = useState(true);
  const totalAutomations = mockAutomations.length;
  const liveAutomations = mockAutomations.filter((a) => a.status === "Live").length;
  const buildingAutomations = mockAutomations.filter(
    (a) => a.status === "Build in Progress"
  ).length;

  return (
    <div className="flex-1 h-full overflow-y-auto bg-gray-50/50">
      <div className="max-w-[1600px] mx-auto p-6 md:p-8 lg:p-12 space-y-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 text-gray-500 mb-1">
              <Briefcase size={16} />
              <span className="text-sm font-medium">Acme Corp</span>
              <ChevronDown
                size={14}
                className="cursor-pointer hover:text-black transition-colors"
              />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-[#0A0A0A] tracking-tight">
              Good afternoon, {currentUser.name.split(" ")[0]}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/automations/new">
              <Button className="bg-[#E43632] hover:bg-[#C12E2A] text-white shadow-lg shadow-red-500/20 font-bold">
                <Plus className="mr-2 h-4 w-4" />
                New Automation
              </Button>
            </Link>
          </div>
        </header>

        {/* Alert Bar */}
        <AnimatePresence>
          {showAlert && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
            >
              <div className="flex items-start gap-3">
                <div className="p-2 bg-amber-100 rounded-lg text-amber-600 shrink-0">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-amber-900 text-sm">
                    Action Required: Payment Method Expiring
                  </h3>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Your primary card ending in 4242 expires in 3 days. Update now to avoid service
                    interruption.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <Link href="/workspace-settings">
                  <Button
                    size="sm"
                    className="bg-amber-600 hover:bg-amber-700 text-white border-none w-full sm:w-auto"
                  >
                    Update Payment
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowAlert(false)}
                  className="text-amber-700 hover:bg-amber-100 hidden sm:flex"
                >
                  <X size={16} />
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* LEFT COLUMN (2/3 width on large screens) */}
          <div className="lg:col-span-2 space-y-8">
            {/* Active Automations Grid */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2
                  className="text-lg font-bold text-[#0A0A0A] cursor-pointer hover:text-[#E43632] transition-colors"
                  onClick={() => router.push("/automations")}
                >
                  Active Automations
                </h2>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" className="text-gray-500">
                    <Filter size={16} />
                  </Button>
                  <Button variant="ghost" size="sm" className="text-gray-500">
                    <Search size={16} />
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {mockDashboardAutomations.map((auto) => (
                  <DashboardAutomationCard key={auto.id} automation={auto} />
                ))}

                {/* Create New Card */}
                <Link href="/automations/new">
                  <button className="group border-2 border-dashed border-gray-200 rounded-xl p-6 flex flex-col items-center justify-center text-center hover:border-[#E43632]/40 hover:bg-[#E43632]/5 transition-all min-h-[200px] w-full">
                    <div className="w-12 h-12 rounded-full bg-gray-50 group-hover:bg-white flex items-center justify-center mb-4 group-hover:shadow-md transition-all">
                      <Plus className="text-gray-400 group-hover:text-[#E43632]" />
                    </div>
                    <h3 className="font-bold text-gray-900 mb-1">Create New Automation</h3>
                  </button>
                </Link>
              </div>
            </section>

            {/* Usage & Spend Overview */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-[#0A0A0A]">Usage & Spend</h2>
                <Select defaultValue="30d">
                  <SelectTrigger className="h-8 w-[120px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7d">Last 7 Days</SelectItem>
                    <SelectItem value="30d">Last 30 Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                <div className="h-[250px] w-full mb-6">
                  <UsageChart data={mockUsageData} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 border-t border-gray-50 pt-6">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Total Spend (Oct)</p>
                    <p className="text-2xl font-bold text-[#0A0A0A]">$3,450</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Cost per Unit</p>
                    <p className="text-2xl font-bold text-[#0A0A0A]">$0.024</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Highest Volume</p>
                    <p className="text-sm font-bold text-[#0A0A0A] truncate">Invoice Processing</p>
                    <p className="text-[10px] text-gray-400">14.2k units</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Forecast (Nov)</p>
                    <p className="text-2xl font-bold text-gray-400">~$3,800</p>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* RIGHT COLUMN (1/3 width on large screens) */}
          <div className="space-y-8">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 gap-6">
              <StatCard
                label="Total Automations"
                value={totalAutomations}
                icon={<Zap size={18} />}
              />
              <StatCard label="Live" value={liveAutomations} />
              <StatCard label="Building" value={buildingAutomations} />
            </div>

            {/* Build Activity Feed */}
            <section>
              <h2 className="text-lg font-bold text-[#0A0A0A] mb-4">Build Activity</h2>
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="divide-y divide-gray-100">
                  {mockActivityFeed.map((item) => (
                    <ActivityFeedItem key={item.id} item={item} />
                  ))}
                  <div className="p-2 text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-gray-400 hover:text-[#0A0A0A] w-full"
                      onClick={() => router.push("/automations")}
                    >
                      View All Activity
                    </Button>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
