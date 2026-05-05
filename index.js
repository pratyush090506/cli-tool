import "dotenv/config";
import readline from "readline";
import { runAgent } from "./agent.js";

const RESET  = "\x1b[0m";
const BOLD   = "\x1b[1m";
const CYAN   = "\x1b[36m";
const GREEN  = "\x1b[32m";
const DIM    = "\x1b[2m";
const YELLOW = "\x1b[33m";

function printBanner() {
  console.log();
  console.log(`${CYAN}${BOLD}┌─────────────────────────────────────────┐${RESET}`);
  console.log(`${CYAN}${BOLD}│        Scaler Clone Agent  v1.0         │${RESET}`);
  console.log(`${CYAN}${BOLD}│   Powered by Groq · Llama-3.3-70B       │${RESET}`);
  console.log(`${CYAN}${BOLD}└─────────────────────────────────────────┘${RESET}`);
  console.log();
  console.log(`${DIM}Commands:  Type your instruction below${RESET}`);
  console.log(`${DIM}Example:   Clone the Scaler website${RESET}`);
  console.log(`${DIM}Exit:      Type "exit" or press Ctrl+C${RESET}`);
  console.log();
}

function validateEnv() {
  if (!process.env.GROQ_API_KEY) {
    console.error(`${YELLOW}[!] GROQ_API_KEY is not set.${RESET}`);
    console.error(`    Create a .env file with GROQ_API_KEY=<your_key>`);
    console.error(`    Get a free key at https://console.groq.com`);
    process.exit(1);
  }
}

async function main() {
  validateEnv();
  printBanner();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${GREEN}${BOLD}you › ${RESET}`,
  });

  rl.prompt();

  rl.on("line", async (line) => {
    const input = line.trim();

    if (!input) {
      rl.prompt();
      return;
    }

    if (input.toLowerCase() === "exit" || input.toLowerCase() === "quit") {
      console.log(`\n${DIM}Goodbye.${RESET}\n`);
      rl.close();
      process.exit(0);
    }

    rl.pause();

    try {
      await runAgent(input);
    } catch (err) {
      console.error(`\n${YELLOW}Agent error: ${err.message}${RESET}\n`);
    }

    rl.resume();
    rl.prompt();
  });

  rl.on("close", () => {
    process.exit(0);
  });
}

main();
