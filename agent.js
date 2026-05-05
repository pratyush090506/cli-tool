import Groq from "groq-sdk";
import { executeTool } from "./tools/index.js";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Compact system prompt — every token here is paid on every API call
const SYSTEM_PROMPT = `
You are an AI agent. One JSON object per response. No text outside JSON.

FORMAT:
{ "think": "<one sentence>", "step": "TOOL", "tool_name": "<name>", "tool_args": { ... } }
{ "think": "<one sentence>", "step": "OUTPUT", "content": "<message>" }

TOOLS:
- analyzeWebsite(url) → returns designBrief (theme, bg, accent, font), colors, navLinks, headings, ctas
- executeCommand(cmd) → shell (mkdir)
- writeFile(filepath, content) → write complete file to disk. Write each file exactly ONCE.
- openInBrowser(filepath) → open in browser. Call LAST.

STRICT CONTENT RULE: NEVER write placeholder text like "Link 1", "Link 2", "Primary CTA", "CTA Button", "Heading here", "Lorem ipsum". Always use the EXACT strings from the analyzeWebsite OBSERVE: navLinks array for nav items, headings[0] for h1, ctas array for button labels. If a field is empty, use the site's domain name as fallback.

TASK — clone a website landing page with exactly 3 sections:
Step 1: analyzeWebsite(url)
Step 2: executeCommand → mkdir -p <site>_clone
Step 3: writeFile → <site>_clone/style.css  (CSS variables from analysis + minimal custom styles)
Step 4: writeFile → <site>_clone/index.html (complete single-file page — see requirements below)
Step 5: openInBrowser → <site>_clone/index.html
Step 6: OUTPUT

index.html MUST contain all of the following — no placeholders, real content only:
- <head>: Tailwind CDN, Alpine.js CDN, Google Font matching analysis, tailwind.config extending brand colors
- <body>: inline style="background-color:<designBrief.backgroundColor>; color:<designBrief.textColor>; font-family:<designBrief.primaryFont>,sans-serif; margin:0"

NAVBAR — exact structure required, no exceptions:
<header class="sticky top-0 z-50 w-full" style="background-color:<navbarBg>; border-bottom:1px solid rgba(255,255,255,0.1)">
  <div class="max-w-7xl mx-auto px-6 flex items-center justify-between h-16">
    <div class="text-xl font-bold">SiteName</div>
    <nav class="hidden md:flex items-center gap-8">  ← HORIZONTAL: flex + gap, never column
      <a class="text-sm hover:opacity-70 transition">NavLink1</a>
      <a class="text-sm hover:opacity-70 transition">NavLink2</a>
      ... (one <a> per navLinks item)
    </nav>
    <button style="background-color:<accentColor>; color:#fff; padding:8px 20px; border-radius:6px; font-weight:600; border:none; cursor:pointer">CTA text</button>
  </div>
</header>

HERO — exact structure required:
<section class="min-h-screen flex items-center" style="background-color:<designBrief.backgroundColor>">  ← SOLID color, NO gradient unless elementStyles.hero has one
  <div class="max-w-7xl mx-auto px-6 py-24">
    <h1 class="text-5xl md:text-7xl font-black mb-6">headings[0]</h1>
    <p class="text-xl mb-10 opacity-80">headings[1] or ctas context</p>
    <div class="flex items-center gap-4 flex-wrap">
      <button style="background-color:<accentColor>; color:#fff; padding:14px 32px; border-radius:8px; font-size:16px; font-weight:600; border:none; cursor:pointer; transition:opacity 0.2s" onmouseover="this.style.opacity=0.85" onmouseout="this.style.opacity=1">ctas[0]</button>
      <button style="border:2px solid <accentColor>; color:<accentColor>; padding:14px 32px; border-radius:8px; font-size:16px; font-weight:600; background:transparent; cursor:pointer">ctas[1]</button>
    </div>
  </div>
</section>

FOOTER — exact structure required:
<footer style="background-color:<darkColor>; color:#fff; padding:48px 0; margin-top:0">
  <div class="max-w-7xl mx-auto px-6 flex flex-wrap justify-between gap-8">
    <div><p class="font-bold text-lg">SiteName</p><p class="opacity-60 text-sm mt-2">Tagline</p></div>
    <div class="flex gap-16">  ← link columns side by side
      ... link groups ...
    </div>
  </div>
  <p class="text-center opacity-40 text-sm mt-8">© 2024 SiteName</p>
</footer>

STYLING RULES:
- Apply elementStyles values as inline style="" on matching elements — they override Tailwind
- NO invented gradients. Only use gradient if elementStyles.hero contains background-image with gradient
- Use designBrief.backgroundColor as solid background for hero if no gradient is found
- For colors not in elementStyles, use Tailwind arbitrary values: bg-[#hex], text-[#hex]
`.trim();

const COLORS = {
  reset:   "\x1b[0m",
  dim:     "\x1b[2m",
  cyan:    "\x1b[36m",
  yellow:  "\x1b[33m",
  green:   "\x1b[32m",
  magenta: "\x1b[35m",
  red:     "\x1b[31m",
  bold:    "\x1b[1m",
};

function label(step) {
  switch (step) {
    case "TOOL":   return `${COLORS.yellow}${COLORS.bold}   TOOL ${COLORS.reset}`;
    case "OBSERVE":return `${COLORS.magenta}${COLORS.bold}OBSERVE ${COLORS.reset}`;
    case "OUTPUT": return `${COLORS.green}${COLORS.bold} OUTPUT ${COLORS.reset}`;
    case "THINK":  return `${COLORS.cyan}${COLORS.bold}  THINK ${COLORS.reset}`;
    default:       return `${COLORS.dim}    ... ${COLORS.reset}`;
  }
}

// OBSERVE compression — keeps history lean
const DISCARD_OBSERVE  = new Set(["writeFile", "appendFile", "executeCommand", "openInBrowser"]);

function compressObserve(toolName, content) {
  if (DISCARD_OBSERVE.has(toolName)) return content.split("\n")[0].slice(0, 120);
  // analyzeWebsite: 3000 chars — content fields (navLinks, headings, ctas) are now
  // ordered first in the JSON so they survive even if styling fields get cut off.
  return content.length > 3000 ? content.slice(0, 3000) + "\n...[truncated]" : content;
}

// Sliding window — system + user request + design brief + last N messages
const KEEP_RECENT = 6;

function pruneHistory(messages) {
  if (messages.length <= 3 + KEEP_RECENT) return messages;

  const system      = messages[0];
  const userRequest = messages[1];

  const designBriefIdx = messages.findIndex((m) => {
    if (m.role !== "user") return false;
    try { return JSON.parse(m.content)?.content?.includes?.("designBrief"); }
    catch { return false; }
  });

  const tail = messages.slice(-KEEP_RECENT);
  const core = [system, userRequest];

  if (designBriefIdx !== -1 && !tail.includes(messages[designBriefIdx])) {
    core.push(messages[designBriefIdx]);
  }

  const seen = new Set(core.map((m) => m.content));
  for (const m of tail) {
    if (!seen.has(m.content)) { core.push(m); seen.add(m.content); }
  }

  return core;
}

function parseJson(raw) {
  const text = raw.trim();
  try { return JSON.parse(text); } catch {}
  const fenced = text.match(/```(?:json)?\s*([\s\S]+?)```/);
  if (fenced) { try { return JSON.parse(fenced[1].trim()); } catch {} }
  const brace = text.match(/\{[\s\S]*\}/);
  if (brace) { try { return JSON.parse(brace[0]); } catch {} }
  for (const line of text.split("\n")) {
    const l = line.trim();
    if (l.startsWith("{")) { try { return JSON.parse(l); } catch {} }
  }
  throw new Error(`Cannot parse JSON:\n${text.slice(0, 200)}`);
}

export async function runAgent(userMessage) {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user",   content: userMessage },
  ];

  // Track files already written — prevents the LLM re-writing style.css / script.js
  const writtenFiles = new Set();

  console.log();

  while (true) {
    const windowed = pruneHistory(messages);

    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: windowed,
      temperature: 0.3,
      max_tokens: 8192,
      response_format: { type: "json_object" },
    });

    const { prompt_tokens, completion_tokens } = response.usage;
    process.stdout.write(
      `${COLORS.dim}  [↑${prompt_tokens} ↓${completion_tokens} tokens | ${windowed.length} msgs in window]${COLORS.reset}\n`
    );

    const raw = response.choices[0].message.content;
    let parsed;
    try {
      parsed = parseJson(raw);
    } catch (err) {
      console.error(`${COLORS.red}Parse error:${COLORS.reset}`, err.message);
      break;
    }

    const { think, step, tool_name, tool_args, content } = parsed;

    // Print think inline — never push to history (saves tokens every future call)
    if (think) {
      console.log(`${label("THINK")} ${think}`);
    }

    if (step === "TOOL") {
      const argsPreview = JSON.stringify(tool_args || {}).slice(0, 80);
      console.log(
        `${label("TOOL")} ${COLORS.bold}${tool_name}${COLORS.reset}` +
        `(${COLORS.dim}${argsPreview}${argsPreview.length >= 80 ? "..." : ""}${COLORS.reset})`
      );

      // Guard: block re-writing a file already written
      if (tool_name === "writeFile") {
        const fp = tool_args?.filepath;
        if (fp && writtenFiles.has(fp)) {
          console.log(`${COLORS.yellow}  [skipped — ${fp} already written]${COLORS.reset}`);
          messages.push({
            role: "user",
            content: JSON.stringify({ step: "OBSERVE", content: `Skipped: ${fp} was already written. Continue to next step.` }),
          });
          continue;
        }
        if (fp) writtenFiles.add(fp);
      }

      // Only push TOOL to history (not THINK) — keeps context minimal
      messages.push({ role: "assistant", content: JSON.stringify({ step: "TOOL", tool_name, tool_args }) });

      const result  = await executeTool(tool_name, tool_args);
      const compressed = compressObserve(tool_name, result);

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
      console.log(`${COLORS.red}Unexpected step "${step}" — stopping.${COLORS.reset}`);
      break;
    }
  }
}
