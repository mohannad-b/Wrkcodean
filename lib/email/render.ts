import fs from "fs";
import { getTemplate } from "@/lib/email/templates/registry";
import type { RenderedEmail } from "@/lib/email/types";
import { z } from "zod";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function interpolate(template: string, variables: Record<string, string>) {
  return template.replace(/{{\s*([\w.]+)\s*}}/g, (_, key) => {
    const value = variables[key];
    if (value === undefined) return "";
    return escapeHtml(String(value));
  });
}

function htmlToText(html: string) {
  return (
    html
      .replace(/<\/(p|div)>/g, "\n\n")
      .replace(/<br\s*\/?>/g, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim() || ""
  );
}

export function renderTemplate<Schema extends z.ZodTypeAny>(
  templateId: string,
  variables: z.input<Schema>
): RenderedEmail {
  const metadata = getTemplate(templateId);
  const parsed = metadata.requiredVariables.safeParse(variables);
  if (!parsed.success) {
    throw new Error(`Invalid variables for ${templateId}: ${parsed.error.message}`);
  }

  const vars = parsed.data as Record<string, string>;
  const rawHtml = fs.readFileSync(metadata.filePath, "utf8");

  const html = interpolate(rawHtml, vars);
  const subject = interpolate(metadata.subject, vars);
  const text = htmlToText(html);

  return { html, subject, text };
}

