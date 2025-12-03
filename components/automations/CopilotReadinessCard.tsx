"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { CopilotAnalysisState, CopilotTodoItem } from "@/lib/blueprint/copilot-analysis";
import { cn } from "@/lib/utils";

type Props = {
  analysis: CopilotAnalysisState | null;
  loading?: boolean;
};

const MAX_TODOS = 6;

export function CopilotReadinessCard({ analysis, loading = false }: Props) {
  const readinessScore = analysis?.readiness?.score ?? 0;
  const sections = analysis?.sections ? Object.values(analysis.sections) : [];
  const confidentSections = sections.filter((section) => section.textSummary && section.confidence !== "low").length;
  const openTodos = (analysis?.todos ?? []).filter((todo) => todo.status === "open").slice(0, MAX_TODOS);

  return (
    <Card className="bg-white border-gray-200 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase font-semibold text-gray-500 tracking-wide">Copilot Readiness</p>
            <p className="text-2xl font-bold text-gray-900">{loading ? "…" : `${readinessScore}/100`}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium text-gray-500">Sections covered</p>
            <p className="text-sm font-semibold text-gray-900">{loading ? "…" : `${confidentSections}/8`}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Open todos</p>
          {loading ? (
            <p className="text-sm text-gray-400">Loading analysis…</p>
          ) : openTodos.length === 0 ? (
            <p className="text-sm text-gray-500">No open todos. Keep refining with Copilot.</p>
          ) : (
            <ul className="space-y-2 max-h-48 overflow-y-auto pr-2">
              {openTodos.map((todo) => (
                <li key={todo.id} className="flex items-start gap-2">
                  <Badge variant="outline" className={cn("text-[10px] uppercase tracking-wide", categoryColor(todo))}>
                    {formatCategory(todo.category)}
                  </Badge>
                  <span className="text-sm text-gray-700">{todo.description}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function formatCategory(category: CopilotTodoItem["category"]) {
  return category.replace(/_/g, " ");
}

function categoryColor(todo: CopilotTodoItem) {
  switch (todo.category) {
    case "systems_access":
      return "border-blue-200 text-blue-700";
    case "exceptions_mapping":
    case "human_touchpoints":
      return "border-amber-200 text-amber-700";
    case "data_mapping":
      return "border-purple-200 text-purple-700";
    default:
      return "border-gray-200 text-gray-600";
  }
}


