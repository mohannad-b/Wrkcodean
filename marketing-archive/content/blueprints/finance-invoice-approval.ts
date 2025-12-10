import { Blueprint } from '../../types/blueprint';

export const invoiceApproval: Blueprint = {
  id: 'invoice-approval',
  title: 'Invoice Approval Chain',
  shortDescription: 'Extract data from PDF invoices, validate amounts, and route for approval based on dollar thresholds.',
  category: 'Finance',
  tags: ['Finance', 'OCR'],
  connectedApps: ['FileText', 'Mail', 'Slack'],
  color: 'blue',
  featured: false
};
