# AI Website Clone Agent

A conversational CLI agent that clones any website by analyzing its design system and generating a fully working HTML/CSS/JS clone — directly in your terminal.


---

## Demo

```
you › Clone the Scaler website

  THINK  I'll analyze the Scaler website to extract its exact design system.
   TOOL  analyzeWebsite({ "url": "https://www.scaler.com" })
OBSERVE  { designBrief: { isDarkTheme: true, backgroundColor: '#0d1117', accent: '#e8732a' ... } }
  THINK  Dark theme confirmed — writing CSS and JS with exact brand colors.
   TOOL  executeCommand({ "cmd": "mkdir -p scaler_clone" })
   TOOL  writeFile({ "filepath": "scaler_clone/style.css", ... })
   TOOL  writeFile({ "filepath": "scaler_clone/script.js", ... })
   TOOL  appendFile({ "filepath": "scaler_clone/index.html", ... })  ← HEAD
   TOOL  appendFile({ "filepath": "scaler_clone/index.html", ... })  ← NAVBAR
   TOOL  appendFile({ "filepath": "scaler_clone/index.html", ... })  ← HERO
   TOOL  appendFile({ "filepath": "scaler_clone/index.html", ... })  ← FEATURES
   TOOL  appendFile({ "filepath": "scaler_clone/index.html", ... })  ← FOOTER
   TOOL  openInBrowser({ "filepath": "scaler_clone/index.html" })
 OUTPUT  Scaler clone is live at scaler_clone/index.html
```

---

## How It Works

The agent follows a **ReAct loop** (Reason → Act → Observe) until the task is complete:

```
User Input
    │
    ▼
┌─────────┐     ┌──────────────────────┐     ┌─────────────┐
│  THINK  │────▶│  TOOL (action)       │────▶│   OBSERVE   │
│         │◀────│  analyzeWebsite      │     │  (result)   │
└─────────┘     │  writeFile           │     └──────┬──────┘
                │  appendFile          │            │
                │  executeCommand      │◀───────────┘
                │  openInBrowser       │
                └──────────────────────┘
                          │
                          ▼
                       OUTPUT
```

### Website Analysis Pipeline

Before generating any code, the agent scrapes the target website and extracts a compact design brief (~300–500 tokens instead of raw HTML which is 50,000+):

```
axios (fetch HTML)
  → cheerio (parse DOM — extract headings, nav links, CTAs, section structure)
  → <style> tags (inline critical CSS — important for Next.js / SSR apps)
  → external CSS files (fetch up to 6, extract hex colors, fonts, CSS variables)
  → synthesizeDesignBrief() — detects dark/light theme, identifies accent color
  → returns compact JSON design brief
```

### Tech Stack for Generated Clones

| Layer | Technology | Why |
|---|---|---|
| Structure | HTML5 | No build step — opens directly in browser |
| Styling | Tailwind CSS (CDN) | Responsive utilities, dark mode, hover effects |
| Interactivity | Alpine.js (CDN) | Mobile menu, dropdowns — no React needed |
| Animations | Vanilla JS | IntersectionObserver scroll reveals, sticky nav |
| Custom styles | style.css | CSS variables, keyframe animations |

---

## Project Structure

```
cli-tool/
├── index.js                 # CLI entry point — readline interactive loop
├── agent.js                 # ReAct loop engine (Groq API + token management)
├── tools/
│   ├── analyzeWebsite.js    # Website scraper — design token extraction
│   ├── writeFile.js         # Write a file to disk (CSS, JS)
│   ├── appendFile.js        # Append to a file — used to build HTML section by section
│   ├── executeCommand.js    # Run shell commands (mkdir etc.)
│   ├── openInBrowser.js     # Open output in default browser (cross-platform)
│   └── index.js             # Tool registry + executor
├── .env                     # Your GROQ_API_KEY (not committed)
├── .env.example             # Template
└── package.json
```

---

## Setup

### 1. Clone the repo

```bash
git clone <your-repo-url>
cd cli-tool
```

### 2. Install dependencies

```bash
npm install
```

### 3. Get a free Groq API key

Go to [console.groq.com](https://console.groq.com), sign up (free), and create an API key.

### 4. Add your key

```bash
cp .env.example .env
```

Edit `.env`:
```
GROQ_API_KEY=your_key_here
```

### 5. Run

```bash
node index.js
```

---

## Usage

```
you › Clone the Scaler website
you › Clone the Netflix website
you › Clone the GitHub homepage
you › What is the weather in Mumbai?
you › Get GitHub details for torvalds
you › exit
```

The agent handles any natural language instruction. Website cloning is its primary capability but it can also run shell commands and answer general queries using its tools.

---

## Token Efficiency

The agent uses three strategies to keep API costs low:

| Strategy | What it does | Savings |
|---|---|---|
| Design brief extraction | Scrapes website → 400-token JSON instead of 50k raw HTML | ~99% reduction on analysis |
| OBSERVE compression | File-write confirmations stored as 1-line summaries, not full content | ~90% reduction per step |
| Sliding window | Only last 8 messages + system prompt + design brief sent per call | Flat cost per turn |

Live token usage is printed on every turn:
```
  [tokens: 1843 in / 412 out | history: 9 msgs]
```

---

## Model

**Groq — `llama-3.3-70b-versatile`**

- Free tier: 14,400 requests/day, no credit card required
- 128k context window
- OpenAI-compatible API
- Fast inference via Groq's LPU hardware

---

## Dependencies

| Package | Purpose |
|---|---|
| `groq-sdk` | Groq API client |
| `axios` | HTTP requests for web scraping |
| `cheerio` | HTML parsing (jQuery for Node) |
| `turndown` | HTML → Markdown conversion (token reduction) |
| `dotenv` | Environment variable loading |

All built-in Node.js modules used: `readline`, `fs/promises`, `path`, `child_process`.
