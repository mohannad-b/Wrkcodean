import { Blueprint } from '../../types/blueprint';

export const dealProvisioning: Blueprint = {
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
};
