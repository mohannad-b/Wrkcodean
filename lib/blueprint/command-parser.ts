import type { Blueprint } from "./types";

export type CommandType =
  | "move_step"
  | "delete_step"
  | "rename_step"
  | "connect_steps"
  | "disconnect_steps"
  | "add_step_after"
  | "add_step_before"
  | "swap_steps"
  | "unknown";

export interface ParsedCommand {
  type: CommandType;
  params: Record<string, string>;
  confidence: number; // 0-1
}

const COMMAND_PATTERNS: Array<{
  pattern: RegExp;
  type: CommandType;
  extract: (match: RegExpMatchArray) => Record<string, string>;
}> = [
  {
    pattern: /move\s+step\s+(\d+[A-Za-z]?)\s+(?:to\s+)?(after|before)\s+(?:step\s+)?(\d+[A-Za-z]?)/i,
    type: "move_step",
    extract: (match) => ({
      sourceStep: match[1],
      targetStep: match[3],
      position: match[2].toLowerCase(),
    }),
  },
  {
    pattern: /(?:delete|remove)\s+step\s+(\d+[A-Za-z]?)/i,
    type: "delete_step",
    extract: (match) => ({ stepNumber: match[1] }),
  },
  {
    pattern: /rename\s+step\s+(\d+[A-Za-z]?)\s+to\s+["']?(.+?)["']?$/i,
    type: "rename_step",
    extract: (match) => ({ stepNumber: match[1], newName: match[2].trim() }),
  },
  {
    pattern: /connect\s+(?:step\s+)?(\d+[A-Za-z]?)\s+to\s+(?:step\s+)?(\d+[A-Za-z]?)/i,
    type: "connect_steps",
    extract: (match) => ({ fromStep: match[1], toStep: match[2] }),
  },
  {
    pattern: /disconnect\s+(?:step\s+)?(\d+[A-Za-z]?)\s+from\s+(?:step\s+)?(\d+[A-Za-z]?)/i,
    type: "disconnect_steps",
    extract: (match) => ({ fromStep: match[1], toStep: match[2] }),
  },
  {
    pattern: /add\s+(?:a\s+)?(?:new\s+)?step\s+(?:after|following)\s+(?:step\s+)?(\d+[A-Za-z]?)/i,
    type: "add_step_after",
    extract: (match) => ({ afterStep: match[1] }),
  },
  {
    pattern: /add\s+(?:a\s+)?(?:new\s+)?step\s+before\s+(?:step\s+)?(\d+[A-Za-z]?)/i,
    type: "add_step_before",
    extract: (match) => ({ beforeStep: match[1] }),
  },
  {
    pattern: /swap\s+(?:step\s+)?(\d+[A-Za-z]?)\s+(?:and|with)\s+(?:step\s+)?(\d+[A-Za-z]?)/i,
    type: "swap_steps",
    extract: (match) => ({ stepA: match[1], stepB: match[2] }),
  },
];

export function parseCommand(input: string): ParsedCommand {
  const trimmed = input.trim();

  for (const { pattern, type, extract } of COMMAND_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      return {
        type,
        params: extract(match),
        confidence: 0.9,
      };
    }
  }

  return {
    type: "unknown",
    params: {},
    confidence: 0,
  };
}

export function isDirectCommand(input: string): boolean {
  const command = parseCommand(input);
  return command.type !== "unknown" && command.confidence > 0.7;
}

