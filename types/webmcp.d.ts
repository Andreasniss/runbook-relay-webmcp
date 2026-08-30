type WebMcpSchema = Record<string, unknown>;

type WebMcpTool = {
  name: string;
  description: string;
  inputSchema: WebMcpSchema;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
  execute: (input: unknown) => Promise<unknown> | unknown;
};

interface Document {
  modelContext?: {
    registerTool(tool: WebMcpTool, options?: { signal?: AbortSignal }): Promise<void>;
  };
}
