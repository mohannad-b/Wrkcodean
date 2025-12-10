import { Blueprint } from '../../types/blueprint';

export const employeeOnboarding: Blueprint = {
  id: 'employee-onboarding',
  title: 'New Employee Onboarding',
  shortDescription: 'Provision G-Suite accounts, send welcome email, invite to Slack channels, and schedule orientation.',
  category: 'HR',
  tags: ['HR', 'IT'],
  connectedApps: ['Users', 'Mail', 'Database'],
  color: 'purple',
  featured: false
};
