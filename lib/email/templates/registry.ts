import { z } from "zod";
import { type TemplateMetadata } from "@/lib/email/types";

const inviteSchema = z.object({
  firstName: z.string(),
  inviteLink: z.string().url(),
  workspaceName: z.string(),
});

export const templateRegistry: Record<string, TemplateMetadata<z.ZodTypeAny>> = {
  "transactional.workspace-invite": {
    templateId: "transactional.workspace-invite",
    category: "transactional",
    subject: "You’ve been invited to {{workspaceName}}",
    sender: "support",
    requiredVariables: inviteSchema,
    sampleVariables: {
      firstName: "Alex",
      inviteLink: "https://app.example.com/invite/abc123",
      workspaceName: "Acme Ops",
    },
    description: "Workspace invite email with magic link.",
    filePath: `${process.cwd()}/lib/email/templates/transactional/workspace-invite.html`,
  },
};

export function getTemplate(templateId: string) {
  const template = templateRegistry[templateId];
  if (!template) {
    throw new Error(`Unknown email template: ${templateId}`);
  }
  return template;
}

