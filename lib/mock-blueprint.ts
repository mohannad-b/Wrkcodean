import { Node, Edge } from "reactflow";
import { Mail, FileText, Zap, CheckSquare, Split, Bell } from "lucide-react";

// V1.1: Current version (> $8k)
export const nodesV1_1: Node[] = [
  {
    id: "1",
    type: "custom",
    position: { x: 400, y: 50 },
    data: {
      title: "New Invoice Email",
      icon: Mail,
      type: "trigger",
      status: "complete",
      description: 'Triggers when email arrives with "Invoice" in subject.',
    },
  },
  {
    id: "2",
    type: "custom",
    position: { x: 400, y: 250 },
    data: {
      title: "Extract Details",
      icon: FileText,
      type: "action",
      status: "ai-suggested",
      description: "AI extracts vendor, amount, and date from PDF.",
      isNew: true,
    },
  },
  {
    id: "3",
    type: "custom",
    position: { x: 400, y: 450 },
    data: {
      title: "Check Amount",
      icon: Split,
      type: "logic",
      status: "complete",
      description: "Decision: Is amount > $8,000?",
    },
  },
  {
    id: "4",
    type: "custom",
    position: { x: 200, y: 650 },
    data: {
      title: "Request Approval",
      icon: CheckSquare,
      type: "human",
      status: "warning",
      description: "Assign task to Finance Manager for approval.",
    },
  },
  {
    id: "5",
    type: "custom",
    position: { x: 600, y: 650 },
    data: {
      title: "Create Draft Bill",
      icon: Zap,
      type: "action",
      status: "complete",
      description: "Create draft bill in Xero.",
    },
  },
  {
    id: "6",
    type: "custom",
    position: { x: 400, y: 850 },
    data: {
      title: "Notify Slack",
      icon: Bell,
      type: "action",
      status: "complete",
      description: "Send notification to #finance channel.",
    },
  },
];

export const edgesV1_1: Edge[] = [
  { id: "e1-2", source: "1", target: "2", type: "smoothstep" },
  { id: "e2-3", source: "2", target: "3", type: "smoothstep" },
  {
    id: "e3-4",
    source: "3",
    target: "4",
    type: "condition",
    data: { label: "> $8k", operator: ">", value: 8000, unit: "Dollars" },
  },
  {
    id: "e3-5",
    source: "3",
    target: "5",
    type: "condition",
    data: { label: "< $8k", operator: "<", value: 8000, unit: "Dollars" },
  },
  { id: "e4-6", source: "4", target: "6", type: "smoothstep" },
  { id: "e5-6", source: "5", target: "6", type: "smoothstep" },
];
