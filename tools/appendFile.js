import fs from "fs/promises";
import path from "path";

export async function appendFile(filepath, content) {
  await fs.mkdir(path.dirname(filepath), { recursive: true });
  await fs.appendFile(filepath, content, "utf-8");
  const stat = await fs.stat(filepath);
  return `Appended to ${filepath} — total size: ${stat.size} bytes`;
}
