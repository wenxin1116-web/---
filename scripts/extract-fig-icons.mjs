import { readFileSync, writeFileSync } from "node:fs";
import { getBlobBytes, nodeId, parseFig, parseVectorNetworkBlob, resolveVectorNodePaths } from "openfig-core";

const sourceName = "图标库，保留可编辑.fig";
const source = new URL(`../${sourceName}`, import.meta.url);
const output = new URL("../app/icon-data.ts", import.meta.url);
const doc = parseFig(new Uint8Array(readFileSync(source)));

// Each category comes directly from a top-level Figma artboard.
const roots = [
  ["1:11", "通用线性图标", 24, false],
  ["1:2714", "硬件线性图标", 24, false],
  ["1:3064", "清洁类图标", 24, false],
  ["1:5905", "产品品类图标", 24, false],
  ["1:1154", "新工厂大楼实验室标识", 24, false],
  ["1:5454", "硬件小图标", 24, false],
  ["1:7110", "线性+色块图标", 60, true],
];

const badName = /^(Group|Frame|编组|图层|尺寸标注|Rectangle|Vector|Ellipse|路径|直线|形状|清洁液\/自清洁$)/i;
const fmt = (n) => Number(n.toFixed(4));
const matrix = (t) => t ? `matrix(${fmt(t.m00)} ${fmt(t.m10)} ${fmt(t.m01)} ${fmt(t.m11)} ${fmt(t.m02)} ${fmt(t.m12)})` : "";

function colorFromPaint(paints, fallback = "currentColor") {
  const paint = paints?.find((item) => item.visible !== false && item.opacity !== 0 && item.type === "SOLID");
  if (!paint?.color) return fallback;
  const channel = (value) => Math.round(Math.max(0, Math.min(1, value)) * 255).toString(16).padStart(2, "0");
  return `#${channel(paint.color.r)}${channel(paint.color.g)}${channel(paint.color.b)}`;
}

function editableStroke(node, preserveColor) {
  const blobIndex = node.vectorData?.vectorNetworkBlob;
  if (blobIndex == null || !node.strokePaints?.some((paint) => paint.visible !== false && paint.opacity !== 0)) return "";
  const bytes = getBlobBytes(doc, blobIndex);
  if (!bytes) return "";
  let network;
  try { network = parseVectorNetworkBlob(bytes); } catch { return ""; }
  const used = new Set();
  const paths = [];
  const segmentPath = (indices, close) => {
    if (!indices.length) return "";
    const oriented = [];
    let previousEnd = null;
    for (const index of indices) {
      const segment = network.segments[index];
      const reverse = previousEnd !== null && segment.start.vertex !== previousEnd && segment.end.vertex === previousEnd;
      oriented.push({ index, segment, reverse });
      previousEnd = reverse ? segment.start.vertex : segment.end.vertex;
    }
    const first = oriented[0];
    const startIndex = first.reverse ? first.segment.end.vertex : first.segment.start.vertex;
    const start = network.vertices[startIndex];
    let d = `M${fmt(start.x)} ${fmt(start.y)}`;
    for (const { index, segment, reverse } of oriented) {
      used.add(index);
      const a = network.vertices[reverse ? segment.end.vertex : segment.start.vertex];
      const b = network.vertices[reverse ? segment.start.vertex : segment.end.vertex];
      if (segment.isStraight) d += `L${fmt(b.x)} ${fmt(b.y)}`;
      else {
        const startHandle = reverse ? segment.end : segment.start;
        const endHandle = reverse ? segment.start : segment.end;
        d += `C${fmt(a.x + startHandle.dx)} ${fmt(a.y + startHandle.dy)} ${fmt(b.x + endHandle.dx)} ${fmt(b.y + endHandle.dy)} ${fmt(b.x)} ${fmt(b.y)}`;
      }
    }
    return d + (close ? "Z" : "");
  };
  for (const region of network.regions ?? []) for (const loop of region.loops ?? []) paths.push(segmentPath(loop, true));
  network.segments.forEach((_, index) => { if (!used.has(index)) paths.push(segmentPath([index], false)); });
  if (!paths.length) return "";
  const normalized = node.vectorData?.normalizedSize;
  const sx = normalized?.x ? (node.size?.x ?? normalized.x) / normalized.x : 1;
  const sy = normalized?.y ? (node.size?.y ?? normalized.y) / normalized.y : 1;
  const cap = String(node.strokeCap ?? "ROUND").toLowerCase();
  const join = String(node.strokeJoin ?? "ROUND").toLowerCase();
  const width = fmt(node.strokeWeight ?? 1.42);
  const color = preserveColor ? colorFromPaint(node.strokePaints) : "currentColor";
  return `<g transform="scale(${fmt(sx)} ${fmt(sy)})"><path d="${paths.join("")}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="${cap}" stroke-linejoin="${join}" vector-effect="non-scaling-stroke"/></g>`;
}

function renderNode(node, preserveColor) {
  if (node.visible === false || node.opacity === 0) return "";
  const pieces = [];
  const stroke = editableStroke(node, preserveColor);
  if (stroke) pieces.push(stroke);
  try {
    const geometry = resolveVectorNodePaths(doc, node);
    for (const item of geometry.fill) {
      if (!item.svgPath || !item.paints?.some((paint) => paint.visible !== false && paint.opacity !== 0)) continue;
      const rule = item.windingRule === "EVENODD" ? ' fill-rule="evenodd" clip-rule="evenodd"' : "";
      pieces.push(`<path d="${item.svgPath}" fill="${preserveColor ? colorFromPaint(item.paints) : "currentColor"}"${rule}/>`);
    }
    // Fallback for nodes whose editable vector network cannot be decoded.
    if (!stroke) for (const item of geometry.stroke) if (item.svgPath) pieces.push(`<path d="${item.svgPath}" fill="currentColor"/>`);
  } catch {}
  const children = (doc.childrenMap.get(nodeId(node)) ?? []).map((child) => renderNode(child, preserveColor)).join("");
  const body = pieces.join("") + children;
  if (!body) return "";
  const transform = matrix(node.transform);
  return transform ? `<g transform="${transform}">${body}</g>` : body;
}

const seen = new Set();
const icons = [];
for (const [rootId, category, iconSize, preserveColor] of roots) {
  function visit(id) {
    for (const node of doc.childrenMap.get(id) ?? []) {
      const isIcon = node.type === "FRAME" && Math.abs((node.size?.x ?? 0) - iconSize) < 0.6 && Math.abs((node.size?.y ?? 0) - iconSize) < 0.6 && node.name && !badName.test(node.name);
      if (isIcon) {
        const key = `${category}:${node.name}`;
        if (!seen.has(key)) {
          seen.add(key);
          const body = (doc.childrenMap.get(nodeId(node)) ?? []).map((child) => renderNode(child, preserveColor)).join("");
          const scaledBody = iconSize === 24 ? body : `<g transform="scale(${24 / iconSize})">${body}</g>`;
          if (body) icons.push({ id: `dm-${String(icons.length + 1).padStart(3, "0")}`, name: node.name, category, tags: [category, node.name, "德尔玛", "Figma", "可编辑", preserveColor ? "双色" : "单色"], svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${scaledBody}</svg>` });
        }
        continue;
      }
      visit(nodeId(node));
    }
  }
  visit(rootId);
}

const categories = [...new Set(roots.map(([, category]) => category))].filter((category) => icons.some((icon) => icon.category === category));
const file = `// Generated from ${sourceName}. Run scripts/extract-fig-icons.mjs to refresh.\n\n` +
  `export const categories = ${JSON.stringify(categories, null, 2)} as const;\n\n` +
  `export type IconCategory = (typeof categories)[number];\n` +
  `export type IconData = { id: string; name: string; category: IconCategory; tags: string[]; svg: string };\n\n` +
  `export const icons: IconData[] = ${JSON.stringify(icons, null, 2)};\n`;

writeFileSync(output, file);
console.log(`Extracted ${icons.length} editable icons in ${categories.length} Figma artboard categories.`);
