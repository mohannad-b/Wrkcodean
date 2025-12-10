import { Blueprint } from '../types/blueprint';

export const blueprints: Blueprint[] = [
  {
    id: 'deal-provisioning',
    title: 'Multi-Stage Deal Provisioning',
    shortDescription: 'Automatically provision resources when a high-value deal closes. Connects CRM, Project Management, and Communication tools.',
    longDescription: 'A deep dive into our most popular enterprise workflow: Multi-Stage Deal Provisioning. Connects CRM, Project Management, and Communication tools seamlessly.',
    category: 'Sales',
    tags: ['Sales', 'Provisioning', 'Enterprise'],
    connectedApps: ['Salesforce', 'Wrk AI', 'Slack', 'Jira'],
    color: 'blue',
    featured: true,
    steps: [
      {
        stepNumber: 1,
        title: 'Monitor Salesforce Opportunities',
        description: 'The workflow listens for the "Closed Won" event. When triggered, it captures the full deal payload.',
        type: 'trigger',
        app: 'Salesforce',
        iconName: 'Users',
        configPreview: {
          label: 'Data Captured',
          items: [
            { key: 'Deal_ID', value: 'ID-2930' },
            { key: 'Amount', value: '$120,000' },
            { key: 'Owner_Email', value: 'alice@corp.com' }
          ]
        }
      },
      {
        stepNumber: 2,
        title: 'Evaluate Deal Tier',
        description: 'Wrk Copilot analyzes the Amount to determine the service tier. This replaces manual triage by RevOps.',
        type: 'logic',
        app: 'Wrk Core',
        iconName: 'Zap',
        configPreview: {
          label: 'Logic Rule',
          items: [
             { key: 'Condition', value: 'Amount > $50k' },
             { key: 'Result', value: 'Enterprise' }
          ]
        }
      },
      {
        stepNumber: 3,
        title: 'Provision Resources',
        description: 'For Enterprise deals, the system executes parallel actions across your stack.',
        type: 'action',
        app: 'Multi',
        iconName: 'Split',
        configPreview: {
          label: 'Actions',
          items: [
            { key: 'Slack', value: 'Create Channel' },
            { key: 'Jira', value: 'Init Project' },
            { key: 'Email', value: 'Send Summary' }
          ]
        }
      }
    ]
  },
  {
    id: 'invoice-approval',
    title: 'Invoice Approval Chain',
    shortDescription: 'Extract data from PDF invoices, validate amounts, and route for approval based on dollar thresholds.',
    category: 'Finance',
    tags: ['Finance', 'OCR'],
    connectedApps: ['FileText', 'Mail', 'Slack'], // Using lucide icon names as proxies for now if needed, or real app names
    color: 'blue',
    featured: false
  },
  {
    id: 'employee-onboarding',
    title: 'New Employee Onboarding',
    shortDescription: 'Provision G-Suite accounts, send welcome email, invite to Slack channels, and schedule orientation.',
    category: 'HR',
    tags: ['HR', 'IT'],
    connectedApps: ['Users', 'Mail', 'Database'],
    color: 'purple',
    featured: false
  },
  {
    id: 'lead-enrichment',
    title: 'Lead Enrichment & Routing',
    shortDescription: 'Enrich new Salesforce leads with Clearbit data and route to the correct AE based on territory.',
    category: 'Sales',
    tags: ['Sales', 'Data'],
    connectedApps: ['Zap', 'Users', 'Slack'],
    color: 'amber',
    featured: false
  },
  {
    id: 'support-triage',
    title: 'Support Ticket Auto-Triage',
    shortDescription: 'Analyze incoming Zendesk tickets with AI to determine sentiment and urgency, then prioritize.',
    category: 'Support',
    tags: ['Support', 'AI'],
    connectedApps: ['Bot', 'Mail', 'CheckCircle2'],
    color: 'emerald',
    featured: false
  },
  {
    id: 'contract-review',
    title: 'Contract Review Assistant',
    shortDescription: 'Draft legal review summaries for NDAs uploaded to Drive and post them to the Legal channel.',
    category: 'Legal',
    tags: ['Legal', 'AI'],
    connectedApps: ['FileText', 'Zap', 'Slack'],
    color: 'slate',
    featured: false
  },
  {
    id: 'monthly-reporting',
    title: 'Monthly Reporting Loop',
    shortDescription: 'Aggregate data from 3 sources, generate a PDF report, and email it to stakeholders on the 1st of the month.',
    category: 'Reporting',
    tags: ['Reporting', 'Data'],
    connectedApps: ['Database', 'FileText', 'Mail'],
    color: 'indigo',
    featured: false
  }
];
