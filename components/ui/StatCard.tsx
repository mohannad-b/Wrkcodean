import { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  trend?: ReactNode;
}

export function StatCard({ label, value, icon, trend }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-500 uppercase font-semibold tracking-wider">{label}</p>
        {icon && <div className="text-gray-400">{icon}</div>}
      </div>
      <p className="text-2xl font-bold text-[#0A0A0A]">{value}</p>
      {trend && <div className="mt-2">{trend}</div>}
    </div>
  );
}



