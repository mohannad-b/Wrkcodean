export const AUTOMATION_TABS = ["Overview", "Build Status", "Tasks", "Workflow", "Activity", "Settings"] as const;

export type AutomationTab = (typeof AUTOMATION_TABS)[number];

