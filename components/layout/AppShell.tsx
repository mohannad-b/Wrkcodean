import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="h-screen bg-[#F5F5F5] font-sans text-[#1A1A1A] flex overflow-hidden">
      <Sidebar />
      <main className="md:pl-64 flex-1 flex flex-col overflow-hidden">{children}</main>
    </div>
  );
}
