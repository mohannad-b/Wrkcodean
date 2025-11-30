export interface Task {
  id: number;
  type: "approval" | "review" | "missing_info";
  title: string;
  due: string;
  priority: "high" | "medium" | "critical";
}

export interface ActivityItem {
  id: number;
  user: string;
  avatar: string;
  action: string;
  target: string;
  time: string;
}

export interface DashboardAutomation {
  id: string;
  name: string;
  version: string;
  status: string;
  runs: number;
  success: number;
  spend: number;
  trend?: string;
  needsApproval: boolean;
  progress?: number;
}

export const mockTasks: Task[] = [
  {
    id: 1,
    type: "approval",
    title: "Approve Invoice Processing v2.1",
    due: "Today",
    priority: "high",
  },
  {
    id: 2,
    type: "review",
    title: "Review Employee Onboarding Logic",
    due: "Tomorrow",
    priority: "medium",
  },
  {
    id: 3,
    type: "missing_info",
    title: "Missing credentials for Salesforce",
    due: "Overdue",
    priority: "critical",
  },
];

export const mockActivityFeed: ActivityItem[] = [
  {
    id: 1,
    user: "Sarah Chen",
    avatar: "https://github.com/shadcn.png",
    action: "deployed",
    target: "Invoice Processing v2.4",
    time: "10m ago",
  },
  {
    id: 2,
    user: "Mike Ross",
    avatar: "",
    action: "requested_changes",
    target: "Sales Lead Routing",
    time: "1h ago",
  },
  {
    id: 3,
    user: "System",
    avatar: "",
    action: "alert",
    target: "High error rate detected in Doc Review",
    time: "2h ago",
  },
  {
    id: 4,
    user: "Jessica Pearson",
    avatar: "",
    action: "commented",
    target: "Quote #1023",
    time: "4h ago",
  },
];

export const mockDashboardAutomations: DashboardAutomation[] = [
  {
    id: "1",
    name: "Invoice Processing",
    version: "v2.4",
    status: "Live",
    runs: 1240,
    success: 98.5,
    spend: 450,
    trend: "+12%",
    needsApproval: false,
  },
  {
    id: "2",
    name: "Employee Onboarding",
    version: "v1.1",
    status: "Build in Progress",
    progress: 65,
    runs: 0,
    success: 0,
    spend: 0,
    trend: "New",
    needsApproval: false,
  },
  {
    id: "3",
    name: "Sales Lead Routing",
    version: "v3.0",
    status: "Awaiting Client Approval",
    runs: 850,
    success: 99.1,
    spend: 210,
    trend: "-5%",
    needsApproval: true,
  },
  {
    id: "4",
    name: "Legal Document Review",
    version: "v1.0",
    status: "Blocked",
    runs: 45,
    success: 82.0,
    spend: 85,
    trend: "+2%",
    needsApproval: false,
  },
];

export const mockUsageData = Array.from({ length: 30 }, (_, i) => ({
  day: i + 1,
  units: Math.floor(Math.random() * 500) + 100,
}));
