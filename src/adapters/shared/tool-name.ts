/** Sanitizes a tool name to the character set/length most AI-framework tool-name validators accept. */
export function safeToolName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
}
