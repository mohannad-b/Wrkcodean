"use client";

import dynamic from "next/dynamic";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface UsageChartProps {
  data: Array<{ day: number; units: number }>;
}

// Export as dynamic component to reduce initial bundle size
// Recharts is heavy (~150KB), so we lazy load it
export const UsageChart = dynamic(
  () =>
    Promise.resolve(function UsageChartComponent({ data }: UsageChartProps) {
      return (
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorUnits" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#E43632" stopOpacity={0.1} />
                <stop offset="95%" stopColor="#E43632" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
            <XAxis
              dataKey="day"
              axisLine={false}
              tickLine={false}
              fontSize={12}
              tick={{ fill: "#9ca3af" }}
            />
            <YAxis axisLine={false} tickLine={false} fontSize={12} tick={{ fill: "#9ca3af" }} />
            <Tooltip
              contentStyle={{
                borderRadius: "8px",
                border: "none",
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
              }}
              cursor={{ stroke: "#E43632", strokeWidth: 1, strokeDasharray: "4 4" }}
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
    }),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-sm text-gray-400">Loading chart...</div>
      </div>
    ),
  }
);
