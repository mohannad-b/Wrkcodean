"use client";

import { useState } from "react";
import { Play, CheckCircle2, XCircle, Clock, AlertTriangle, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function TestTab() {
  const [testResults] = useState([
    {
      id: 1,
      name: "Invoice Amount < $8k",
      status: "passed",
      duration: "120ms",
      timestamp: "2m ago",
    },
    {
      id: 2,
      name: "Invoice Amount > $8k",
      status: "passed",
      duration: "135ms",
      timestamp: "2m ago",
    },
    {
      id: 3,
      name: "Missing Vendor Info",
      status: "failed",
      duration: "250ms",
      timestamp: "5m ago",
      error: "Exception handler not triggered",
    },
    { id: 4, name: "OCR Extraction", status: "passed", duration: "890ms", timestamp: "10m ago" },
  ]);

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="p-8 max-w-6xl mx-auto pb-32 space-y-8">
        {/* HEADER */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-[#0A0A0A] mb-2">Test Results</h2>
            <p className="text-sm text-gray-500">
              Run automated tests to validate your automation logic
            </p>
          </div>
          <Button className="bg-[#E43632] hover:bg-[#C12E2A] text-white">
            <Play size={16} className="mr-2" />
            Run All Tests
          </Button>
        </div>

        {/* TEST STATS */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-6 border-gray-200">
            <div className="text-sm text-gray-500 mb-1">Total Tests</div>
            <div className="text-3xl font-bold text-[#0A0A0A]">{testResults.length}</div>
          </Card>
          <Card className="p-6 border-gray-200">
            <div className="text-sm text-gray-500 mb-1 flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-500" />
              Passed
            </div>
            <div className="text-3xl font-bold text-emerald-600">
              {testResults.filter((t) => t.status === "passed").length}
            </div>
          </Card>
          <Card className="p-6 border-gray-200">
            <div className="text-sm text-gray-500 mb-1 flex items-center gap-2">
              <XCircle size={16} className="text-red-500" />
              Failed
            </div>
            <div className="text-3xl font-bold text-red-600">
              {testResults.filter((t) => t.status === "failed").length}
            </div>
          </Card>
          <Card className="p-6 border-gray-200">
            <div className="text-sm text-gray-500 mb-1 flex items-center gap-2">
              <Clock size={16} className="text-gray-400" />
              Avg Duration
            </div>
            <div className="text-3xl font-bold text-[#0A0A0A]">348ms</div>
          </Card>
        </div>

        {/* TEST RESULTS LIST */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-[#0A0A0A]">Recent Test Runs</h3>
          {testResults.map((test) => (
            <Card
              key={test.id}
              className={cn(
                "p-6 border-gray-200 transition-all",
                test.status === "failed" && "border-red-200 bg-red-50/30"
              )}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    {test.status === "passed" ? (
                      <CheckCircle2 size={20} className="text-emerald-500" />
                    ) : (
                      <XCircle size={20} className="text-red-500" />
                    )}
                    <h4 className="font-bold text-[#0A0A0A]">{test.name}</h4>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs",
                        test.status === "passed"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-red-50 text-red-700 border-red-200"
                      )}
                    >
                      {test.status}
                    </Badge>
                  </div>
                  {test.error && (
                    <div className="ml-8 mt-2 p-3 bg-red-100 border border-red-200 rounded-lg">
                      <div className="flex items-start gap-2">
                        <AlertTriangle size={16} className="text-red-600 shrink-0 mt-0.5" />
                        <p className="text-sm text-red-800">{test.error}</p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-500 mb-1">{test.duration}</div>
                  <div className="text-xs text-gray-400">{test.timestamp}</div>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* QUICK ACTIONS */}
        <Card className="p-6 border-gray-200 bg-gradient-to-br from-blue-50 to-purple-50">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-[#0A0A0A] mb-1">Need to test a specific scenario?</h3>
              <p className="text-sm text-gray-600">Create a custom test case with your own data</p>
            </div>
            <Button variant="outline" className="border-gray-300">
              <Zap size={16} className="mr-2" />
              Create Test Case
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
