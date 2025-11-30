import { Project, Collaborator } from "./types";

const collaborators: Collaborator[] = [
  {
    id: "1",
    name: "Sarah",
    avatar:
      "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxidXNpbmVzcyUyMHdvbWFuJTIwcG9ydHJhaXR8ZW58MXx8fHwxNzY0MzEzNTUwfDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
  },
  {
    id: "2",
    name: "Mike",
    avatar:
      "https://images.unsplash.com/photo-1752860872185-78926b52ef77?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjcmVhdGl2ZSUyMHByb2Zlc3Npb25hbCUyMHBvcnRyYWl0fGVufDF8fHx8MTc2NDI3NDQ4MXww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
  },
  {
    id: "3",
    name: "Jessica",
    avatar:
      "https://images.unsplash.com/photo-1752859951149-7d3fc700a7ec?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx0ZWNoJTIwb2ZmaWNlJTIwd29ya2VyJTIwcG9ydHJhaXR8ZW58MXx8fHwxNzY0MzU5NTAwfDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
  },
];

export const mockProjects: Project[] = [
  {
    id: "1",
    name: "Lead Gen Pipeline v2",
    description: "Automated email sequences and lead scoring integration with HubSpot.",
    lastUpdated: "2m ago",
    health: "healthy",
    status: "live",
    collaborators: [collaborators[0], collaborators[1]],
    tags: ["Marketing", "HubSpot"],
  },
  {
    id: "2",
    name: "Invoice Processing",
    description: "OCR extraction from PDF invoices and sync with Xero.",
    lastUpdated: "45m ago",
    health: "warning",
    status: "draft",
    collaborators: [collaborators[2]],
    tags: ["Finance", "Xero", "OCR"],
  },
  {
    id: "3",
    name: "Employee Onboarding",
    description: "Provisioning accounts in Slack, Jira, and GSuite for new hires.",
    lastUpdated: "3h ago",
    health: "healthy",
    status: "preview",
    collaborators: [collaborators[0], collaborators[2]],
    tags: ["HR", "Internal"],
  },
  {
    id: "4",
    name: "Inventory Sync",
    description: "Real-time inventory synchronization across Shopify and Warehouse DB.",
    lastUpdated: "1d ago",
    health: "error",
    status: "live",
    collaborators: [collaborators[1]],
    tags: ["E-commerce", "Shopify"],
  },
  {
    id: "5",
    name: "Support Ticket Triage",
    description: "AI classification of Zendesk tickets and routing to appropriate teams.",
    lastUpdated: "2d ago",
    health: "healthy",
    status: "draft",
    collaborators: [collaborators[0], collaborators[1], collaborators[2]],
    tags: ["Support", "AI"],
  },
  {
    id: "6",
    name: "Weekly Reporting",
    description: "Aggregating data from Salesforce and generating PDF reports.",
    lastUpdated: "1w ago",
    health: "healthy",
    status: "live",
    collaborators: [],
    tags: ["Sales", "Reporting"],
  },
];
