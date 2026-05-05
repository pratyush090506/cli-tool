import { exec } from "child_process";

export function executeCommand(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: 15000 }, (err, stdout, stderr) => {
      if (err) {
        resolve(`Error: ${stderr || err.message}`);
      } else {
        resolve(stdout.trim() || `Command succeeded: ${cmd}`);
      }
    });
  });
}
