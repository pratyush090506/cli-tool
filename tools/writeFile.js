import fs from "fs/promises";
import path from "path";

export async function writeFile(filepath, content) {
  const dir = path.dirname(filepath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filepath, content, "utf-8");
  return `Written: ${filepath} (${content.length} chars)`;
}
