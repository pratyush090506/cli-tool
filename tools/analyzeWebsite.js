import axios from "axios";
import * as cheerio from "cheerio";
import TurndownService from "turndown";

const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};

function resolveUrl(href, base) {
  try { return new URL(href, base).href; }
  catch { return null; }
}

function extractColorsFromCss(css) {
  const hex6  = css.match(/#[0-9a-fA-F]{6}\b/g) || [];
  const hex3  = css.match(/#[0-9a-fA-F]{3}\b/g) || [];
  const rgb   = css.match(/rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+[^)]*\)/g) || [];
  const hsl   = css.match(/hsla?\(\s*[\d.]+[^)]+\)/g) || [];
  return [...hex6, ...hex3, ...rgb, ...hsl];
}

function extractFontsFromCss(css) {
  return (css.match(/font-family\s*:\s*([^;}{]+)/gi) || []).map((m) =>
    m.replace(/font-family\s*:\s*/i, "").trim().split(",")[0].replace(/['"]/g, "").trim()
  );
}

function extractCssVariables(css) {
  const vars = {};
  for (const [, name, value] of css.matchAll(/--([\w-]+)\s*:\s*([^;}\n]+)/g)) {
    if (/color|bg|background|primary|secondary|accent|brand|font|text|surface|dark|light/i.test(name)) {
      vars[`--${name}`] = value.trim();
    }
  }
  return vars;
}

// Extract background-color from key selectors like body, header, .hero etc.
function extractSelectorBackgrounds(css) {
  const result = {};
  const selectorBlocks = css.matchAll(/([^{}]+)\{([^}]+)\}/g);
  for (const [, selector, block] of selectorBlocks) {
    const sel = selector.trim().toLowerCase();
    if (/body|html|:root|header|\.hero|\.banner|\.navbar|\.nav\b|\.wrapper|\.container/i.test(sel)) {
      const bg = block.match(/background(?:-color)?\s*:\s*([^;]+)/);
      const color = block.match(/\bcolor\s*:\s*([^;]+)/);
      if (bg) result[sel] = { background: bg[1].trim() };
      if (color && result[sel]) result[sel].color = color[1].trim();
    }
  }
  return result;
}

function rankColors(colors) {
  const freq = {};
  for (const c of colors) {
    const key = c.toLowerCase();
    freq[key] = (freq[key] || 0) + 1;
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 14)
    .map(([color]) => color);
}

function synthesizeDesignBrief({ bodyBg, colors, fonts, cssVariables, selectorBgs }) {
  const isDark = (() => {
    if (bodyBg) {
      const hex = bodyBg.replace("#", "");
      if (hex.length === 6) {
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        return (r + g + b) / 3 < 100;
      }
    }
    // Heuristic: if many dark colors dominate the palette
    const darkColors = colors.filter((c) => {
      const hex = c.replace("#", "");
      if (hex.length !== 6) return false;
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return (r + g + b) / 3 < 80;
    });
    return darkColors.length > colors.length * 0.3;
  })();

  const primaryFont = fonts[0] || "Inter";
  const accentColor =
    colors.find((c) => {
      const hex = c.replace("#", "");
      if (hex.length !== 6) return false;
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      // not too dark, not too light — a real accent
      return r > 100 && (r + g + b) / 3 > 80 && (r + g + b) / 3 < 200;
    }) || colors[0];

  const bgColor = bodyBg || (isDark ? "#0d1117" : "#ffffff");
  const textColor = isDark ? "#ffffff" : "#111111";

  return {
    isDarkTheme: isDark,
    backgroundColor: bgColor,
    textColor,
    accentColor,
    primaryFont,
    summary: `${isDark ? "Dark" : "Light"}-themed website. Background: ${bgColor}. Accent: ${accentColor || "unknown"}. Font: ${primaryFont}. Use this palette faithfully — do NOT substitute generic colors.`,
  };
}

async function fetchCssFiles(cssUrls, baseUrl) {
  const results = { colors: [], fonts: [], variables: {}, selectorBgs: {} };
  for (const href of cssUrls.slice(0, 6)) {
    const url = resolveUrl(href, baseUrl);
    if (!url) continue;
    try {
      const { data: css } = await axios.get(url, { headers: HEADERS, timeout: 6000 });
      results.colors.push(...extractColorsFromCss(css));
      results.fonts.push(...extractFontsFromCss(css));
      Object.assign(results.variables, extractCssVariables(css));
      Object.assign(results.selectorBgs, extractSelectorBackgrounds(css));
    } catch { /* skip */ }
  }
  return results;
}

export async function analyzeWebsite(url) {
  const { data: html } = await axios.get(url, { headers: HEADERS, timeout: 12000 });
  const $ = cheerio.load(html);

  // ── meta theme-color (most reliable single source for brand color) ──
  const themeColor = $('meta[name="theme-color"]').attr("content") || null;

  // ── collect all CSS hrefs: external + preload + Next.js chunks ──
  const cssHrefs = [];
  $("link[rel='stylesheet'], link[rel='preload'][as='style']").each((_, el) => {
    const href = $(el).attr("href");
    if (href) cssHrefs.push(href);
  });

  // ── inline <style> tags — critical CSS is often here for SSR/Next.js ──
  const inlineStyleText = $("style").map((_, el) => $(el).html()).get().join("\n");

  // ── inline style= attributes ──
  const inlineAttrColors = [];
  const inlineGradients = [];
  $("[style]").each((_, el) => {
    const s = $(el).attr("style") || "";
    inlineAttrColors.push(...extractColorsFromCss(s));
    if (/gradient/i.test(s)) inlineGradients.push(s.slice(0, 100));
  });

  // ── body background from HTML attribute (rare but some sites use it) ──
  const bodyBgAttr = $("body").attr("style") || "";
  const bodyBgMatch = bodyBgAttr.match(/background(?:-color)?\s*:\s*([^;]+)/);
  let bodyBg = bodyBgMatch ? bodyBgMatch[1].trim() : null;

  // ── sections ──
  const sections = [];
  $("header, nav, main, section, footer, [class*='hero'], [class*='banner'], [class*='feature']").each((_, el) => {
    const tag = el.tagName.toLowerCase();
    const cls = $(el).attr("class") || "";
    const label = cls.split(/\s+/).find((c) => /hero|banner|feature|pricing|testimonial|footer|header|nav/i.test(c)) || tag;
    sections.push(label);
  });

  // ── headings ──
  const headings = [];
  $("h1, h2").each((_, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (text.length > 3 && text.length < 130) headings.push(text);
  });

  // ── CTAs ──
  const ctas = [];
  $("button, a[class*='btn'], a[class*='cta'], a[class*='button'], [class*='cta']").each((_, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (text.length > 1 && text.length < 50) ctas.push(text);
  });

  // ── nav links ──
  const navLinks = [];
  $("nav a, header a").each((_, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (text.length > 1 && text.length < 30) navLinks.push(text);
  });

  // ── structural markdown (token-capped) ──
  const structuralHtml = $("header, nav, section, main, footer").toString();
  const structureMarkdown = turndown
    .turndown(structuralHtml)
    .replace(/\n{3,}/g, "\n\n")
    .slice(0, 1500);

  // ── fetch external CSS + parse inline CSS ──
  const cssData = await fetchCssFiles(cssHrefs, url);

  // Also parse the inline <style> block
  cssData.colors.push(...extractColorsFromCss(inlineStyleText));
  cssData.fonts.push(...extractFontsFromCss(inlineStyleText));
  Object.assign(cssData.variables, extractCssVariables(inlineStyleText));
  Object.assign(cssData.selectorBgs, extractSelectorBackgrounds(inlineStyleText));

  // Derive body background from selector map if not found yet
  if (!bodyBg) {
    const bodySel = cssData.selectorBgs["body"] || cssData.selectorBgs["html"] || cssData.selectorBgs[":root"];
    if (bodySel?.background) bodyBg = bodySel.background;
  }

  const allColors = rankColors([
    ...cssData.colors,
    ...inlineAttrColors,
    ...(themeColor ? [themeColor] : []),
  ]);

  const designBrief = synthesizeDesignBrief({
    bodyBg,
    colors: allColors,
    fonts: [...new Set(cssData.fonts)].filter(Boolean),
    cssVariables: cssData.variables,
    selectorBgs: cssData.selectorBgs,
  });

  return {
    url,
    designBrief,                                          // ← synthesized LLM-ready brief
    sections: [...new Set(sections)].slice(0, 10),
    headings: [...new Set(headings)].slice(0, 8),
    ctas: [...new Set(ctas)].slice(0, 6),
    navLinks: [...new Set(navLinks)].slice(0, 10),
    colors: allColors,
    cssVariables: cssData.variables,
    selectorBackgrounds: cssData.selectorBgs,
    fonts: [...new Set(cssData.fonts)].filter(Boolean).slice(0, 5),
    gradients: [...new Set(inlineGradients)].slice(0, 3),
    themeColor,
    structureMarkdown,
  };
}
