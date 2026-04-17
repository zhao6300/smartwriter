import { webSearchTool } from './web_search';

export interface AgentTool {
  name: string;
  schema: any; // OpenAI function definition
  execute: (args: any) => Promise<string>;
}

// Global registry for Built-in tools
export const BUILTIN_TOOLS: Record<string, AgentTool> = {
  'web_search': webSearchTool
};

// Factory to get tool execution capabilities for an array of requested tool IDs or names.
// Right now this maps BUILTIN tools. If MCP is used, we'd dynamically construct AgentTools based on their config.
export const getActiveTools = (selectedToolKeys: any): AgentTool[] => {
  if (!selectedToolKeys) return [];
  const keys = Array.isArray(selectedToolKeys) ? selectedToolKeys : [selectedToolKeys];
  const tools: AgentTool[] = [];
  for (const key of keys) {
    if (typeof key === 'string' && BUILTIN_TOOLS[key]) {
      tools.push(BUILTIN_TOOLS[key]);
    }
  }
  return tools;
};
