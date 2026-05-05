import { analyzeWebsite } from "./analyzeWebsite.js";
import { writeFile } from "./writeFile.js";
import { appendFile } from "./appendFile.js";
import { executeCommand } from "./executeCommand.js";
import { openInBrowser } from "./openInBrowser.js";

export const toolMap = {
  analyzeWebsite,
  writeFile,
  appendFile,
  executeCommand,
  openInBrowser,
};

export async function executeTool(name, args) {
  const tool = toolMap[name];
  if (!tool) return `Tool "${name}" not found. Available: ${Object.keys(toolMap).join(", ")}`;

  try {
    const result = await tool(...(Array.isArray(args) ? args : Object.values(args)));
    return typeof result === "string" ? result : JSON.stringify(result, null, 2);
  } catch (err) {
    return `Tool error (${name}): ${err.message}`;
  }
}
