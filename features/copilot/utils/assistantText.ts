const WORKFLOW_BLOCK_REGEX = /```json workflow_updates[\s\S]*?```/gi;

export function stripWorkflowBlocks(content: string): string {
  if (!content) {
    return content;
  }
  return content
    .replace(WORKFLOW_BLOCK_REGEX, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
