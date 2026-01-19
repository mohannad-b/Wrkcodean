import { sendCopilotIngest } from "@/features/copilot/services/ingest";

export const sendAgentLog = (payload: Record<string, unknown>) => {
  sendCopilotIngest(payload);
};

export const fetchVendorCssSnapshot = async (href: string) => {
  const response = await fetch(href);
  const contentType = response.headers.get("content-type");
  const text = await response.text();
  return { response, contentType, text };
};
