import { CheckCircle, AlertCircle, Clock, MoreHorizontal, FileText, ClipboardCheck, Zap } from 'lucide-react';

export interface Collaborator {
  id: string;
  name: string;
  avatar: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  lastUpdated: string;
  health: 'healthy' | 'warning' | 'error';
  status: 'live' | 'preview' | 'draft';
  collaborators: Collaborator[];
  tags: string[];
}

export interface Notification {
  id: string;
  title: string;
  message?: string;
  time: string;
  type: 'review' | 'update' | 'publish' | 'comment';
  isUnread: boolean;
  actor?: Collaborator;
}

export const currentUser = {
  name: "Alex Morgan",
  email: "alex@wrk.com",
  avatar: "https://images.unsplash.com/photo-1672685667592-0392f458f46f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwcm9mZXNzaW9uYWwlMjBoZWFkc2hvdCUyMHBvcnRyYWl0fGVufDF8fHx8MTc2NDI5MDY1M3ww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral"
};

const collaborators = [
  { id: '1', name: 'Sarah', avatar: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxidXNpbmVzcyUyMHdvbWFuJTIwcG9ydHJhaXR8ZW58MXx8fHwxNzY0MzEzNTUwfDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral' },
  { id: '2', name: 'Mike', avatar: 'https://images.unsplash.com/photo-1752860872185-78926b52ef77?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjcmVhdGl2ZSUyMHByb2Zlc3Npb25hbCUyMHBvcnRyYWl0fGVufDF8fHx8MTc2NDI3NDQ4MXww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral' },
  { id: '3', name: 'Jessica', avatar: 'https://images.unsplash.com/photo-1752859951149-7d3fc700a7ec?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx0ZWNoJTIwb2ZmaWNlJTIwd29ya2VyJTIwcG9ydHJhaXR8ZW58MXx8fHwxNzY0MzU5NTAwfDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral' }
];

export const projects: Project[] = [
  {
    id: '1',
    name: 'Lead Gen Pipeline v2',
    description: 'Automated email sequences and lead scoring integration with HubSpot.',
    lastUpdated: '2m ago',
    health: 'healthy',
    status: 'live',
    collaborators: [collaborators[0], collaborators[1]],
    tags: ['Marketing', 'HubSpot']
  },
  {
    id: '2',
    name: 'Invoice Processing',
    description: 'OCR extraction from PDF invoices and sync with Xero.',
    lastUpdated: '45m ago',
    health: 'warning',
    status: 'draft',
    collaborators: [collaborators[2]],
    tags: ['Finance', 'Xero', 'OCR']
  },
  {
    id: '3',
    name: 'Employee Onboarding',
    description: 'Provisioning accounts in Slack, Jira, and GSuite for new hires.',
    lastUpdated: '3h ago',
    health: 'healthy',
    status: 'preview',
    collaborators: [collaborators[0], collaborators[2]],
    tags: ['HR', 'Internal']
  },
  {
    id: '4',
    name: 'Inventory Sync',
    description: 'Real-time inventory synchronization across Shopify and Warehouse DB.',
    lastUpdated: '1d ago',
    health: 'error',
    status: 'live',
    collaborators: [collaborators[1]],
    tags: ['E-commerce', 'Shopify']
  },
  {
    id: '5',
    name: 'Support Ticket Triage',
    description: 'AI classification of Zendesk tickets and routing to appropriate teams.',
    lastUpdated: '2d ago',
    health: 'healthy',
    status: 'draft',
    collaborators: [collaborators[0], collaborators[1], collaborators[2]],
    tags: ['Support', 'AI']
  },
  {
    id: '6',
    name: 'Weekly Reporting',
    description: 'Aggregating data from Salesforce and generating PDF reports.',
    lastUpdated: '1w ago',
    health: 'healthy',
    status: 'live',
    collaborators: [],
    tags: ['Sales', 'Reporting']
  }
];

export const notifications: Notification[] = [
  {
    id: '1',
    title: 'Change Request Needs Review',
    message: 'Sarah updated the email templates in Lead Gen Pipeline.',
    time: '10m ago',
    type: 'review',
    isUnread: true,
    actor: collaborators[0]
  },
  {
    id: '2',
    title: 'Update Published',
    message: 'Invoice Processing v1.2.4 is now Live.',
    time: '1h ago',
    type: 'publish',
    isUnread: true
  },
  {
    id: '3',
    title: 'New Comment',
    message: 'Mike commented on "Retry Logic" in Inventory Sync.',
    time: '2h ago',
    type: 'comment',
    isUnread: false,
    actor: collaborators[1]
  },
  {
    id: '4',
    title: 'New Updates Saved',
    message: 'Jessica saved changes to Draft Version',
    time: '4h ago',
    type: 'update',
    isUnread: false,
    actor: collaborators[2]
  }
];
