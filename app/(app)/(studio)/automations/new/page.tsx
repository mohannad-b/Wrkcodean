"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertCircle,
  Loader2,
  Sparkles as SparklesIcon,
  Undo2,
  Zap,
  CheckCircle2,
  ShoppingCart,
  Package,
  Mail,
  Calendar,
  FileText,
  CreditCard,
  Home,
  Building,
  Wrench,
  Users,
  Briefcase,
  GraduationCap,
  Code,
  Hammer,
  MapPin,
  ShieldCheck,
  Video,
  Camera,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  SelectGroup,
} from "@/components/ui/select";

type AutomationType = "starter" | "intermediate" | "advanced";
const DEFAULT_AUTOMATION_TYPE: AutomationType = "intermediate";
type ExpansionLevel = "basic" | "medium" | "expert";

const EXPANSION_OPTIONS: Array<{
  id: ExpansionLevel;
  title: string;
  description: string;
}> = [
  {
    id: "basic",
    title: "Basic expand",
    description: "Fill gaps and clarify intent without changing the tone or length too much.",
  },
  {
    id: "medium",
    title: "Medium expand",
    description: "Polish and enrich with clearer structure, steps, and data flow.",
  },
  {
    id: "expert",
    title: "Expert expand",
    description: "Build out the whole workflow with triggers, actors, systems, and edge cases.",
  },
];

const INDUSTRIES = [
  "Retail & E-commerce",
  "Healthcare",
  "Finance & Banking",
  "Real Estate",
  "Manufacturing",
  "Professional Services",
  "Hospitality & Tourism",
  "Education",
  "Technology",
  "Construction",
];

const DEPARTMENTS = [
  "Sales",
  "Marketing",
  "Operations",
  "Finance & Accounting",
  "Human Resources",
  "Customer Support",
  "IT & Engineering",
  "Product Management",
];

const SUGGESTIONS_PER_PAGE = 6;

const COMMON_USE_CASES: Record<string, Array<{ text: string; description: string; icon: React.ReactNode }>> = {
  "Retail & E-commerce": [
    {
      text: "Sync Shopify orders to QuickBooks and send confirmation emails via Gmail",
      description: "When a new order comes in from Shopify, automatically create an invoice in QuickBooks and send a confirmation email to the customer through Gmail.",
      icon: <ShoppingCart className="h-5 w-5" />,
    },
    {
      text: "Update inventory levels between WooCommerce and warehouse management system",
      description: "Automatically sync product inventory quantities from your warehouse system to your WooCommerce store to keep stock levels accurate.",
      icon: <Package className="h-5 w-5" />,
    },
    {
      text: "Send personalized follow-up emails after purchase using Mailchimp and customer data from Salesforce",
      description: "After a customer completes a purchase, automatically add them to a Mailchimp campaign and send a personalized follow-up email based on their purchase history from Salesforce.",
      icon: <Mail className="h-5 w-5" />,
    },
    {
      text: "Process returns and refunds from e-commerce platform to payment processor and inventory system",
      description: "When a return is initiated in your e-commerce platform, automatically process the refund through your payment processor (Stripe, PayPal) and update inventory levels in your warehouse management system.",
      icon: <CreditCard className="h-5 w-5" />,
    },
    {
      text: "Sync customer reviews from product pages to CRM and trigger follow-up campaigns",
      description: "Automatically capture customer reviews from your product pages, sync them to your CRM (Salesforce, HubSpot), and trigger personalized follow-up email campaigns based on review sentiment.",
      icon: <Users className="h-5 w-5" />,
    },
    {
      text: "Automate abandoned cart recovery with SMS and email reminders using customer data",
      description: "When a customer abandons their cart, automatically send SMS and email reminders with personalized product recommendations, pulling customer preferences from your CRM and purchase history.",
      icon: <ShoppingCart className="h-5 w-5" />,
    },
  ],
  Healthcare: [
    {
      text: "Send patient appointment reminders via SMS using Twilio and calendar data from Epic",
      description: "Automatically send SMS reminders to patients 24 hours before their appointments using Twilio, pulling appointment data from your Epic EHR system.",
      icon: <Calendar className="h-5 w-5" />,
    },
    {
      text: "Process insurance claims from Epic and verify coverage with insurance APIs",
      description: "When a new claim is created in Epic, automatically verify patient insurance coverage through insurance provider APIs and update the claim status.",
      icon: <FileText className="h-5 w-5" />,
    },
    {
      text: "Sync patient data between Epic EHR and billing system like Athenahealth",
      description: "Automatically sync patient demographic and visit information from Epic to your billing system (Athenahealth) to ensure accurate billing.",
      icon: <CreditCard className="h-5 w-5" />,
    },
    {
      text: "Automate prescription refill requests from patient portal to pharmacy system",
      description: "When a patient requests a prescription refill through the patient portal, automatically verify eligibility in Epic, check medication availability, and send the prescription to the pharmacy system with patient notifications.",
      icon: <Package className="h-5 w-5" />,
    },
    {
      text: "Send lab results to patients via secure messaging and update EHR records",
      description: "When lab results are available, automatically send secure messages to patients through the patient portal, update their Epic EHR records, and notify their primary care physician if results require attention.",
      icon: <FileText className="h-5 w-5" />,
    },
    {
      text: "Schedule follow-up appointments based on treatment plans and send reminders",
      description: "Automatically schedule follow-up appointments based on treatment plans in Epic, send confirmation emails and SMS reminders, and sync with provider calendars to ensure availability.",
      icon: <Calendar className="h-5 w-5" />,
    },
  ],
  "Finance & Banking": [
    {
      text: "Process invoices from Gmail, extract data with OCR, and create entries in Xero",
      description: "When invoices arrive in Gmail, automatically extract invoice details using OCR, validate the data, and create corresponding entries in Xero accounting software.",
      icon: <FileText className="h-5 w-5" />,
    },
    {
      text: "Monitor transactions in Stripe and send fraud alerts to Slack",
      description: "Continuously monitor Stripe transactions for suspicious patterns and automatically send alerts to a dedicated Slack channel when potential fraud is detected.",
      icon: <CreditCard className="h-5 w-5" />,
    },
    {
      text: "Generate financial reports from QuickBooks and email them to clients via Outlook",
      description: "Automatically generate monthly financial reports from QuickBooks data and email them to clients using Outlook, with personalized messaging for each recipient.",
      icon: <Mail className="h-5 w-5" />,
    },
    {
      text: "Automate loan application processing from application forms to underwriting system",
      description: "When a loan application is submitted, automatically extract applicant data, run credit checks through APIs, calculate risk scores, and route to the appropriate underwriting workflow based on loan amount and risk profile.",
      icon: <FileText className="h-5 w-5" />,
    },
    {
      text: "Sync bank transactions from multiple accounts to accounting software and categorize expenses",
      description: "Automatically import transactions from multiple bank accounts (via Plaid or bank APIs), categorize expenses based on rules and machine learning, and sync to QuickBooks or Xero for reconciliation.",
      icon: <CreditCard className="h-5 w-5" />,
    },
    {
      text: "Send payment reminders and process late fees for overdue invoices",
      description: "Automatically identify overdue invoices in your accounting system, send escalating payment reminders via email and SMS, calculate and apply late fees, and update customer records in your CRM.",
      icon: <Mail className="h-5 w-5" />,
    },
  ],
  "Real Estate": [
    {
      text: "Qualify leads from Zillow and add qualified prospects to Salesforce CRM",
      description: "When new leads come in from Zillow, automatically evaluate them against qualification criteria and add qualified prospects to your Salesforce CRM with relevant property preferences.",
      icon: <Home className="h-5 w-5" />,
    },
    {
      text: "Sync property listings between MLS and Zillow/Realtor.com",
      description: "Automatically sync new property listings from your MLS system to Zillow and Realtor.com, ensuring all platforms have up-to-date listing information.",
      icon: <Building className="h-5 w-5" />,
    },
    {
      text: "Send property status updates to clients via email using property data from AppFolio",
      description: "Automatically send email updates to clients when property status changes (e.g., under contract, inspection scheduled) using data from your AppFolio property management system.",
      icon: <Mail className="h-5 w-5" />,
    },
    {
      text: "Automate lease renewal reminders and generate renewal documents via DocuSign",
      description: "Automatically identify leases expiring in the next 90 days, send renewal reminders to tenants via email and SMS, generate renewal documents in AppFolio, and send them for signature via DocuSign.",
      icon: <FileText className="h-5 w-5" />,
    },
    {
      text: "Process maintenance requests from tenant portal and assign to vendors",
      description: "When tenants submit maintenance requests through the portal, automatically categorize the request, assign to appropriate vendors based on issue type and location, send work orders, and notify tenants of scheduled repairs.",
      icon: <Wrench className="h-5 w-5" />,
    },
    {
      text: "Sync rent payments from payment processor to property management and accounting systems",
      description: "Automatically sync rent payments from payment processors (Stripe, PayPal) to your property management system (AppFolio, Buildium), update tenant ledgers, and create entries in your accounting software (QuickBooks, Xero).",
      icon: <CreditCard className="h-5 w-5" />,
    },
  ],
  Manufacturing: [
    {
      text: "Schedule production in ERP system based on inventory levels from warehouse management system",
      description: "Automatically create production schedules in your ERP system (like SAP or NetSuite) when inventory levels drop below thresholds in your warehouse management system.",
      icon: <Package className="h-5 w-5" />,
    },
    {
      text: "Monitor equipment sensors and send maintenance alerts to maintenance team via Microsoft Teams",
      description: "Continuously monitor IoT sensors on manufacturing equipment and automatically send alerts to the maintenance team via Microsoft Teams when maintenance is needed.",
      icon: <Wrench className="h-5 w-5" />,
    },
    {
      text: "Sync order data from Salesforce to production planning system",
      description: "Automatically sync new sales orders from Salesforce to your production planning system to ensure manufacturing schedules reflect current demand.",
      icon: <ShoppingCart className="h-5 w-5" />,
    },
    {
      text: "Automate quality control workflows from inspection data to ERP and notify stakeholders",
      description: "When quality inspections are completed, automatically update quality records in your ERP system, generate quality reports, and notify production managers and quality teams via email and Slack if defects are detected.",
      icon: <FileText className="h-5 w-5" />,
    },
    {
      text: "Process purchase orders from ERP to supplier systems and track deliveries",
      description: "Automatically generate purchase orders in your ERP when materials are needed, send them to supplier systems via EDI or APIs, track delivery status, and update inventory when materials arrive.",
      icon: <Package className="h-5 w-5" />,
    },
    {
      text: "Sync production output data to inventory management and shipping systems",
      description: "When production batches are completed, automatically update finished goods inventory in your warehouse management system, create shipping labels for customer orders, and notify logistics teams via Microsoft Teams.",
      icon: <Package className="h-5 w-5" />,
    },
  ],
  "Professional Services": [
    {
      text: "Onboard new clients by collecting documents via DocuSign and storing in Dropbox",
      description: "When a new client is added to your CRM, automatically send document collection requests via DocuSign and organize completed documents in Dropbox folders.",
      icon: <Briefcase className="h-5 w-5" />,
    },
    {
      text: "Track billable hours from Toggl and generate invoices in FreshBooks",
      description: "Automatically sync time entries from Toggl to FreshBooks and generate invoices based on billable hours, including project details and hourly rates.",
      icon: <CreditCard className="h-5 w-5" />,
    },
    {
      text: "Send project status updates from Asana to stakeholders via email",
      description: "Automatically compile project status updates from Asana and send weekly summary emails to project stakeholders with key milestones and updates.",
      icon: <Mail className="h-5 w-5" />,
    },
    {
      text: "Automate contract renewal workflows from CRM to document generation and client notifications",
      description: "When contracts are approaching expiration dates in your CRM, automatically generate renewal documents, send them to clients via DocuSign, track signature status, and notify account managers of pending renewals.",
      icon: <FileText className="h-5 w-5" />,
    },
    {
      text: "Process expense reports from receipt submissions to accounting software",
      description: "When employees submit expense reports with receipts, automatically extract data using OCR, validate against company policies, route for approval, and sync approved expenses to QuickBooks or Xero.",
      icon: <FileText className="h-5 w-5" />,
    },
    {
      text: "Sync project deliverables from project management tools to client portals and send notifications",
      description: "When project deliverables are marked complete in Asana or Monday.com, automatically upload them to client portals (like ClientSuccess), send notification emails to clients, and update project status in your CRM.",
      icon: <Briefcase className="h-5 w-5" />,
    },
  ],
  "Hospitality & Tourism": [
    {
      text: "Send booking confirmations from Booking.com to guests via email and SMS",
      description: "When a new booking is created in Booking.com, automatically send confirmation emails and SMS messages to guests with booking details and check-in instructions.",
      icon: <Calendar className="h-5 w-5" />,
    },
    {
      text: "Sync reservations between Airbnb, Booking.com, and property management system",
      description: "Automatically sync reservations from Airbnb and Booking.com to your property management system to prevent double bookings and maintain accurate availability calendars.",
      icon: <Building className="h-5 w-5" />,
    },
    {
      text: "Send personalized recommendations to guests using booking data from property management system",
      description: "Based on guest booking history and preferences stored in your property management system, automatically send personalized local recommendations via email.",
      icon: <Mail className="h-5 w-5" />,
    },
    {
      text: "Automate check-in and check-out workflows with key code generation and guest communications",
      description: "When a booking is confirmed, automatically generate unique key codes, send check-in instructions via email and SMS, schedule check-out reminders, and update property status in your management system.",
      icon: <Home className="h-5 w-5" />,
    },
    {
      text: "Process guest reviews from booking platforms to CRM and trigger follow-up campaigns",
      description: "Automatically capture guest reviews from Airbnb, Booking.com, and TripAdvisor, sync them to your CRM, analyze sentiment, and trigger personalized follow-up emails to encourage repeat bookings.",
      icon: <Users className="h-5 w-5" />,
    },
    {
      text: "Sync housekeeping schedules from property management system to cleaning service apps",
      description: "When check-outs are scheduled, automatically create housekeeping tasks in your property management system, assign them to cleaning services via their apps (like Turno), and send confirmation notifications.",
      icon: <Wrench className="h-5 w-5" />,
    },
  ],
  Education: [
    {
      text: "Enroll students from application system and create accounts in Canvas LMS",
      description: "When a new student is enrolled through your application system, automatically create their user account in Canvas learning management system with appropriate course assignments.",
      icon: <GraduationCap className="h-5 w-5" />,
    },
    {
      text: "Send assignment reminders from Canvas to students via email and SMS",
      description: "Automatically send reminder notifications to students via email and SMS when assignments are due soon, using assignment data from Canvas LMS.",
      icon: <Mail className="h-5 w-5" />,
    },
    {
      text: "Sync student data between PowerSchool and student information system",
      description: "Automatically sync student enrollment, grades, and attendance data between PowerSchool and your student information system to maintain data consistency.",
      icon: <FileText className="h-5 w-5" />,
    },
    {
      text: "Automate course registration from student portal to LMS and notify instructors",
      description: "When students register for courses through the student portal, automatically enroll them in corresponding Canvas courses, assign them to appropriate sections, and notify instructors of new enrollments via email.",
      icon: <Calendar className="h-5 w-5" />,
    },
    {
      text: "Process grade submissions from LMS to student information system and send report cards",
      description: "When instructors submit final grades in Canvas, automatically sync them to PowerSchool, calculate GPAs, generate report cards, and send them to parents via email and student portals.",
      icon: <FileText className="h-5 w-5" />,
    },
    {
      text: "Send attendance alerts to parents when students are marked absent",
      description: "When attendance is marked in PowerSchool, automatically detect absences, send SMS and email alerts to parents, log attendance in the student information system, and notify school administrators of patterns.",
      icon: <Mail className="h-5 w-5" />,
    },
  ],
  Technology: [
    {
      text: "Onboard new SaaS customers by creating accounts in Stripe, sending welcome emails via SendGrid, and adding to Intercom",
      description: "When a new customer signs up, automatically create their billing account in Stripe, send a welcome email via SendGrid, and add them to Intercom for customer support.",
      icon: <Users className="h-5 w-5" />,
    },
    {
      text: "Sync user data between Salesforce CRM and Zendesk support system",
      description: "Automatically sync customer data from Salesforce to Zendesk so support agents have complete customer context when handling support tickets.",
      icon: <Code className="h-5 w-5" />,
    },
    {
      text: "Send system alerts from monitoring tools like Datadog to Slack and PagerDuty",
      description: "When system issues are detected by Datadog monitoring, automatically send alerts to relevant Slack channels and create incidents in PagerDuty for on-call engineers.",
      icon: <Zap className="h-5 w-5" />,
    },
    {
      text: "Automate feature flag updates from product management tools to deployment systems",
      description: "When feature flags are updated in LaunchDarkly or similar tools, automatically deploy changes to staging and production environments, run smoke tests, and notify engineering teams via Slack.",
      icon: <Code className="h-5 w-5" />,
    },
    {
      text: "Process customer feedback from support tickets to product roadmap tools",
      description: "Automatically analyze support tickets in Zendesk, extract feature requests and bug reports, categorize them, and create corresponding items in product management tools like Jira or Linear for prioritization.",
      icon: <FileText className="h-5 w-5" />,
    },
    {
      text: "Sync subscription changes from billing system to access control and notify customers",
      description: "When subscription plans change in Stripe (upgrades, downgrades, cancellations), automatically update user access permissions in your application, sync to Salesforce, and send confirmation emails to customers.",
      icon: <CreditCard className="h-5 w-5" />,
    },
  ],
  Construction: [
    {
      text: "Track project milestones in Procore and send notifications to stakeholders via email",
      description: "Automatically send email notifications to project stakeholders when milestones are completed in Procore, including progress photos and completion certificates.",
      icon: <Hammer className="h-5 w-5" />,
    },
    {
      text: "Sync material orders from procurement system to inventory management system",
      description: "Automatically sync material orders from your procurement system to your inventory management system to maintain accurate material tracking and availability.",
      icon: <Package className="h-5 w-5" />,
    },
    {
      text: "Send safety compliance reminders from safety management system to teams via SMS",
      description: "Automatically send SMS reminders to construction teams about upcoming safety training requirements and compliance deadlines based on data from your safety management system.",
      icon: <Mail className="h-5 w-5" />,
    },
    {
      text: "Process change orders from client requests to project management and accounting systems",
      description: "When clients request change orders, automatically create change order documents in Procore, route them for approval, update project budgets in your accounting system, and notify project managers and clients of status changes.",
      icon: <FileText className="h-5 w-5" />,
    },
    {
      text: "Automate daily reports from field data collection apps to project management and client portals",
      description: "When field supervisors submit daily reports through mobile apps, automatically compile them, upload to Procore, generate summary reports, and share with clients through project portals with photos and progress updates.",
      icon: <FileText className="h-5 w-5" />,
    },
    {
      text: "Sync equipment maintenance schedules from asset management to maintenance teams",
      description: "Automatically track equipment usage and maintenance schedules in your asset management system, send maintenance reminders to field teams via SMS, schedule service appointments, and update equipment records when maintenance is completed.",
      icon: <Wrench className="h-5 w-5" />,
    },
  ],
  Sales: [
    {
      text: "Qualify inbound leads and assign to reps based on territory rules",
      description:
        "When a new lead enters the CRM, enrich with firmographic data, score it, and route to the correct sales rep based on territory and product line.",
      icon: <Briefcase className="h-5 w-5" />,
    },
    {
      text: "Create follow-up tasks after demos and send recap emails",
      description:
        "After a demo is logged, auto-create follow-up tasks in the CRM, send a recap email with next steps, and schedule reminders in the rep’s calendar.",
      icon: <Calendar className="h-5 w-5" />,
    },
    {
      text: "Sync pipeline updates to forecasting sheet and Slack",
      description:
        "When opportunities move stages, push updates to the forecasting spreadsheet and notify sales leadership in Slack with deal risk highlights.",
      icon: <FileText className="h-5 w-5" />,
    },
    {
      text: "Automate quote generation from product catalog",
      description:
        "When a rep selects products, automatically generate a quote document, calculate discounts, and send it for approval and e-signature.",
      icon: <CreditCard className="h-5 w-5" />,
    },
    {
      text: "Re-engage stalled deals with personalized sequences",
      description:
        "Detect deals with no activity for 14 days, enroll contacts into a personalized outreach sequence, and alert the account owner.",
      icon: <Mail className="h-5 w-5" />,
    },
    {
      text: "Sync closed-won deals to billing and onboarding",
      description:
        "When a deal is marked closed-won, create the customer in billing, start onboarding tasks, and send welcome emails to stakeholders.",
      icon: <Package className="h-5 w-5" />,
    },
  ],
  Marketing: [
    {
      text: "Score inbound leads from form fills and route to sales",
      description:
        "Score leads from marketing forms, tag them by campaign, and route qualified leads into the CRM with the right owner and notes.",
      icon: <Mail className="h-5 w-5" />,
    },
    {
      text: "Repurpose blog posts into social content",
      description:
        "When a new blog publishes, generate social copy variations, push drafts to the calendar, and create design tasks for creative assets.",
      icon: <SparklesIcon className="h-5 w-5" />,
    },
    {
      text: "Sync webinar registrants to CRM and send reminders",
      description:
        "Capture webinar registrations, create contacts, enroll them into reminder campaigns, and push attendance data back to the CRM.",
      icon: <Calendar className="h-5 w-5" />,
    },
    {
      text: "Automate UTM validation and campaign tagging",
      description:
        "Validate UTM parameters on incoming leads, standardize campaign names, and update analytics dashboards automatically.",
      icon: <FileText className="h-5 w-5" />,
    },
    {
      text: "Route intent signals to SDRs with context",
      description:
        "Monitor intent data sources, enrich accounts with buying signals, and alert SDRs with recommended outreach steps.",
      icon: <Zap className="h-5 w-5" />,
    },
    {
      text: "Generate nurture sequences by persona",
      description:
        "When a contact’s persona is identified, automatically enroll them into a tailored nurture flow with emails and retargeting audiences.",
      icon: <Users className="h-5 w-5" />,
    },
  ],
  Operations: [
    {
      text: "Auto-create tickets for failed jobs and assign owners",
      description:
        "Monitor system failures, open tickets in the ops queue with logs attached, and notify the right on-call owner.",
      icon: <Wrench className="h-5 w-5" />,
    },
    {
      text: "Daily KPI rollups to leadership",
      description:
        "Aggregate operational metrics each morning, generate a summary, and send it to stakeholders via email and Slack.",
      icon: <FileText className="h-5 w-5" />,
    },
    {
      text: "Intake form routing for internal requests",
      description:
        "Collect requests from an intake form, categorize them, and route to the correct team with SLAs and due dates.",
      icon: <Package className="h-5 w-5" />,
    },
    {
      text: "Vendor onboarding workflow",
      description:
        "When a new vendor is added, trigger security reviews, contract approvals, and account provisioning tasks automatically.",
      icon: <Briefcase className="h-5 w-5" />,
    },
    {
      text: "Inventory threshold alerts and purchase orders",
      description:
        "Watch inventory levels, alert when thresholds are crossed, and auto-create purchase orders in the ERP for approvals.",
      icon: <ShoppingCart className="h-5 w-5" />,
    },
    {
      text: "Service outage playbooks",
      description:
        "On incident creation, spin up a command channel, invite responders, share the runbook, and track comms to customers.",
      icon: <AlertCircle className="h-5 w-5" />,
    },
  ],
  "Finance & Accounting": [
    {
      text: "Auto-categorize expenses from receipts",
      description:
        "Pull receipts from email, extract data, categorize expenses based on rules, and push to the accounting system.",
      icon: <CreditCard className="h-5 w-5" />,
    },
    {
      text: "Monthly close checklist automation",
      description:
        "Generate close checklists, assign owners, pull trial balances, and remind assignees as deadlines approach.",
      icon: <FileText className="h-5 w-5" />,
    },
    {
      text: "Invoice approvals and payments",
      description:
        "Route invoices for approval based on amount and department, then push approved invoices to payments and update status.",
      icon: <Package className="h-5 w-5" />,
    },
    {
      text: "Revenue recognition scheduling",
      description:
        "When new contracts are signed, generate rev rec schedules, sync to the ledger, and alert finance of anomalies.",
      icon: <Calendar className="h-5 w-5" />,
    },
    {
      text: "Budget vs actuals variance alerts",
      description:
        "Compare actuals to budget monthly, highlight variances beyond thresholds, and notify budget owners with context.",
      icon: <AlertCircle className="h-5 w-5" />,
    },
    {
      text: "Cash flow forecast refresh",
      description:
        "Pull bank balances and upcoming payables/receivables, refresh the cash flow model, and send a summary to finance leaders.",
      icon: <Home className="h-5 w-5" />,
    },
  ],
  "Human Resources": [
    {
      text: "New hire onboarding checklist and system access",
      description:
        "When an offer is accepted, trigger onboarding tasks, provision accounts, schedule orientation, and notify managers.",
      icon: <Users className="h-5 w-5" />,
    },
    {
      text: "Recruiting pipeline updates to hiring managers",
      description:
        "Sync applicant stage changes to hiring manager dashboards and send weekly summaries with bottlenecks.",
      icon: <Briefcase className="h-5 w-5" />,
    },
    {
      text: "Automate performance review reminders",
      description:
        "Start review cycles, notify reviewers, collect feedback forms, and follow up on overdue submissions.",
      icon: <Calendar className="h-5 w-5" />,
    },
    {
      text: "Offboarding with asset recovery",
      description:
        "When an offboarding is initiated, disable accounts, collect assets, update payroll, and notify stakeholders.",
      icon: <Wrench className="h-5 w-5" />,
    },
    {
      text: "Training compliance tracking",
      description:
        "Assign mandatory trainings, track completion, send reminders, and escalate overdue items to managers.",
      icon: <GraduationCap className="h-5 w-5" />,
    },
    {
      text: "Employee data sync across HRIS and payroll",
      description:
        "Keep employee records consistent across HRIS, payroll, and benefits platforms with automated updates.",
      icon: <FileText className="h-5 w-5" />,
    },
  ],
  "Customer Support": [
    {
      text: "Auto-triage tickets by sentiment and priority",
      description:
        "Analyze incoming tickets, tag them by sentiment and urgency, and route to the right queue with SLAs.",
      icon: <Mail className="h-5 w-5" />,
    },
    {
      text: "Surface similar resolved cases to agents",
      description:
        "When a ticket opens, fetch similar past cases and display suggested responses to the agent.",
      icon: <SparklesIcon className="h-5 w-5" />,
    },
    {
      text: "Escalation workflows to engineering",
      description:
        "Create linked engineering issues for escalations, sync status back to the helpdesk, and notify customers automatically.",
      icon: <Code className="h-5 w-5" />,
    },
    {
      text: "CSAT follow-up automation",
      description:
        "Send CSAT surveys post-resolution, alert managers on low scores, and open follow-up tasks for detractors.",
      icon: <AlertCircle className="h-5 w-5" />,
    },
    {
      text: "VIP support routing",
      description:
        "Detect VIP customers, prioritize their tickets, route to senior agents, and ensure response within defined SLAs.",
      icon: <Users className="h-5 w-5" />,
    },
    {
      text: "Proactive outreach on incident updates",
      description:
        "During incidents, send status updates to affected customers, log communications, and close the loop post-recovery.",
      icon: <Calendar className="h-5 w-5" />,
    },
  ],
  "IT & Engineering": [
    {
      text: "Access requests with approvals and provisioning",
      description:
        "Handle access requests via form, route approvals based on role, and provision accounts across systems automatically.",
      icon: <Wrench className="h-5 w-5" />,
    },
    {
      text: "CI/CD failure alerts with diagnostics",
      description:
        "On CI pipeline failures, collect logs, post a summary to Slack, create a ticket, and tag the owning team.",
      icon: <Code className="h-5 w-5" />,
    },
    {
      text: "Change management notifications",
      description:
        "When a change request is approved, notify stakeholders, schedule deployment windows, and update status pages.",
      icon: <Calendar className="h-5 w-5" />,
    },
    {
      text: "Security incident intake and routing",
      description:
        "Standardize security incident intake, auto-assign based on severity, and kick off investigation checklists.",
      icon: <AlertCircle className="h-5 w-5" />,
    },
    {
      text: "Asset lifecycle tracking",
      description:
        "Track device assignments, warranty status, and refresh cycles; create tasks before warranty expiration.",
      icon: <Package className="h-5 w-5" />,
    },
    {
      text: "Monitor error spikes and open tickets",
      description:
        "Detect error spikes in observability tools, create tickets with context, and alert the on-call engineer.",
      icon: <Zap className="h-5 w-5" />,
    },
  ],
  "Product Management": [
    {
      text: "Aggregate user feedback into themes",
      description:
        "Collect feedback from support, sales, and surveys, cluster themes, and push summaries to the roadmap board.",
      icon: <Users className="h-5 w-5" />,
    },
    {
      text: "Beta program enrollment and follow-up",
      description:
        "Enroll eligible users into beta programs, send onboarding guides, and collect structured feedback automatically.",
      icon: <Mail className="h-5 w-5" />,
    },
    {
      text: "Release notes automation",
      description:
        "Generate release notes from merged PRs, format by user impact, and publish to docs and email lists.",
      icon: <FileText className="h-5 w-5" />,
    },
    {
      text: "Feature flag rollout coordination",
      description:
        "When enabling a flag, notify stakeholders, schedule gradual rollout, and monitor metrics with alerts.",
      icon: <SparklesIcon className="h-5 w-5" />,
    },
    {
      text: "Customer interview scheduling",
      description:
        "Identify target customers, send invitations, schedule interviews, and log notes back to the CRM.",
      icon: <Calendar className="h-5 w-5" />,
    },
    {
      text: "Roadmap dependency tracking",
      description:
        "Track dependencies across teams, alert when timelines slip, and update roadmap artifacts automatically.",
      icon: <Briefcase className="h-5 w-5" />,
    },
  ],
};

const COMBO_USE_CASES: Record<string, Array<{ text: string; description: string; icon: React.ReactNode }>> = {
  "Retail & E-commerce|Marketing": [
    {
      text: "Launch promo campaigns from product drops",
      description:
        "When a new product goes live, auto-create launch emails, paid ads, and social posts with SKU-specific creatives and inventory-aware messaging.",
      icon: <SparklesIcon className="h-5 w-5" />,
    },
    {
      text: "Recover high-value carts with tailored offers",
      description:
        "Detect abandoned carts over a set value, segment by customer tier, and trigger SMS/email with personalized bundles and limited-time offers.",
      icon: <CreditCard className="h-5 w-5" />,
    },
    {
      text: "Creator/UCG sourcing from top products",
      description:
        "Identify top-selling SKUs weekly, request UGC from recent buyers, route approvals, and schedule social placements by channel.",
      icon: <Users className="h-5 w-5" />,
    },
    {
      text: "Merch feed to ads with live availability",
      description:
        "Sync product availability to ad platforms, pause ads for out-of-stock variants, and boost budget on high-margin SKUs automatically.",
      icon: <Package className="h-5 w-5" />,
    },
    {
      text: "Loyalty nudges by cohort",
      description:
        "Cohort customers by LTV and category, send replenishment and cross-sell offers with predicted next-best product suggestions.",
      icon: <Mail className="h-5 w-5" />,
    },
    {
      text: "Promo performance pulse",
      description:
        "Roll up campaign ROAS, CAC, and conversion by channel each morning; alert when promo codes over-discount or margin erodes.",
      icon: <FileText className="h-5 w-5" />,
    },
  ],
  "Healthcare|Marketing": [
    {
      text: "Localized service-line campaigns",
      description:
        "Launch geo-targeted ads for service lines (orthopedics, cardiology), using eligibility rules and location-specific provider availability.",
      icon: <MapPin className="h-5 w-5" />,
    },
    {
      text: "No-show reduction drips",
      description:
        "Trigger SMS/email reminders with prep instructions based on appointment type, track confirmations, and escalate to call center for high-risk no-shows.",
      icon: <Calendar className="h-5 w-5" />,
    },
    {
      text: "HIPAA-safe lead intake routing",
      description:
        "Ingest web leads, scrub PHI from marketing systems, and route to the CRM or patient access team with consent tracking.",
      icon: <ShieldCheck className="h-5 w-5" />,
    },
    {
      text: "Provider spotlight nurture",
      description:
        "Enroll prospects into condition-specific education drips, slot provider intro videos, and hand off warm leads to scheduling.",
      icon: <Video className="h-5 w-5" />,
    },
    {
      text: "Reputation management by location",
      description:
        "Monitor reviews by clinic, open tickets on low scores, and trigger personalized outreach to recover detractors.",
      icon: <AlertCircle className="h-5 w-5" />,
    },
    {
      text: "Referral partner engagement",
      description:
        "Track referral sources, send performance summaries to partners, and trigger co-branded outreach for top-performing practices.",
      icon: <Briefcase className="h-5 w-5" />,
    },
  ],
  "Construction|Marketing": [
    {
      text: "Bid follow-up cadences",
      description:
        "When a bid is submitted, enroll the account in a staged follow-up cadence with project-type-specific collateral and references.",
      icon: <Hammer className="h-5 w-5" />,
    },
    {
      text: "Project win announcements",
      description:
        "On project award, publish a case-study teaser, update the project map, and push social posts tailored to region and vertical.",
      icon: <MapPin className="h-5 w-5" />,
    },
    {
      text: "Lead qualification by project scope",
      description:
        "Score inbound leads using scope, budget, and timeline; route high-fit commercial vs. residential to the right team automatically.",
      icon: <CheckCircle2 className="h-5 w-5" />,
    },
    {
      text: "Equipment availability signals",
      description:
        "Publish weekly availability for key equipment, auto-update landing pages, and notify target accounts in active cycles.",
      icon: <Wrench className="h-5 w-5" />,
    },
    {
      text: "Safety and compliance storytelling",
      description:
        "Auto-generate content featuring safety milestones and certifications for bids in regulated segments; push to email and LinkedIn.",
      icon: <ShieldCheck className="h-5 w-5" />,
    },
    {
      text: "Jobsite progress highlights",
      description:
        "Ingest site photos, select highlights, and send weekly visual updates to stakeholders segmented by project phase.",
      icon: <Camera className="h-5 w-5" />,
    },
  ],
};

export default function NewAutomationPage() {
  const router = useRouter();
  const toast = useToast();
  const [processDescription, setProcessDescription] = useState("");
  const [selectedIndustry, setSelectedIndustry] = useState<string>("");
  const [selectedDepartment, setSelectedDepartment] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExpanding, setIsExpanding] = useState(false);
  const [originalDescription, setOriginalDescription] = useState<string>("");
  const [showUndo, setShowUndo] = useState(false);
  const [showExpandOptions, setShowExpandOptions] = useState(false);
  const [suggestedUseCases, setSuggestedUseCases] = useState<Array<{ text: string; description: string; icon: React.ReactNode }>>([]);
  const [isSuggestingUseCases, setIsSuggestingUseCases] = useState(false);
  const [suggestUseCasesError, setSuggestUseCasesError] = useState<string | null>(null);
  const [suggestionsPage, setSuggestionsPage] = useState(0);
  const [suggestionCache, setSuggestionCache] = useState<Record<string, Array<{ text: string; description: string; icon: React.ReactNode }>>>({});
  const selectionKey = `${selectedIndustry || "none"}|${selectedDepartment || "none"}`;

  const handleAIExpand = async (level: ExpansionLevel) => {
    if (!processDescription.trim()) {
      return;
    }

    setIsExpanding(true);
    setOriginalDescription(processDescription);
    setError(null);
    setShowExpandOptions(false);

    try {
      const response = await fetch("/api/ai/expand-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: processDescription.trim(),
          expansionLevel: level,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to expand description");
      }

      const data = await response.json();
      setProcessDescription(data.expandedDescription);
      setShowUndo(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to expand description");
      toast({
        title: "Unable to expand description",
        description: err instanceof Error ? err.message : "Unexpected error",
        variant: "error",
      });
    } finally {
      setIsExpanding(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    
    if (!processDescription.trim()) {
      setError("Please describe your process");
      return;
    }

    if (!selectedIndustry && !selectedDepartment) {
      setError("Please select an industry or department");
      return;
    }

    setSubmitting(true);
    setError(null);
    
    try {
      const response = await fetch("/api/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          automationType: DEFAULT_AUTOMATION_TYPE,
          processDescription: processDescription.trim(),
          industry: selectedIndustry || selectedDepartment,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to create automation");
      }

      const data = await response.json();
      const automationId = data.automation.id;
      const versionId = data.automation.version.id;

      toast({
        title: "Automation created",
        description: `${data.automation.name} is ready to configure.`,
        variant: "success",
      });

      // Navigate to the blueprint screen
      router.push(`/automations/${automationId}?version=${versionId}&tab=Workflow`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
      toast({
        title: "Unable to create automation",
        description: err instanceof Error ? err.message : "Unexpected error",
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAISuggestUseCases = async () => {
    if ((!selectedIndustry && !selectedDepartment) || isSuggestingUseCases) {
      return;
    }

    setIsSuggestingUseCases(true);
    setSuggestUseCasesError(null);

    try {
      const response = await fetch("/api/ai/suggest-use-cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: [
            selectedIndustry ? `Industry: ${selectedIndustry}` : null,
            selectedDepartment ? `Department: ${selectedDepartment}` : null,
          ]
            .filter(Boolean)
            .join(" | "),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error ?? "Failed to fetch suggestions");
      }

      const useCases =
        Array.isArray(data?.useCases) && data.useCases.length > 0
          ? data.useCases
          : [];

      const normalized = useCases.slice(0, 6).map((item: any, index: number) => ({
        text: typeof item.text === "string" ? item.text : `Suggested workflow ${index + 1}`,
        description:
          typeof item.description === "string"
            ? item.description
            : "A suggested workflow tailored to your selection.",
        icon: <SparklesIcon className="h-5 w-5 text-[#E43632]" />,
      }));

      setSuggestedUseCases((prev) => {
        const merged = [...prev, ...normalized];
        setSuggestionCache((cache) => ({ ...cache, [selectionKey]: merged }));
        const nextPage = Math.max(0, Math.ceil(merged.length / SUGGESTIONS_PER_PAGE) - 1);
        setSuggestionsPage(nextPage);
        return merged;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch suggestions";
      setSuggestUseCasesError(message);
      toast({
        title: "Unable to fetch suggestions",
        description: message,
        variant: "error",
      });
    } finally {
      setIsSuggestingUseCases(false);
    }
  };

  const baseUseCases = useMemo(() => {
    const comboKey = `${selectedIndustry || ""}|${selectedDepartment || ""}`;
    const combo = COMBO_USE_CASES[comboKey];
    if (combo && combo.length > 0) {
      return combo.slice(0, 6);
    }

    const departmentUseCases = selectedDepartment ? COMMON_USE_CASES[selectedDepartment] ?? [] : [];
    const industryUseCases = selectedIndustry ? COMMON_USE_CASES[selectedIndustry] ?? [] : [];
    const combined: typeof departmentUseCases = [];
    const seen = new Set<string>();
    let d = 0;
    let i = 0;

    // Interleave department and industry to ensure both influence the set
    while (combined.length < 6 && (d < departmentUseCases.length || i < industryUseCases.length)) {
      if (d < departmentUseCases.length) {
        const item = departmentUseCases[d++];
        if (!seen.has(item.text)) {
          seen.add(item.text);
          combined.push(item);
        }
      }
      if (combined.length >= 6) break;
      if (i < industryUseCases.length) {
        const item = industryUseCases[i++];
        if (!seen.has(item.text)) {
          seen.add(item.text);
          combined.push(item);
        }
      }
    }

    return combined;
  }, [selectedDepartment, selectedIndustry]);

  const totalSuggestionPages = Math.max(1, Math.ceil(suggestedUseCases.length / SUGGESTIONS_PER_PAGE));
  const currentSuggestionsPage = Math.min(suggestionsPage, totalSuggestionPages - 1);
  const paginatedSuggestions = suggestedUseCases.slice(
    currentSuggestionsPage * SUGGESTIONS_PER_PAGE,
    currentSuggestionsPage * SUGGESTIONS_PER_PAGE + SUGGESTIONS_PER_PAGE
  );

  const availableUseCases = suggestedUseCases.length > 0 ? paginatedSuggestions : baseUseCases;

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br bg-[radial-gradient(circle_at_10%_20%,rgba(228,54,50,0.08),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(59,130,246,0.08),transparent_30%),radial-gradient(circle_at_50%_80%,rgba(16,185,129,0.08),transparent_25%)] from-slate-50 via-white to-rose-50 px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/60 via-transparent to-white/40 animate-[pulse_12s_ease-in-out_infinite]" aria-hidden />
      <div className="relative w-full max-w-4xl space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900">Describe Your Process</h1>
          <p className="text-base text-gray-600">
            Provide as many details as possible. The more information you share, the better we can help.
          </p>
        </div>

        <Card className="w-full shadow-xl shadow-gray-200/60">
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6 pt-8">
              {error ? (
                <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  <AlertCircle className="h-4 w-4" />
                  <span>{error}</span>
                </div>
              ) : null}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700" htmlFor="industry">
                    Industry
                  </label>
                  <Select
                    value={selectedIndustry}
                    onValueChange={(value) => {
                      setSelectedIndustry(value);
                      const nextKey = `${value || "none"}|${selectedDepartment || "none"}`;
                      const cached = suggestionCache[nextKey] ?? [];
                      setSuggestedUseCases(cached);
                      setSuggestionsPage(0);
                      setSuggestUseCasesError(null);
                    }}
                  >
                    <SelectTrigger id="industry" className="bg-white">
                      <SelectValue placeholder="Select an industry" />
                    </SelectTrigger>
                    <SelectContent className="bg-white">
                      <SelectGroup>
                        <SelectLabel>By industry</SelectLabel>
                        {INDUSTRIES.map((industry) => (
                          <SelectItem
                            key={industry}
                            value={industry}
                            className="hover:bg-gray-100 focus:bg-gray-100 data-[highlighted]:bg-gray-100"
                          >
                            {industry}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700" htmlFor="department">
                    Department
                  </label>
                  <Select
                    value={selectedDepartment}
                    onValueChange={(value) => {
                      setSelectedDepartment(value);
                      const nextKey = `${selectedIndustry || "none"}|${value || "none"}`;
                      const cached = suggestionCache[nextKey] ?? [];
                      setSuggestedUseCases(cached);
                      setSuggestionsPage(0);
                      setSuggestUseCasesError(null);
                    }}
                  >
                    <SelectTrigger id="department" className="bg-white">
                      <SelectValue placeholder="Select a department" />
                    </SelectTrigger>
                    <SelectContent className="bg-white">
                      <SelectGroup>
                        <SelectLabel>By department</SelectLabel>
                        {DEPARTMENTS.map((department) => (
                          <SelectItem
                            key={department}
                            value={department}
                            className="hover:bg-gray-100 focus:bg-gray-100 data-[highlighted]:bg-gray-100"
                          >
                            {department}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {selectedIndustry && availableUseCases.length > 0 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Most common use cases</label>
                  <div className="grid grid-cols-2 gap-3">
                    {availableUseCases.map((useCase, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => setProcessDescription(useCase.description)}
                        className="text-left p-3 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 hover:border-[#E43632] transition-all group flex items-start gap-3"
                      >
                        <div className="text-[#E43632] shrink-0 mt-0.5">
                          {useCase.icon}
                        </div>
                        <div className="text-sm font-medium text-gray-900 group-hover:text-[#E43632] transition-colors">
                          {useCase.text}
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-gray-500">
                      Click any use case above to auto-fill the form, or describe your own process below.
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {suggestUseCasesError ? (
                        <span className="text-[11px] text-red-600">{suggestUseCasesError}</span>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAISuggestUseCases}
                        disabled={isSuggestingUseCases}
                        className="h-8 text-xs"
                      >
                        {isSuggestingUseCases ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                            AI suggesting...
                          </>
                        ) : (
                          <>
                            <SparklesIcon className="h-3.5 w-3.5 mr-2 text-[#E43632]" />
                            AI suggest more
                          </>
                        )}
                      </Button>

                      {suggestedUseCases.length > SUGGESTIONS_PER_PAGE ? (
                        <div className="flex items-center gap-2 text-[11px] text-gray-600">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-xs"
                            disabled={currentSuggestionsPage === 0}
                            onClick={() => setSuggestionsPage((p) => Math.max(0, p - 1))}
                          >
                            Previous
                          </Button>
                          <span>
                            Page {currentSuggestionsPage + 1} of {totalSuggestionPages}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-xs"
                            disabled={currentSuggestionsPage >= totalSuggestionPages - 1}
                            onClick={() =>
                              setSuggestionsPage((p) => Math.min(totalSuggestionPages - 1, p + 1))
                            }
                          >
                            Next
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700" htmlFor="process">
                  Process Description *
                </label>
                <div className="relative">
                  <Textarea
                    id="process"
                    placeholder="Describe the workflow you want to automate. Include what triggers it, what steps are involved, what systems you use, and what the end result should be..."
                    value={processDescription}
                    onChange={(event) => {
                      setProcessDescription(event.target.value);
                      setShowUndo(false);
                      setShowExpandOptions(false);
                    }}
                    rows={8}
                    required
                    className="resize-none bg-white pb-12"
                  />
                  {processDescription.trim() && (
                    <div className="absolute bottom-3 right-3 flex items-center gap-2">
                      {showUndo ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setProcessDescription(originalDescription);
                            setShowUndo(false);
                            setShowExpandOptions(false);
                          }}
                          className="h-8 text-xs bg-white hover:bg-gray-50"
                        >
                          <Undo2 className="h-3.5 w-3.5 mr-1" />
                          Undo
                        </Button>
                      ) : (
                        <div className="relative">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setShowExpandOptions((prev) => !prev)}
                            disabled={isExpanding}
                            className="h-8 text-xs bg-white hover:bg-gray-50"
                          >
                            {isExpanding ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                                Expanding...
                              </>
                            ) : (
                              <>
                                <SparklesIcon className="h-3.5 w-3.5 mr-1 text-[#E43632]" />
                                AI Expand It
                              </>
                            )}
                          </Button>

                          {showExpandOptions ? (
                            <div className="absolute bottom-11 right-0 w-72 rounded-lg border border-gray-200 bg-white shadow-lg">
                              <div className="p-2 space-y-1">
                                {EXPANSION_OPTIONS.map((option) => (
                                  <button
                                    key={option.id}
                                    type="button"
                                    disabled={isExpanding}
                                    onClick={() => handleAIExpand(option.id)}
                                    className="w-full rounded-md px-3 py-2 text-left hover:bg-gray-100 focus:outline-none disabled:opacity-60"
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="text-sm font-medium text-gray-900">{option.title}</span>
                                      <span className="text-[11px] uppercase text-gray-500">{option.id}</span>
                                    </div>
                                    <p className="text-xs text-gray-600 mt-1">{option.description}</p>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-500">
                  Be as detailed as possible. Include systems, tools, people involved, and desired outcomes.
                </p>
              </div>

              <div className="flex gap-3">
                <Button type="submit" className="flex-1 bg-[#E43632] hover:bg-[#C12E2A] text-white" disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Automation"
                  )}
                </Button>
              </div>
            </form>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
