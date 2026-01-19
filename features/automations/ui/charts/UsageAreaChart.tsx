"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type UsagePoint = {
  day: string;
  units: number;
};

interface UsageAreaChartProps {
  data: UsagePoint[];
}

export function UsageAreaChart({ data }: UsageAreaChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <defs>
          <linearGradient id="colorUnits" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#E43632" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#E43632" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
        <XAxis dataKey="day" tick={{ fontSize: 12, fill: "#6b7280" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 12, fill: "#6b7280" }} axisLine={false} tickLine={false} />
        <Tooltip
          cursor={{ stroke: "#E43632", strokeWidth: 1 }}
          contentStyle={{
            backgroundColor: "#fff",
            borderRadius: "8px",
            boxShadow: "0 10px 15px rgba(0,0,0,0.1)",
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
  );
}
