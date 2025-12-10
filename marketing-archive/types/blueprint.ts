export type BlueprintCategory = 'Finance' | 'HR' | 'Sales' | 'Marketing' | 'IT Support' | 'Legal' | 'Reporting' | 'Support' | 'Other';

export type BlueprintColor = 'blue' | 'purple' | 'amber' | 'emerald' | 'slate' | 'indigo';

export interface BlueprintStep {
  stepNumber: number;
  title: string;
  description: string;
  type: 'trigger' | 'action' | 'logic';
  app?: string;
  iconName: string; // e.g. "Slack", "Mail", "Users"
  configPreview?: {
    label: string;
    items: { key: string; value: string }[];
  };
}

export interface Blueprint {
  id: string;
  title: string;
  shortDescription: string;
  longDescription?: string;
  category: BlueprintCategory;
  tags: string[];
  connectedApps: string[]; // Names of apps, e.g., "Slack", "Salesforce"
  color: BlueprintColor;
  featured: boolean;
  
  // For the deep dive / visualizer
  workflow?: {
    trigger: {
      app: string;
      event: string;
      iconName: string;
    };
    nodes: {
      id: string;
      type: 'action' | 'logic' | 'branch';
      title: string;
      description: string;
      iconName: string;
      app?: string;
      children?: any[]; // Simplified for now
    }[];
  };

  // For the text breakdown
  steps?: BlueprintStep[];
}
