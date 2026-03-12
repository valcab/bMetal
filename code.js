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

  source.fills = [solidPaint(0.03)];
  source.opacity = 1;
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

  const halo = figma.createEllipse();
  halo.name = "Halo";
  halo.resize(width * 1.34, height * 1.68);
  halo.x = (width - halo.width) / 2;
  halo.y = (height - halo.height) / 2;
  halo.fills = [solidPaint(0.02)];
  halo.opacity = settings.halo;
  halo.effects = [
    {
      type: "LAYER_BLUR",
      radius: 28 + settings.halo * 120,
      visible: true,
      blendMode: "NORMAL"
    }
  ];
  parent.appendChild(halo);

  const hazeCount = Math.max(0, Math.round(settings.haze * 10));
  for (let i = 0; i < hazeCount; i += 1) {
    const mist = figma.createEllipse();
    const scale = 0.3 + rng() * 0.55;
    mist.resize(width * scale, height * (0.15 + rng() * 0.32));
    mist.x = rng() * width - mist.width * 0.2;
    mist.y = height * (0.1 + rng() * 0.85) - mist.height / 2;
    mist.rotation = -18 + rng() * 36;
    mist.fills = [solidPaint(0.02)];
    mist.opacity = 0.05 + settings.haze * 0.16;
    mist.effects = [
      {
        type: "LAYER_BLUR",
        radius: 12 + rng() * 22,
        visible: true,
        blendMode: "NORMAL"
      }
    ];
    parent.appendChild(mist);
  }
}

function addShadowText(parent, source, textStyle, settings, rng) {
  const cloneCount = Math.max(0, Math.round(settings.cloneLayers));
  for (let i = 0; i < cloneCount; i += 1) {
    const clone = figma.createText();
    clone.name = `Rough Clone ${i + 1}`;
    clone.fontName = textStyle.fontName;
    clone.characters = source.characters;
    clone.fontSize = textStyle.fontSize;
    clone.textCase = textStyle.textCase;
    clone.textDecoration = textStyle.textDecoration;
    clone.letterSpacing = cloneSpacing(textStyle.letterSpacing, settings.tracking);
    clone.lineHeight = cloneLineHeight(textStyle.lineHeight, settings.verticalStretch);
    clone.textAutoResize = "WIDTH_AND_HEIGHT";
    clone.fills = [solidPaint(0.02)];
    clone.opacity = clamp(0.06 + (1 - i / Math.max(1, cloneCount)) * 0.18, 0, 0.28);
    clone.x = randomRange(rng, -settings.cloneSpread, settings.cloneSpread);
    clone.y = randomRange(rng, -settings.cloneSpread, settings.cloneSpread);
    clone.rotation = randomRange(
      rng,
      -8 - settings.chaos * 8,
      8 + settings.chaos * 8
    );
    parent.appendChild(clone);
  }
}

function addBranches(parent, width, height, centerX, centerY, settings, rng) {
  const branchCount = Math.max(4, Math.round(settings.branches));
  for (let i = 0; i < branchCount; i += 1) {
    const progress = i / branchCount;
    const side = progress < 0.5 ? "top" : "bottom";
    const mirrored = rng() < settings.symmetry;
    const xBase = rng() * width;
    const yBase =
      side === "top"
        ? randomRange(rng, -height * 0.08, height * 0.25)
        : randomRange(rng, height * 0.72, height * 1.02);

    createBranchCluster(parent, {
      x: xBase,
      y: yBase,
      side,
      width,
      height,
      centerX,
      centerY,
      settings,
      rng,
      mirrored
    });
  }
}

function createBranchCluster(parent, context) {
  const {
    x,
    y,
    side,
    width,
    height,
    centerX,
    settings,
    rng,
    mirrored
  } = context;

  const segments = 1 + Math.floor(rng() * 3);
  for (let i = 0; i < segments; i += 1) {
    const weight =
      Math.max(1, settings.branchWeight * (0.55 + rng() * 0.85)) *
      (1 - i * 0.16);
    const length =
      settings.branchLength * (0.34 + rng() * 0.92) * (1 - i * 0.12);
    const angleBase = side === "top" ? -90 : 90;
    const pull = x < centerX ? -1 : 1;
    const chaosAngle = randomRange(rng, -50, 50) * settings.chaos;
    const curveAngle = pull * randomRange(rng, 8, 32);
    const angle = angleBase + chaosAngle + curveAngle;
    const segment = createSpike(length, weight, settings.chaos, rng);
    segment.x = x + randomRange(rng, -12, 12);
    segment.y = y + randomRange(rng, -10, 10);
    segment.rotation = angle;
    parent.appendChild(segment);

    if (mirrored) {
      const twin = segment.clone();
      twin.x = width - segment.x - twin.width;
      twin.rotation = -(angle - angleBase) + angleBase;
      parent.appendChild(twin);
    }

    const offshootCount = 1 + Math.floor(rng() * 2);
    for (let j = 0; j < offshootCount; j += 1) {
      const twig = createSpike(length * (0.22 + rng() * 0.26), weight * 0.55, settings.chaos, rng);
      twig.x = segment.x + segment.width * (0.2 + rng() * 0.5);
      twig.y = segment.y + segment.height * (0.2 + rng() * 0.4);
      twig.rotation = angle + randomRange(rng, -65, 65);
      twig.opacity = 0.82;
      parent.appendChild(twig);

      if (mirrored && rng() < 0.7) {
        const twinTwig = twig.clone();
        twinTwig.x = width - twig.x - twinTwig.width;
        twinTwig.rotation = -(twig.rotation - angleBase) + angleBase;
        parent.appendChild(twinTwig);
      }
    }
  }

  if (rng() < settings.symmetry * 0.3) {
    const crown = createSpike(
      settings.branchLength * 0.42,
      settings.branchWeight * 0.8,
      settings.chaos,
      rng
    );
    crown.x = width * 0.5 - crown.width / 2 + randomRange(rng, -14, 14);
    crown.y = side === "top" ? -crown.height * 0.35 : height - crown.height * 0.1;
    crown.rotation = side === "top" ? randomRange(rng, -16, 16) : 180 + randomRange(rng, -16, 16);
    parent.appendChild(crown);
  }
}

function createSpike(length, thickness, chaos, rng) {
  const spike = figma.createRectangle();
  spike.resize(Math.max(4, length), Math.max(1, thickness));
  spike.cornerRadius = Math.max(0.4, thickness * 0.46);
  spike.fills = [solidPaint(0.02)];
  spike.opacity = clamp(0.74 + chaos * 0.16 + rng() * 0.12, 0.72, 1);
  spike.effects = [
    {
      type: "DROP_SHADOW",
      color: { r: 0, g: 0, b: 0, a: 0.1 + chaos * 0.12 },
      offset: { x: 0, y: 0 },
      radius: 2 + chaos * 6,
      spread: 0,
      visible: true,
      blendMode: "NORMAL"
    }
  ];
  return spike;
}

function addDrips(parent, width, height, settings, rng) {
  const dripCount = Math.max(0, Math.round(settings.drips));
  for (let i = 0; i < dripCount; i += 1) {
    const drip = figma.createRectangle();
    const dripHeight = settings.dripLength * (0.25 + rng() * 1.35);
    const dripWidth = Math.max(1.5, settings.branchWeight * (0.28 + rng() * 0.35));
    drip.resize(dripWidth, dripHeight);
    drip.cornerRadius = dripWidth / 2;
    drip.fills = [solidPaint(0.02)];
    drip.opacity = 0.5 + rng() * 0.28;
    drip.x = rng() * width;
    drip.y = height * 0.82 + rng() * (height * 0.26);
    drip.rotation = randomRange(rng, -9, 9);
    parent.appendChild(drip);

    if (rng() < 0.55) {
      const bulb = figma.createEllipse();
      bulb.resize(dripWidth * (1.4 + rng() * 1.4), dripWidth * (1.4 + rng() * 1.4));
      bulb.x = drip.x - (bulb.width - dripWidth) / 2;
      bulb.y = drip.y + dripHeight - bulb.height * 0.65;
      bulb.fills = [solidPaint(0.02)];
      bulb.opacity = drip.opacity;
      parent.appendChild(bulb);
    }
  }
}

function addFrost(parent, width, height, settings, rng) {
  const count = Math.max(0, Math.round(settings.frost * 28));
  for (let i = 0; i < count; i += 1) {
    const crystal = figma.createRectangle();
    const size = 3 + rng() * 9;
    crystal.resize(size, Math.max(1, size * 0.24));
    crystal.cornerRadius = size * 0.12;
    crystal.fills = [solidColor(0.92, 0.92, 0.92)];
    crystal.opacity = 0.08 + rng() * settings.frost * 0.25;
    crystal.x = rng() * width;
    crystal.y = randomRange(rng, -height * 0.08, height * 1.1);
    crystal.rotation = rng() * 360;
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
