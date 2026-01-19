"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type UsagePoint = {
  month: string;
  units: number;
};

interface WorkspaceUsageChartProps {
  data: UsagePoint[];
}

export function WorkspaceUsageChart({ data }: WorkspaceUsageChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 12, fill: "#6b7280" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis tick={{ fontSize: 12, fill: "#6b7280" }} axisLine={false} tickLine={false} />
        <Tooltip
          cursor={{ fill: "#f5f5f5" }}
          contentStyle={{
            backgroundColor: "#fff",
            borderRadius: "8px",
            boxShadow: "0 10px 15px rgba(0,0,0,0.1)",
          }}
          labelStyle={{ color: "#6b7280", fontSize: "12px" }}
        />
        <Bar dataKey="units" fill="#E43632" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
