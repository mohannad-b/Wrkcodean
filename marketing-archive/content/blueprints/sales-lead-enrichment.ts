import { Blueprint } from '../../types/blueprint';

export const leadEnrichment: Blueprint = {
  id: 'lead-enrichment',
  title: 'Lead Enrichment & Routing',
  shortDescription: 'Enrich new Salesforce leads with Clearbit data and route to the correct AE based on territory.',
  category: 'Sales',
  tags: ['Sales', 'Data'],
  connectedApps: ['Zap', 'Users', 'Slack'],
  color: 'amber',
  featured: false
};
