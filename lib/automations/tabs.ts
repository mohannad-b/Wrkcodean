export const AUTOMATION_TABS = ["Overview", "Build Status", "Workflow", "Activity", "Chat", "Settings"] as const;

export type AutomationTab = (typeof AUTOMATION_TABS)[number];

