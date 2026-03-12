"use strict";

const ROOT_KEY = "bmetal.root";
const ROLE_KEY = "bmetal.role";
const SETTINGS_KEY = "bmetal.settings";
const VERSION = "1";
const DEFAULT_SETTINGS = {
  preset: "necrotic",
  seed: 13,
  branches: 42,
  branchLength: 96,
  branchWeight: 5,
  chaos: 0.56,
  symmetry: 0.72,
  cloneLayers: 7,
  cloneSpread: 10,
  tracking: 0,
  verticalStretch: 1.06,
  coreWeightBoost: 0,
  halo: 0.28,
  haze: 0.2,
  frost: 0.18,
  drips: 8,
  dripLength: 38,
  padding: 56
};

figma.showUI(__html__, { width: 420, height: 640, themeColors: true });
figma.root.setRelaunchData({
  regenerateBlackMetal: "Open Black Metal Typography"
});

figma.ui.onmessage = async (msg) => {
  try {
    if (msg.type === "get-selection") {
      const payload = await inspectSelection();
      figma.ui.postMessage({ type: "selection", payload });
      return;
    }

    if (msg.type === "apply") {
      const settings = sanitizeSettings(msg.settings || {});
      const result = await applyBlackMetal(settings);
      figma.ui.postMessage({ type: "applied", payload: result });
      return;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    figma.notify(message, { error: true });
    figma.ui.postMessage({ type: "error", message });
  }
};

async function inspectSelection() {
  const node = figma.currentPage.selection[0];
  if (!node) {
    return {
      kind: "empty",
      message: "Select a text layer or an existing Black Metal Typography frame."
    };
  }

  const root = findRoot(node);
  if (root) {
    const settings = readSettings(root);
    const source = findSource(root);
    return {
      kind: "generated",
      message: source
        ? `Editing ${source.characters.slice(0, 32) || "text"}`
        : "Editing generated typography",
      settings,
      text: source ? source.characters : ""
    };
  }

  if (node.type !== "TEXT") {
    return {
      kind: "invalid",
      message: "Select a text layer to generate typography."
    };
  }

  const settings = DEFAULT_SETTINGS;
  return {
    kind: "text",
    message: `Ready for "${node.characters.slice(0, 32) || "text"}"`,
    settings,
    text: node.characters
  };
}

async function applyBlackMetal(settings) {
  const selection = figma.currentPage.selection[0];
  if (!selection) {
    throw new Error("Select a text layer or an existing generated frame.");
  }

  const existingRoot = findRoot(selection);
  if (existingRoot) {
    const source = findSource(existingRoot);
    if (!source) {
      throw new Error("The selected generated frame is missing its source text layer.");
    }

    const fontName = await loadNodeFonts(source);
    source.strokes = clonePaints(source.strokes || []);
    if (settings.coreWeightBoost > 0) {
      source.strokeAlign = "OUTSIDE";
      source.strokeWeight = settings.coreWeightBoost;
    } else {
      source.strokeWeight = 0;
    }

    rebuildRoot(existingRoot, source, fontName, settings);
    figma.currentPage.selection = [existingRoot];
    figma.viewport.scrollAndZoomIntoView([existingRoot]);
    figma.notify("Black metal typography updated.");
    return { action: "updated" };
  }

  if (selection.type !== "TEXT") {
    throw new Error("Select a text layer to generate typography.");
  }

  const fontName = await loadNodeFonts(selection);
  const root = figma.createFrame();
  root.name = `${selection.name || "Text"} / Black Metal`;
  root.fills = [];
  root.clipsContent = false;
  root.setPluginData(ROOT_KEY, VERSION);
  root.setPluginData(SETTINGS_KEY, JSON.stringify(settings));
  root.setRelaunchData({
    regenerateBlackMetal: "Regenerate black metal"
  });

  const startX = selection.x;
  const startY = selection.y;
  root.x = startX;
  root.y = startY;
  figma.currentPage.appendChild(root);

  selection.setPluginData(ROLE_KEY, "source");
  selection.name = "Editable Source";
  root.appendChild(selection);
  selection.x = 0;
  selection.y = 0;

  rebuildRoot(root, selection, fontName, settings);
  figma.currentPage.selection = [root];
  figma.viewport.scrollAndZoomIntoView([root]);
  figma.notify("Black metal typography created.");
  return { action: "created" };
}

function rebuildRoot(root, source, fontName, settings) {
  removeGenerated(root);
  root.setPluginData(SETTINGS_KEY, JSON.stringify(settings));

  source.fills = [solidPaint(0.97)];
  source.opacity = 0.9;
  source.visible = true;
  source.rotation = 0;

  const generated = figma.createFrame();
  generated.name = "Generated Ornament";
  generated.fills = [];
  generated.clipsContent = false;
  generated.setPluginData(ROLE_KEY, "generated");
  root.insertChild(0, generated);

  const rng = createRng(seedFrom(source.characters, settings.seed));
  const width = Math.max(12, source.width);
  const height = Math.max(12, source.height);
  const centerX = width / 2;
  const centerY = height / 2;
  const textStyle = readTextStyleSnapshot(source, fontName);

  addHalo(generated, width, height, settings, rng);
  addShadowText(generated, source, textStyle, settings, rng);
  addBranches(generated, width, height, centerX, centerY, settings, rng);
  addDrips(generated, width, height, settings, rng);
  addFrost(generated, width, height, settings, rng);

  normalizeFrame(generated, 0);
  root.expanded = true;
  normalizeFrame(root, settings.padding);
}

function removeGenerated(root) {
  const children = root.children.slice();
  for (const child of children) {
    if (child.getPluginData(ROLE_KEY) === "generated") {
      child.remove();
    }
  }
}

function findRoot(node) {
  let current = node;
  while (current) {
    if ("getPluginData" in current && current.getPluginData(ROOT_KEY) === VERSION) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

function findSource(root) {
  return root.findOne(
    (node) => node.type === "TEXT" && node.getPluginData(ROLE_KEY) === "source"
  );
}

function readSettings(root) {
  try {
    const raw = root.getPluginData(SETTINGS_KEY);
    if (!raw) {
      return DEFAULT_SETTINGS;
    }
    return sanitizeSettings(JSON.parse(raw));
  } catch (error) {
    return DEFAULT_SETTINGS;
  }
}

function readTextStyleSnapshot(textNode, fontName) {
  if (
    textNode.fontSize === figma.mixed ||
    textNode.textCase === figma.mixed ||
    textNode.textDecoration === figma.mixed ||
    textNode.letterSpacing === figma.mixed ||
    textNode.lineHeight === figma.mixed
  ) {
    throw new Error("Mixed text styles are not supported yet. Use a single text style.");
  }

  return {
    fontName,
    fontSize: textNode.fontSize,
    textCase: textNode.textCase,
    textDecoration: textNode.textDecoration,
    letterSpacing: textNode.letterSpacing,
    lineHeight: textNode.lineHeight
  };
}

async function loadNodeFonts(textNode) {
  const fonts = listFonts(textNode);
  if (fonts.length > 1) {
    throw new Error("Use a single font family/style for the selected text.");
  }
  for (const font of fonts) {
    await figma.loadFontAsync(font);
  }
  return fonts[0];
}

function listFonts(textNode) {
  const fontNames = [];
  if (textNode.characters.length === 0) {
    const fontName = textNode.fontName;
    if (fontName === figma.mixed) {
      throw new Error("Mixed fonts are not supported for empty text.");
    }
    return [fontName];
  }

  for (let i = 0; i < textNode.characters.length; i += 1) {
    const fontName = textNode.getRangeFontName(i, i + 1);
    if (fontName === figma.mixed) {
      throw new Error("This plugin needs a single font per character range.");
    }
    if (!fontNames.some((item) => sameFont(item, fontName))) {
      fontNames.push(fontName);
    }
  }
  return fontNames;
}

function sameFont(a, b) {
  return a.family === b.family && a.style === b.style;
}

function addHalo(parent, width, height, settings, rng) {
  if (settings.halo <= 0 && settings.haze <= 0) {
    return;
  }

  const moon = figma.createEllipse();
  moon.name = "Moon";
  moon.resize(width * 0.18, width * 0.18);
  moon.x = width * 0.5 - moon.width / 2;
  moon.y = -height * (0.5 + settings.halo * 0.2);
  moon.fills = [];
  moon.strokes = [solidPaint(0.97)];
  moon.strokeWeight = 1;
  moon.opacity = 0.3 + settings.halo * 0.5;
  parent.appendChild(moon);

  const starCount = Math.max(12, Math.round(24 + settings.haze * 80));
  for (let i = 0; i < starCount; i += 1) {
    const star = figma.createEllipse();
    const size = 0.8 + rng() * 2.2;
    star.resize(size, size);
    star.x = width * 0.15 + rng() * width * 0.7;
    star.y = -height * 0.45 + rng() * height * 0.18;
    star.fills = [solidPaint(0.97)];
    star.opacity = 0.15 + rng() * 0.6;
    parent.appendChild(star);
  }
}

function addShadowText(parent, source, textStyle, settings, rng) {
  const cloneCount = Math.max(8, Math.round(settings.cloneLayers * 3));
  const spread = Math.max(1, settings.cloneSpread * 0.35);
  for (let i = 0; i < cloneCount; i += 1) {
    const clone = figma.createText();
    clone.name = "Ink Mass";
    clone.fontName = textStyle.fontName;
    clone.characters = source.characters;
    clone.fontSize = textStyle.fontSize;
    clone.textCase = textStyle.textCase;
    clone.textDecoration = textStyle.textDecoration;
    clone.letterSpacing = cloneSpacing(textStyle.letterSpacing, settings.tracking);
    clone.lineHeight = cloneLineHeight(textStyle.lineHeight, settings.verticalStretch);
    clone.textAutoResize = "WIDTH_AND_HEIGHT";
    clone.fills = [solidPaint(0.97)];
    clone.opacity = clamp(0.14 + (i / cloneCount) * 0.07, 0.14, 0.22);
    clone.x = randomRange(rng, -spread, spread);
    clone.y = randomRange(rng, -spread * 0.6, spread * 0.6);
    clone.rotation = randomRange(rng, -2 - settings.chaos * 4, 2 + settings.chaos * 4);
    parent.appendChild(clone);
  }
}

function addBranches(parent, width, height, centerX, centerY, settings, rng) {
  addTopSpires(parent, width, height, centerX, settings, rng);
  addSideAntlers(parent, width, height, settings, rng);
  addRootCurtain(parent, width, height, settings, rng);
}

function addTopSpires(parent, width, height, centerX, settings, rng) {
  const spireCount = Math.max(6, Math.round(settings.branches * 0.22));
  for (let i = 0; i < spireCount; i += 1) {
    const baseX = width * (0.15 + rng() * 0.7);
    const length = height * (0.35 + rng() * 0.55);
    spawnFilament(parent, {
      x: baseX,
      y: height * (0.1 + rng() * 0.15),
      angle: 180 + randomRange(rng, -10, 10),
      length,
      thickness: Math.max(1, settings.branchWeight * 0.28),
      brightness: 0.97,
      depth: 2,
      branchChance: 0.28 + settings.chaos * 0.18,
      taper: 0.76,
      rng
    });

    if (rng() < settings.symmetry) {
      spawnFilament(parent, {
        x: centerX + (centerX - baseX),
        y: height * (0.1 + rng() * 0.15),
        angle: 180 + randomRange(rng, -10, 10),
        length,
        thickness: Math.max(1, settings.branchWeight * 0.28),
        brightness: 0.97,
        depth: 2,
        branchChance: 0.28 + settings.chaos * 0.18,
        taper: 0.76,
        rng
      });
    }
  }

  spawnFilament(parent, {
    x: centerX,
    y: height * 0.02,
    angle: 180,
    length: height * (0.55 + settings.halo * 0.3),
    thickness: Math.max(1.2, settings.branchWeight * 0.34),
    brightness: 0.97,
    depth: 1,
    branchChance: 0.14,
    taper: 0.82,
    rng
  });
}

function addSideAntlers(parent, width, height, settings, rng) {
  const sideCount = Math.max(6, Math.round(settings.branches * 0.16));
  for (let i = 0; i < sideCount; i += 1) {
    const y = height * (0.16 + rng() * 0.32);
    const length = width * (0.12 + rng() * 0.16);
    spawnFilament(parent, {
      x: width * (0.08 + rng() * 0.1),
      y,
      angle: -90 + randomRange(rng, -22, 22),
      length,
      thickness: Math.max(1, settings.branchWeight * 0.26),
      brightness: 0.97,
      depth: 3,
      branchChance: 0.34 + settings.chaos * 0.18,
      taper: 0.78,
      rng
    });
    spawnFilament(parent, {
      x: width * (0.92 - rng() * 0.1),
      y,
      angle: 90 + randomRange(rng, -22, 22),
      length,
      thickness: Math.max(1, settings.branchWeight * 0.26),
      brightness: 0.97,
      depth: 3,
      branchChance: 0.34 + settings.chaos * 0.18,
      taper: 0.78,
      rng
    });
  }
}

function addRootCurtain(parent, width, height, settings, rng) {
  const rootCount = Math.max(18, Math.round(settings.branches * 1.4 + settings.drips));
  for (let i = 0; i < rootCount; i += 1) {
    const t = i / Math.max(1, rootCount - 1);
    const mirroredT = t < 0.5 ? t * 2 : (1 - t) * 2;
    const centerBias = 1 - Math.pow(mirroredT, 1.6);
    const x = width * 0.08 + t * width * 0.84 + randomRange(rng, -6, 6);
    const y = height * (0.52 - centerBias * 0.14 + rng() * 0.1);
    const length = settings.branchLength * (0.7 + centerBias * 0.7 + rng() * 0.55);
    const depth = centerBias > 0.6 ? 4 : 3;
    spawnFilament(parent, {
      x,
      y,
      angle: randomRange(rng, -14, 14),
      length,
      thickness: Math.max(1, settings.branchWeight * (0.22 + centerBias * 0.26)),
      brightness: 0.97,
      depth,
      branchChance: 0.42 + centerBias * 0.18 + settings.chaos * 0.08,
      taper: 0.72,
      rng
    });
  }
}

function spawnFilament(parent, options) {
  const {
    x,
    y,
    angle,
    length,
    thickness,
    brightness,
    depth,
    branchChance,
    taper,
    rng
  } = options;

  const segments = Math.max(2, Math.round(3 + length / 42));
  let currentX = x;
  let currentY = y;
  let currentAngle = angle;
  let currentThickness = thickness;
  const segmentLength = length / segments;

  for (let i = 0; i < segments; i += 1) {
    const pieceLength = segmentLength * (0.72 + rng() * 0.7);
    const segment = figma.createRectangle();
    const widthPx = Math.max(1, currentThickness);
    const heightPx = Math.max(3, pieceLength);
    segment.resize(widthPx, heightPx);
    segment.cornerRadius = widthPx / 2;
    segment.fills = [solidPaint(brightness)];
    segment.opacity = clamp(0.72 + rng() * 0.2, 0.72, 0.96);
    segment.x = currentX - widthPx / 2;
    segment.y = currentY;
    segment.rotation = currentAngle;
    parent.appendChild(segment);

    const radians = (currentAngle * Math.PI) / 180;
    currentX += Math.sin(radians) * pieceLength;
    currentY += Math.cos(radians) * pieceLength;
    currentAngle += randomRange(rng, -12, 12);
    currentThickness = Math.max(0.7, currentThickness * taper);

    if (depth > 0 && rng() < branchChance) {
      const direction = rng() < 0.5 ? -1 : 1;
      spawnFilament(parent, {
        x: currentX,
        y: currentY,
        angle: currentAngle + direction * randomRange(rng, 18, 42),
        length: pieceLength * (0.65 + rng() * 0.75),
        thickness: currentThickness * 0.78,
        brightness,
        depth: depth - 1,
        branchChance: branchChance * 0.72,
        taper: 0.74,
        rng
      });
    }
  }
}

function addDrips(parent, width, height, settings, rng) {
  const dripCount = Math.max(8, Math.round(settings.drips * 1.6));
  for (let i = 0; i < dripCount; i += 1) {
    const drip = figma.createRectangle();
    const dripHeight = settings.dripLength * (0.65 + rng() * 1.6);
    drip.resize(1, dripHeight);
    drip.cornerRadius = 0.5;
    drip.fills = [solidPaint(0.97)];
    drip.opacity = 0.45 + rng() * 0.35;
    drip.x = width * (0.08 + rng() * 0.84);
    drip.y = height * (0.2 + rng() * 0.65);
    parent.appendChild(drip);
  }
}

function addFrost(parent, width, height, settings, rng) {
  const count = Math.max(0, Math.round(settings.frost * 48));
  for (let i = 0; i < count; i += 1) {
    const crystal = figma.createEllipse();
    const size = 0.8 + rng() * 2.4;
    crystal.resize(size, size);
    crystal.fills = [solidColor(1, 1, 1)];
    crystal.opacity = 0.16 + rng() * settings.frost * 0.35;
    crystal.x = width * (0.18 + rng() * 0.64);
    crystal.y = -height * 0.28 + rng() * height * 0.18;
    parent.appendChild(crystal);
  }
}

function normalizeFrame(root, padding) {
  if (root.children.length === 0) {
    return;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const child of root.children) {
    minX = Math.min(minX, child.x);
    minY = Math.min(minY, child.y);
    maxX = Math.max(maxX, child.x + child.width);
    maxY = Math.max(maxY, child.y + child.height);
  }

  const shiftX = padding - minX;
  const shiftY = padding - minY;
  for (const child of root.children) {
    child.x += shiftX;
    child.y += shiftY;
  }

  root.resizeWithoutConstraints(
    Math.max(32, maxX - minX + padding * 2),
    Math.max(32, maxY - minY + padding * 2)
  );
}

function cloneSpacing(letterSpacing, tracking) {
  const value =
    letterSpacing.unit === "PERCENT"
      ? letterSpacing.value + tracking * 0.7
      : letterSpacing.value + tracking;
  return {
    unit: letterSpacing.unit,
    value
  };
}

function cloneLineHeight(lineHeight, stretch) {
  if (lineHeight.unit === "AUTO") {
    return {
      unit: "PERCENT",
      value: stretch * 100
    };
  }
  return {
    unit: lineHeight.unit,
    value: lineHeight.value * stretch
  };
}

function sanitizeSettings(input) {
  const raw = {};
  const defaultKeys = Object.keys(DEFAULT_SETTINGS);
  for (let i = 0; i < defaultKeys.length; i += 1) {
    const key = defaultKeys[i];
    raw[key] = DEFAULT_SETTINGS[key];
  }

  const inputKeys = Object.keys(input || {});
  for (let i = 0; i < inputKeys.length; i += 1) {
    const key = inputKeys[i];
    raw[key] = input[key];
  }

  return {
    preset: String(raw.preset || DEFAULT_SETTINGS.preset),
    seed: intInRange(raw.seed, 1, 9999),
    branches: intInRange(raw.branches, 8, 160),
    branchLength: numberInRange(raw.branchLength, 20, 220),
    branchWeight: numberInRange(raw.branchWeight, 1, 18),
    chaos: numberInRange(raw.chaos, 0, 1),
    symmetry: numberInRange(raw.symmetry, 0, 1),
    cloneLayers: intInRange(raw.cloneLayers, 0, 20),
    cloneSpread: numberInRange(raw.cloneSpread, 0, 40),
    tracking: numberInRange(raw.tracking, -40, 80),
    verticalStretch: numberInRange(raw.verticalStretch, 0.7, 1.6),
    coreWeightBoost: numberInRange(raw.coreWeightBoost, 0, 12),
    halo: numberInRange(raw.halo, 0, 1),
    haze: numberInRange(raw.haze, 0, 1),
    frost: numberInRange(raw.frost, 0, 1),
    drips: intInRange(raw.drips, 0, 40),
    dripLength: numberInRange(raw.dripLength, 0, 120),
    padding: intInRange(raw.padding, 8, 160)
  };
}

function intInRange(value, min, max) {
  return Math.round(numberInRange(value, min, max));
}

function numberInRange(value, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return min;
  }
  return clamp(parsed, min, max);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function solidPaint(gray) {
  return {
    type: "SOLID",
    color: { r: gray, g: gray, b: gray }
  };
}

function solidColor(r, g, b) {
  return {
    type: "SOLID",
    color: { r, g, b }
  };
}

function clonePaints(paints) {
  return JSON.parse(JSON.stringify(paints));
}

function seedFrom(text, seed) {
  let value = seed || 1;
  for (let i = 0; i < text.length; i += 1) {
    value = (value * 31 + text.charCodeAt(i)) % 2147483647;
  }
  return value || 1;
}

function createRng(seed) {
  let state = seed;
  return () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
}

function randomRange(rng, min, max) {
  return min + (max - min) * rng();
}
