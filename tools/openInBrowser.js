import { exec } from "child_process";
import path from "path";

export function openInBrowser(filepath) {
  const abs = path.resolve(filepath);
  const cmd =
    process.platform === "darwin"
      ? `open "${abs}"`
      : process.platform === "win32"
      ? `start "" "${abs}"`
      : `xdg-open "${abs}"`;

  return new Promise((resolve) => {
    exec(cmd, () => resolve(`Opened in browser: ${abs}`));
  });
}
