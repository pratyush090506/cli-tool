import axios from "axios";
import * as cheerio from "cheerio";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};

function resolveUrl(href, base) {
  try { return new URL(href, base).href; }
  catch { return null; }
}

function extractColorsFromCss(css) {
  const hex6 = css.match(/#[0-9a-fA-F]{6}\b/g) || [];
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

// For each key UI element, find matching CSS rules and extract concrete property values.
function extractElementStyles(css) {
  const PROPS = ["background", "background-color", "color", "border-radius",
                 "font-size", "font-weight", "padding", "border", "box-shadow",
                 "backdrop-filter", "background-image"];

  const matchers = {
    body:    /^(body|html)\s*$/i,
    navbar:  /^(header|nav|\.navbar|\.nav-bar|\.header|\.site-header)\s*$/i,
    hero:    /\.(hero|banner|jumbotron|landing|splash)/i,
    button:  /^(button|\.btn|\.button|\.cta|a\.btn)\s*$/i,
    footer:  /^(footer|\.footer|\.site-footer)\s*$/i,
  };

  const result = {};

  for (const [, selector, block] of css.matchAll(/([^{}]+)\{([^}]+)\}/g)) {
    const sel = selector.trim();
    // skip pseudo-classes and media queries
    if (/:hover|:focus|:active|@media/i.test(sel)) continue;

    for (const [key, pattern] of Object.entries(matchers)) {
      if (!pattern.test(sel)) continue;
      if (!result[key]) result[key] = {};

      for (const prop of PROPS) {
        if (result[key][prop]) continue; // first match wins
        const match = block.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;}{]+)`, "i"));
        if (match) result[key][prop] = match[1].trim();
      }
    }
  }

  return result;
}

function extractSelectorBackgrounds(css) {
  const result = {};
  for (const [, selector, block] of css.matchAll(/([^{}]+)\{([^}]+)\}/g)) {
    const sel = selector.trim().toLowerCase();
    if (/body|html|:root|header|\.hero|\.banner|\.navbar|\.nav\b|\.wrapper/i.test(sel)) {
      const bg    = block.match(/background(?:-color)?\s*:\s*([^;]+)/);
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
    .slice(0, 12)
    .map(([color]) => color);
}

function synthesizeDesignBrief({ bodyBg, colors, fonts, selectorBgs }) {
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
  const accentColor = colors.find((c) => {
    const hex = c.replace("#", "");
    if (hex.length !== 6) return false;
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return r > 100 && (r + g + b) / 3 > 80 && (r + g + b) / 3 < 200;
  }) || colors[0];

  const bgColor    = bodyBg || (isDark ? "#0d1117" : "#ffffff");
  const textColor  = isDark ? "#ffffff" : "#111111";

  return { isDarkTheme: isDark, backgroundColor: bgColor, textColor, accentColor, primaryFont };
}

async function fetchCssFiles(cssUrls, baseUrl) {
  const results = { colors: [], fonts: [], variables: {}, selectorBgs: {}, elementStyles: {} };
  for (const href of cssUrls.slice(0, 6)) {
    const url = resolveUrl(href, baseUrl);
    if (!url) continue;
    try {
      const { data: css } = await axios.get(url, { headers: HEADERS, timeout: 6000 });
      results.colors.push(...extractColorsFromCss(css));
      results.fonts.push(...extractFontsFromCss(css));
      Object.assign(results.variables, extractCssVariables(css));
      Object.assign(results.selectorBgs, extractSelectorBackgrounds(css));
      // Merge element styles — first match per element wins
      const es = extractElementStyles(css);
      for (const [el, props] of Object.entries(es)) {
        if (!results.elementStyles[el]) results.elementStyles[el] = {};
        for (const [p, v] of Object.entries(props)) {
          if (!results.elementStyles[el][p]) results.elementStyles[el][p] = v;
        }
      }
    } catch { /* skip */ }
  }
  return results;
}

export async function analyzeWebsite(url) {
  const { data: html } = await axios.get(url, { headers: HEADERS, timeout: 12000 });
  const $ = cheerio.load(html);

  const themeColor = $('meta[name="theme-color"]').attr("content") || null;

  const cssHrefs = [];
  $("link[rel='stylesheet'], link[rel='preload'][as='style']").each((_, el) => {
    const href = $(el).attr("href");
    if (href) cssHrefs.push(href);
  });

  const inlineStyleText = $("style").map((_, el) => $(el).html()).get().join("\n");

  const inlineAttrColors = [];
  $("[style]").each((_, el) => {
    inlineAttrColors.push(...extractColorsFromCss($(el).attr("style") || ""));
  });

  const bodyBgAttr  = $("body").attr("style") || "";
  const bodyBgMatch = bodyBgAttr.match(/background(?:-color)?\s*:\s*([^;]+)/);
  let bodyBg        = bodyBgMatch ? bodyBgMatch[1].trim() : null;

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

  // ── inline style= on key elements (highest specificity) ──
  const inlineElementStyles = {};
  [
    ["body",   $("body").first()],
    ["navbar", $("header, nav").first()],
    ["hero",   $("[class*='hero'], [class*='banner'], section").first()],
    ["button", $("button, a[class*='btn'], a[class*='cta']").first()],
    ["footer", $("footer").first()],
  ].forEach(([key, el]) => {
    const style = el.attr?.("style") || "";
    if (style) inlineElementStyles[key] = style;
  });

  // ── fetch + parse external CSS ──
  const cssData = await fetchCssFiles(cssHrefs, url);

  // parse inline <style> blocks too
  cssData.colors.push(...extractColorsFromCss(inlineStyleText));
  cssData.fonts.push(...extractFontsFromCss(inlineStyleText));
  Object.assign(cssData.variables, extractCssVariables(inlineStyleText));
  Object.assign(cssData.selectorBgs, extractSelectorBackgrounds(inlineStyleText));
  const inlineES = extractElementStyles(inlineStyleText);
  for (const [el, props] of Object.entries(inlineES)) {
    if (!cssData.elementStyles[el]) cssData.elementStyles[el] = {};
    for (const [p, v] of Object.entries(props)) {
      if (!cssData.elementStyles[el][p]) cssData.elementStyles[el][p] = v;
    }
  }

  if (!bodyBg) {
    const bodySel = cssData.selectorBgs["body"] || cssData.selectorBgs["html"] || cssData.selectorBgs[":root"];
    if (bodySel?.background) bodyBg = bodySel.background;
    if (!bodyBg && cssData.elementStyles.body?.["background-color"])
      bodyBg = cssData.elementStyles.body["background-color"];
    if (!bodyBg && cssData.elementStyles.body?.background)
      bodyBg = cssData.elementStyles.body.background;
  }

  const allColors   = rankColors([...cssData.colors, ...inlineAttrColors, ...(themeColor ? [themeColor] : [])]);
  const designBrief = synthesizeDesignBrief({
    bodyBg,
    colors: allColors,
    fonts:  [...new Set(cssData.fonts)].filter(Boolean),
    selectorBgs: cssData.selectorBgs,
  });

  // Merge inline element styles on top of CSS-derived ones (inline wins)
  const elementStyles = { ...cssData.elementStyles };
  for (const [key, styleStr] of Object.entries(inlineElementStyles)) {
    if (!elementStyles[key]) elementStyles[key] = {};
    for (const [, prop, val] of styleStr.matchAll(/([\w-]+)\s*:\s*([^;]+)/g)) {
      elementStyles[key][prop.trim()] = val.trim();
    }
  }

  // Content fields first — these must survive any truncation.
  // Styling fields last — useful but not critical if cut off.
  return {
    headings:     [...new Set(headings)].slice(0, 4),
    navLinks:     [...new Set(navLinks)].slice(0, 8),
    ctas:         [...new Set(ctas)].slice(0, 4),
    designBrief,
    colors:       allColors.slice(0, 8),
    fonts:        [...new Set(cssData.fonts)].filter(Boolean).slice(0, 3),
    elementStyles,
    cssVariables: Object.fromEntries(Object.entries(cssData.variables).slice(0, 8)),
  };
}
