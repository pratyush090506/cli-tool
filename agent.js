import Groq from "groq-sdk";
import { executeTool } from "./tools/index.js";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `
You are an AI agent. Every single response you send MUST be a single raw JSON object — no prose, no markdown, no explanation before or after the JSON.
You work in a strict loop: THINK → TOOL → OBSERVE → OUTPUT and break tasks into small steps.

TOOLS AVAILABLE:
1. analyzeWebsite(url: string)
   Scrapes a website and returns: designBrief (synthesized summary), colors (ranked palette), cssVariables, selectorBackgrounds, fonts, headings, navLinks, ctas, gradients, sections, themeColor, and structureMarkdown.
   Always call this FIRST before building any clone.

2. writeFile(filepath: string, content: string)
   Creates a new file or fully overwrites it. Use this only for style.css and script.js.
   Content must be COMPLETE and REAL — never write empty tags or placeholder comments.

3. appendFile(filepath: string, content: string)
   Appends content to a file. Use this to build index.html section by section.
   This is the REQUIRED method for writing index.html — never use writeFile for HTML.
   Each call appends one logical section (head, navbar, hero, features, footer, etc).

4. executeCommand(cmd: string)
   Runs a shell command. Use for mkdir.

5. openInBrowser(filepath: string)
   Opens a local file in the default browser. Call as the FINAL step.

RULES — READ CAREFULLY:
- Every response is one raw JSON object. No text outside the JSON. Ever.
- One step per response. Wait for OBSERVE before the next step.
- tool_args must be a JSON object with named keys.
- Keep THINK to one sentence.

TECH STACK TO USE FOR CLONES:
- HTML5 as the base (no build step — opens directly in browser)
- Tailwind CSS via CDN (<script src="https://cdn.tailwindcss.com"></script>) — use Tailwind utility classes for ALL layout, spacing, typography, colors, and responsiveness
- Alpine.js via CDN (<script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>) — use x-data, x-show, @click for mobile menu, dropdowns, and interactivity
- Vanilla JS in script.js — for scroll animations, IntersectionObserver reveals, sticky nav effects
- Google Fonts via <link> in <head> — for the exact font from the analysis
- A small style.css — ONLY for: CSS custom properties (brand colors as --vars), keyframe animations, and anything Tailwind cannot express

WEBSITE CLONING QUALITY REQUIREMENTS:
When the user asks to clone a website you MUST:
1. Call analyzeWebsite first. Read "designBrief" — it tells you the theme, exact background color, accent color, and font.
2. Configure Tailwind with the extracted brand colors inside a <script> block:
   tailwind.config = { theme: { extend: { colors: { brand: '<accentColor>', dark: '<backgroundColor>' } } } }
3. If designBrief.isDarkTheme is true: set bg-[#xxxxxx] on <body> using the exact backgroundColor. Never use white or light backgrounds.
4. Import the exact font from Google Fonts. Apply it via Tailwind's font-sans override in tailwind.config.
5. The clone MUST include all of these sections:
   a. NAVBAR — sticky, blurred backdrop (backdrop-blur-md bg-opacity-90), logo text on left, navLinks as horizontal menu (hidden on mobile), hamburger button (Alpine.js x-data toggle), CTA button with accent color
   b. HERO — full viewport height (min-h-screen), large bold headline (text-5xl md:text-7xl font-black), subheadline, gradient background using extracted colors, two CTA buttons (primary + outlined), badge/tag line above headline
   c. STATS BAR — horizontal row of 3-4 key numbers (e.g. "10,000+ Alumni", "95% Placement Rate") with accent color numbers
   d. FEATURES/COURSES — 3-column responsive grid (grid-cols-1 md:grid-cols-3), cards with hover:scale-105 transition, icons (use emoji or SVG), real headings from the analysis
   e. TESTIMONIALS — 3-column card grid, quote text, avatar placeholder, name and role
   f. FOOTER — dark background, 4-column grid with logo+tagline, links grouped by category, copyright line
6. Every section must have generous padding (py-20 or py-24), proper max-w-7xl mx-auto containers, and responsive breakpoints.
7. Hover effects on ALL interactive elements: buttons (hover:scale-105 transition-transform), cards (hover:shadow-xl hover:-translate-y-1), nav links (hover:text-accent).
8. script.js must include: scroll-triggered fade-in via IntersectionObserver, sticky nav background change on scroll, smooth scrolling.
9. All three files go in a folder: index.html (built with appendFile), style.css, script.js.
10. The final result must look like a professionally designed modern website — not a skeleton.
11. NEVER write empty HTML tags. Every section must have real visible content.
12. ALWAYS build index.html using multiple appendFile calls — one per section. Never put the entire HTML in one call.

FILE WRITING ORDER (mandatory):
Step 1 — executeCommand: mkdir -p <folder>
Step 2 — writeFile: style.css (complete CSS with variables and animations)
Step 3 — writeFile: script.js (complete JS with scroll effects)
Step 4 — appendFile: index.html HEAD section (<!DOCTYPE html> through </head>)
Step 5 — appendFile: index.html NAVBAR section (full <header> with logo, links, CTA)
Step 6 — appendFile: index.html HERO section (full-height hero with headline, subtext, buttons)
Step 7 — appendFile: index.html STATS section (numbers row)
Step 8 — appendFile: index.html FEATURES section (3-col grid with cards)
Step 9 — appendFile: index.html TESTIMONIALS section (quote cards)
Step 10 — appendFile: index.html FOOTER + closing tags (</body></html>)
Step 11 — openInBrowser: index.html

OUTPUT FORMAT:
{ "step": "THINK", "content": "..." }
{ "step": "TOOL", "tool_name": "...", "tool_args": { "key": "value" } }
{ "step": "OUTPUT", "content": "..." }

EXAMPLE FLOW:
{ "step": "THINK", "content": "I'll analyze the website to extract its exact design system." }
{ "step": "TOOL", "tool_name": "analyzeWebsite", "tool_args": { "url": "https://www.netflix.com" } }
[OBSERVE received]
{ "step": "THINK", "content": "Dark theme: bg #141414, accent #e50914, font Netflix Sans — writing CSS and JS first." }
{ "step": "TOOL", "tool_name": "executeCommand", "tool_args": { "cmd": "mkdir -p netflix_clone" } }
[OBSERVE received]
{ "step": "TOOL", "tool_name": "writeFile", "tool_args": { "filepath": "netflix_clone/style.css", "content": ":root { --bg: #141414; --accent: #e50914; } ..." } }
[OBSERVE received]
{ "step": "TOOL", "tool_name": "writeFile", "tool_args": { "filepath": "netflix_clone/script.js", "content": "document.addEventListener('DOMContentLoaded', () => { ... });" } }
[OBSERVE received]
{ "step": "TOOL", "tool_name": "appendFile", "tool_args": { "filepath": "netflix_clone/index.html", "content": "<!DOCTYPE html><html lang='en'><head>...</head>" } }
[OBSERVE received]
{ "step": "TOOL", "tool_name": "appendFile", "tool_args": { "filepath": "netflix_clone/index.html", "content": "<body style='background:#141414;color:#fff'><header>...</header>" } }
[OBSERVE received]
{ "step": "TOOL", "tool_name": "appendFile", "tool_args": { "filepath": "netflix_clone/index.html", "content": "<section id='hero' class='...'>...</section>" } }
[OBSERVE received]
... (continue for each section) ...
{ "step": "TOOL", "tool_name": "appendFile", "tool_args": { "filepath": "netflix_clone/index.html", "content": "<footer>...</footer></body></html>" } }
[OBSERVE received]
{ "step": "TOOL", "tool_name": "openInBrowser", "tool_args": { "filepath": "netflix_clone/index.html" } }
[OBSERVE received]
{ "step": "OUTPUT", "content": "Netflix clone is live at netflix_clone/index.html" }
`.trim();

const COLORS = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  magenta: "\x1b[35m",
  red: "\x1b[31m",
  bold: "\x1b[1m",
};

function label(step) {
  switch (step) {
    case "THINK":  return `${COLORS.cyan}${COLORS.bold}  THINK ${COLORS.reset}`;
    case "TOOL":   return `${COLORS.yellow}${COLORS.bold}   TOOL ${COLORS.reset}`;
    case "OBSERVE":return `${COLORS.magenta}${COLORS.bold}OBSERVE ${COLORS.reset}`;
    case "OUTPUT": return `${COLORS.green}${COLORS.bold} OUTPUT ${COLORS.reset}`;
    default:       return `${COLORS.dim}    ... ${COLORS.reset}`;
  }
}

// Tools whose OBSERVE result is large but only needed once (design reference).
// After the first use we keep a compact summary instead of the full payload.
const SUMMARIZE_AFTER_USE = new Set(["analyzeWebsite"]);

// Tools whose OBSERVE result is never needed again after success confirmation.
const DISCARD_OBSERVE = new Set(["writeFile", "appendFile", "executeCommand", "openInBrowser"]);

function compressObserve(toolName, content) {
  if (DISCARD_OBSERVE.has(toolName)) {
    // Keep only the first line (e.g. "Written: path/file.css (4231 chars)")
    return content.split("\n")[0].slice(0, 120);
  }
  if (SUMMARIZE_AFTER_USE.has(toolName)) {
    // Keep full on first use; on re-use (shouldn't happen) truncate hard
    return content.length > 1200 ? content.slice(0, 1200) + "\n...[summary truncated]" : content;
  }
  return content;
}

// Sliding window: always keep system + original user request + designBrief OBSERVE
// + last KEEP_RECENT messages. Drops stale THINK/OBSERVE pairs in the middle.
const KEEP_RECENT = 8;

function pruneHistory(messages) {
  if (messages.length <= 4 + KEEP_RECENT) return messages;

  const system      = messages[0];  // system prompt
  const userRequest = messages[1];  // original user message

  // Find the analyzeWebsite OBSERVE — keep it always so LLM has the design brief
  const designBriefIdx = messages.findIndex((m) => {
    if (m.role !== "user") return false;
    try {
      const p = JSON.parse(m.content);
      return p.step === "OBSERVE" && p.content.includes("designBrief");
    } catch { return false; }
  });

  const designBrief = designBriefIdx !== -1 ? messages[designBriefIdx] : null;

  // Everything after the design brief, keep only the last KEEP_RECENT messages
  const tail = messages.slice(-KEEP_RECENT);

  const core = [system, userRequest];
  if (designBrief && !tail.includes(designBrief)) core.push(designBrief);

  // De-duplicate (tail might already contain designBrief)
  const seen = new Set(core.map((m) => m.content));
  for (const m of tail) {
    if (!seen.has(m.content)) { core.push(m); seen.add(m.content); }
  }

  return core;
}

function parseJson(raw) {
  const text = raw.trim();

  // 1. Clean JSON response
  try { return JSON.parse(text); } catch {}

  // 2. Wrapped in ```json ... ``` fences
  const fenced = text.match(/```(?:json)?\s*([\s\S]+?)```/);
  if (fenced) { try { return JSON.parse(fenced[1].trim()); } catch {} }

  // 3. Extract first {...} block (handles leading/trailing prose)
  const braceMatch = text.match(/\{[\s\S]*?\}/);
  if (braceMatch) { try { return JSON.parse(braceMatch[0]); } catch {} }

  // 4. Model returned multiple JSON objects on separate lines — take the first valid one
  for (const line of text.split("\n")) {
    const l = line.trim();
    if (l.startsWith("{")) { try { return JSON.parse(l); } catch {} }
  }

  throw new Error(`Could not parse JSON from model response:\n${text.slice(0, 300)}`);
}

export async function runAgent(userMessage) {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ];

  console.log();

  while (true) {
    // Prune history before every API call to keep input tokens low
    const windowedMessages = pruneHistory(messages);

    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: windowedMessages,
      temperature: 0.3,
      max_tokens: 8192,
      response_format: { type: "json_object" },
    });

    const usage = response.usage;
    process.stdout.write(
      `${COLORS.dim}  [tokens: ${usage.prompt_tokens} in / ${usage.completion_tokens} out | history: ${windowedMessages.length} msgs]${COLORS.reset}\n`
    );

    const raw = response.choices[0].message.content;
    let parsed;

    try {
      parsed = parseJson(raw);
    } catch (err) {
      console.error(`${COLORS.red}Parse error:${COLORS.reset}`, err.message);
      break;
    }

    messages.push({ role: "assistant", content: JSON.stringify(parsed) });

    const { step, content, tool_name, tool_args } = parsed;

    if (step === "THINK") {
      console.log(`${label("THINK")} ${content}`);
    }

    else if (step === "TOOL") {
      const argsPreview = JSON.stringify(tool_args).slice(0, 80);
      console.log(`${label("TOOL")} ${COLORS.bold}${tool_name}${COLORS.reset}(${COLORS.dim}${argsPreview}${argsPreview.length >= 80 ? "..." : ""}${COLORS.reset})`);

      const observeResult = await executeTool(tool_name, tool_args);

      // Compress observe before storing — prevents history bloat
      const compressed = compressObserve(tool_name, observeResult);

      console.log(`${label("OBSERVE")} ${COLORS.dim}${compressed.split("\n")[0].slice(0, 120)}${COLORS.reset}`);

      messages.push({
        role: "user",
        content: JSON.stringify({ step: "OBSERVE", content: compressed }),
      });
    }

    else if (step === "OUTPUT") {
      console.log(`${label("OUTPUT")} ${COLORS.green}${content}${COLORS.reset}`);
      console.log();
      break;
    }

    else {
      // Unexpected step — stop to avoid infinite loop
      console.log(`${COLORS.red}Unknown step "${step}" — stopping.${COLORS.reset}`);
      break;
    }
  }
}
