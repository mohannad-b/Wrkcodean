"use client";

import { useState, useMemo } from "react";
import { AutomationGrid } from "@/components/ui/AutomationGrid";
import { AutomationList } from "@/components/ui/AutomationList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Zap, Search, Filter, LayoutGrid, List as ListIcon } from "lucide-react";
import { mockAutomations } from "@/lib/mock-automations";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { AutomationStatus } from "@/lib/types";

export default function AutomationsPage() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [filter, setFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Filter Logic
  const filteredAutomations = useMemo(() => {
    return mockAutomations.filter((auto) => {
      if (filter !== "all" && auto.status !== filter) return false;
      if (searchQuery && !auto.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [filter, searchQuery]);

  const filterChips: Array<"all" | AutomationStatus> = [
    "all",
    "Live",
    "Build in Progress",
    "Needs Pricing",
    "Intake in Progress",
    "Blocked",
  ];

  return (
    <div className="flex-1 h-full overflow-y-auto bg-gray-50/50">
      <div className="max-w-[1600px] mx-auto p-6 md:p-10 space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-[#0A0A0A] tracking-tight mb-1">
              Automations
            </h1>
            <p className="text-gray-500 text-sm font-medium">
              Manage your organization&apos;s workflows and bots.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/automations/new">
              <Button className="bg-[#E43632] hover:bg-[#C12E2A] text-white shadow-lg shadow-red-500/20 font-semibold">
                <Plus className="mr-2 h-4 w-4" />
                New Automation
              </Button>
            </Link>
          </div>
        </div>

        {/* Controls & Filters */}
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
            {/* Search & Primary Filter */}
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="relative flex-1 md:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search automations..."
                  className="pl-9 bg-white border-gray-200 focus-visible:ring-[#E43632]"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Button
                variant="outline"
                size="icon"
                className="shrink-0 bg-white border-gray-200"
                aria-label="Filter automations"
              >
                <Filter size={16} className="text-gray-500" />
              </Button>
            </div>

            {/* View Toggle */}
            <div className="bg-white border border-gray-200 rounded-lg p-1 flex items-center gap-1">
              <button
                onClick={() => setViewMode("grid")}
                aria-label="Grid view"
                aria-pressed={viewMode === "grid"}
                className={cn(
                  "p-1.5 rounded-md transition-all",
                  viewMode === "grid"
                    ? "bg-gray-100 text-[#0A0A0A] shadow-sm"
                    : "text-gray-400 hover:text-gray-600"
                )}
              >
                <LayoutGrid size={16} />
              </button>
              <button
                onClick={() => setViewMode("list")}
                aria-label="List view"
                aria-pressed={viewMode === "list"}
                className={cn(
                  "p-1.5 rounded-md transition-all",
                  viewMode === "list"
                    ? "bg-gray-100 text-[#0A0A0A] shadow-sm"
                    : "text-gray-400 hover:text-gray-600"
                )}
              >
                <ListIcon size={16} />
              </button>
            </div>
          </div>

          {/* Chip Filters */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {filterChips.map((chip) => (
              <button
                key={chip}
                onClick={() => setFilter(chip)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium border transition-all whitespace-nowrap",
                  filter === chip
                    ? "bg-[#0A0A0A] text-white border-[#0A0A0A]"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                )}
              >
                {chip === "all" ? "All Automations" : chip}
              </button>
            ))}
          </div>
        </div>

        {/* Content Area */}
        {filteredAutomations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-xl border border-dashed border-gray-200">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
              <Zap size={24} className="text-gray-300" />
            </div>
            <h3 className="text-lg font-bold text-[#0A0A0A] mb-1">No automations found</h3>
            <p className="text-sm text-gray-500 max-w-xs mb-6">
              {searchQuery
                ? "Try adjusting your search or filters."
                : "Get started by creating your first automation or importing a process."}
            </p>
            <Link href="/automations/new">
              <Button className="bg-[#E43632] hover:bg-[#C12E2A] text-white">
                Create Automation
              </Button>
            </Link>
          </div>
        ) : viewMode === "grid" ? (
          <AutomationGrid automations={filteredAutomations} />
        ) : (
          <AutomationList automations={filteredAutomations} />
        )}
      </div>
    </div>
  );
}
