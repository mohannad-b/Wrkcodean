import type { BlueprintUpdates } from "@/lib/blueprint/ai-updates";

export type ParsedCopilotReply = {
  displayText: string;
  blueprintUpdates: BlueprintUpdates | null;
};

type ExtractedJsonBlock = {
  start: number;
  end: number;
  body: string;
  hasBlueprintLabel: boolean;
};

const MULTIPLE_NEWLINES_REGEX = /\n{3,}/g;
const FENCE_TOKEN = "```json";
const BLUEPRINT_LABEL = "blueprint_updates";
const BLUEPRINT_LABEL_REGEX = new RegExp(`^${BLUEPRINT_LABEL}[\\s:]*`, "i");
const DEFAULT_DISPLAY_TEXT = "Updated the blueprint—let me know if you want refinements.";

export function parseCopilotReply(raw: string): ParsedCopilotReply {
  const normalizedInput = (raw ?? "").replace(/\r\n/g, "\n");
  const blocks = extractJsonBlocks(normalizedInput);
  const blueprintUpdates = selectBlueprintUpdates(normalizedInput, blocks);
  const displayText = buildDisplayText(normalizedInput, blocks) || DEFAULT_DISPLAY_TEXT;

  return {
    displayText,
    blueprintUpdates,
  };
}

function extractJsonBlocks(input: string): ExtractedJsonBlock[] {
  const results: ExtractedJsonBlock[] = [];
  let cursor = 0;

  while (cursor < input.length) {
    const openIndex = input.indexOf(FENCE_TOKEN, cursor);
    if (openIndex === -1) {
      break;
    }

    const fenceStart = openIndex;
    const bodyStart = openIndex + FENCE_TOKEN.length;
    const closeIndex = input.indexOf("```", bodyStart);

    let fenceEnd = input.length;
    let innerContent: string;
    if (closeIndex === -1) {
      innerContent = input.slice(bodyStart);
    } else {
      innerContent = input.slice(bodyStart, closeIndex);
      fenceEnd = closeIndex + 3;
    }

    const stripped = stripBlueprintLabel(innerContent);

    results.push({
      start: fenceStart,
      end: fenceEnd,
      body: stripped.body.trim(),
      hasBlueprintLabel: stripped.hasBlueprintLabel,
    });

    cursor = fenceEnd;
  }

  return results;
}

function stripBlueprintLabel(segment: string): { body: string; hasBlueprintLabel: boolean } {
  const trimmedLeading = segment.replace(/^\s+/, "");
  if (BLUEPRINT_LABEL_REGEX.test(trimmedLeading)) {
    const body = trimmedLeading.replace(BLUEPRINT_LABEL_REGEX, "").replace(/^\s+/, "");
    return { body, hasBlueprintLabel: true };
  }
  return { body: trimmedLeading, hasBlueprintLabel: false };
}

function selectBlueprintUpdates(input: string, blocks: ExtractedJsonBlock[]): BlueprintUpdates | null {
  let parsedUpdates: BlueprintUpdates | null = null;

  for (const block of blocks) {
    if (!block.body) {
      continue;
    }

    const parsed = safeParseJson(block.body);
    if (!parsed) {
      continue;
    }

    if (block.hasBlueprintLabel) {
      parsedUpdates = parsed;
    } else if (
      !parsedUpdates &&
      blocks.length === 1 &&
      isTrailingBlock(input, block)
    ) {
      parsedUpdates = parsed;
    }
  }

  return parsedUpdates;
}

function safeParseJson(body: string): BlueprintUpdates | null {
  try {
    return JSON.parse(body) as BlueprintUpdates;
  } catch {
    return null;
  }
}

function isTrailingBlock(input: string, block: ExtractedJsonBlock): boolean {
  const remainder = input.slice(block.end).trim();
  return remainder.length === 0;
}

function buildDisplayText(input: string, blocks: ExtractedJsonBlock[]): string {
  if (blocks.length === 0) {
    return collapseText(input);
  }

  let cursor = 0;
  let result = "";
  for (const block of blocks) {
    result += input.slice(cursor, block.start);
    cursor = block.end;
  }
  result += input.slice(cursor);

  return collapseText(result);
}

function collapseText(value: string): string {
  if (!value) {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  return trimmed.replace(MULTIPLE_NEWLINES_REGEX, "\n\n").trim();
}

