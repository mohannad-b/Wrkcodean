"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, Loader2, Sparkles, Map, Zap, Sparkles as SparklesIcon, Undo2, ShoppingCart, Package, Mail, Calendar, FileText, CreditCard, Home, Building, Wrench, Users, Briefcase, Plane, GraduationCap, Code, Hammer } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type AutomationType = "starter" | "intermediate" | "advanced";

const AUTOMATION_TYPES: Array<{
  id: AutomationType;
  title: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    id: "starter",
    title: "Starter",
    description: "AI, recommend my whole process",
    icon: <Sparkles className="h-6 w-6" />,
  },
  {
    id: "intermediate",
    title: "Intermediate",
    description: "AI, I'll tell you my process I want you to map it out in more detail",
    icon: <Map className="h-6 w-6" />,
  },
  {
    id: "advanced",
    title: "Advanced",
    description: "AI, I know my steps inside out, I want you to optimize my workflow",
    icon: <Zap className="h-6 w-6" />,
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
};

export default function NewAutomationPage() {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState<"type" | "details">("type");
  const [selectedType, setSelectedType] = useState<AutomationType | null>(null);
  const [processDescription, setProcessDescription] = useState("");
  const [selectedIndustry, setSelectedIndustry] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExpanding, setIsExpanding] = useState(false);
  const [originalDescription, setOriginalDescription] = useState<string>("");
  const [showUndo, setShowUndo] = useState(false);

  const handleTypeSelect = (type: AutomationType) => {
    setSelectedType(type);
    setStep("details");
  };

  const handleAIExpand = async () => {
    if (!processDescription.trim()) {
      return;
    }

    setIsExpanding(true);
    setOriginalDescription(processDescription);
    setError(null);

    try {
      const response = await fetch("/api/ai/expand-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: processDescription.trim(),
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
    
    if (!selectedType) {
      setError("Please select an automation type");
      return;
    }
    
    if (!processDescription.trim()) {
      setError("Please describe your process");
      return;
    }

    if (!selectedIndustry) {
      setError("Please select an industry");
      return;
    }

    setSubmitting(true);
    setError(null);
    
    try {
      const response = await fetch("/api/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          automationType: selectedType,
          processDescription: processDescription.trim(),
          industry: selectedIndustry,
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

  if (step === "type") {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50 px-4 py-10">
        <Card className="w-full max-w-4xl">
          <CardHeader>
            <CardTitle className="text-2xl">Create New Automation</CardTitle>
            <CardDescription>
              Choose how you'd like to get started. We'll help you build the perfect workflow.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {AUTOMATION_TYPES.map((type) => (
                <button
                  key={type.id}
                  onClick={() => handleTypeSelect(type.id)}
                  className="group relative p-6 border-2 border-gray-200 rounded-xl hover:border-[#E43632] hover:bg-[#E43632]/5 transition-all text-left"
                >
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-gray-50 group-hover:bg-[#E43632]/10 transition-colors">
                      <div className="text-[#E43632]">{type.icon}</div>
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-lg text-gray-900 mb-2">{type.title}</h3>
                      <p className="text-sm text-gray-600">{type.description}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-4xl">
        <Card className="w-full">
          <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Describe Your Process</CardTitle>
              <CardDescription>
                Provide as many details as possible. The more information you share, the better we can help.
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStep("type")}
              className="text-gray-500"
            >
              Back
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error ? (
              <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <AlertCircle className="h-4 w-4" />
                <span>{error}</span>
              </div>
            ) : null}

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700" htmlFor="industry">
                Industry *
              </label>
              <Select value={selectedIndustry} onValueChange={setSelectedIndustry} required>
                <SelectTrigger id="industry" className="bg-white">
                  <SelectValue placeholder="Select your industry" />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  {INDUSTRIES.map((industry) => (
                    <SelectItem 
                      key={industry} 
                      value={industry}
                      className="hover:bg-gray-100 focus:bg-gray-100 data-[highlighted]:bg-gray-100"
                    >
                      {industry}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedIndustry && COMMON_USE_CASES[selectedIndustry] && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Most common use cases</label>
                <div className="grid grid-cols-2 gap-3">
                  {COMMON_USE_CASES[selectedIndustry].map((useCase, index) => (
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
                <p className="text-xs text-gray-500">
                  Click any use case above to auto-fill the form, or describe your own process below.
                </p>
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
                        }}
                        className="h-8 text-xs bg-white hover:bg-gray-50"
                      >
                        <Undo2 className="h-3.5 w-3.5 mr-1" />
                        Undo
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAIExpand}
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
                    )}
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-500">
                Be as detailed as possible. Include systems, tools, people involved, and desired outcomes.
              </p>
            </div>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep("type")}
                className="flex-1"
                disabled={submitting}
              >
                Back
              </Button>
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
