import { dealProvisioning } from './sales-deal-provisioning';
import { invoiceApproval } from './finance-invoice-approval';
import { employeeOnboarding } from './hr-employee-onboarding';
import { leadEnrichment } from './sales-lead-enrichment';

export const allBlueprints = [
  dealProvisioning,
  invoiceApproval,
  employeeOnboarding,
  leadEnrichment
];

export * from './sales-deal-provisioning';
export * from './finance-invoice-approval';
export * from './hr-employee-onboarding';
export * from './sales-lead-enrichment';