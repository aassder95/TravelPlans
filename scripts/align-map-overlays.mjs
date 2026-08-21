import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const overlayPath = path.join(root, "assets", "maps", "city-overlays.json");
const provinceMapPath = path.join(root, "assets", "maps", "korea-provinces.svg");
const sourceRoot = "https://raw.githubusercontent.com/statgarten/maps/main";
const targetViewBox = [0, 0, 800, 759];

function parsePaths(svg) {
  return [...svg.matchAll(/<path\b[^>]*>/g)].map(match => {
    const tag = match[0];
    return {
      id: tag.match(/\bid="([^"]+)"/)?.[1],
      d: tag.match(/\bd="([^"]+)"/)?.[1]
    };
  }).filter(item => item.id && item.d);
}

function pathBounds(pathData) {
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  let coordinateIndex = 0;
  for (const match of pathData.matchAll(/-?\d+(?:\.\d+)?/g)) {
    const value = Number(match[0]);
    if (coordinateIndex++ % 2 === 0) {
      bounds[0] = Math.min(bounds[0], value);
      bounds[2] = Math.max(bounds[2], value);
    } else {
      bounds[1] = Math.min(bounds[1], value);
      bounds[3] = Math.max(bounds[3], value);
    }
  }
  return bounds;
}

function updateGeometryBounds(coordinates, bounds) {
  if (typeof coordinates[0] === "number") {
    bounds[0] = Math.min(bounds[0], coordinates[0]);
    bounds[1] = Math.min(bounds[1], coordinates[1]);
    bounds[2] = Math.max(bounds[2], coordinates[0]);
    bounds[3] = Math.max(bounds[3], coordinates[1]);
    return;
  }
  coordinates.forEach(child => updateGeometryBounds(child, bounds));
}

function geometryBounds(feature) {
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  updateGeometryBounds(feature.geometry.coordinates, bounds);
  return bounds;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function deriveProjection(features, paths) {
  const pathById = new Map(paths.map(item => [item.id, item.d]));
  const pairs = features.flatMap(feature => {
    const pathData = pathById.get(feature.properties.title);
    return pathData ? [{ raw: geometryBounds(feature), svg: pathBounds(pathData) }] : [];
  });
  const scaleCandidates = [];
  pairs.forEach(({ raw, svg }) => {
    const rawWidth = raw[2] - raw[0];
    const rawHeight = raw[3] - raw[1];
    if (rawWidth > 100 && svg[2] - svg[0] > 0.1)
      scaleCandidates.push((svg[2] - svg[0]) / rawWidth);
    if (rawHeight > 100 && svg[3] - svg[1] > 0.1)
      scaleCandidates.push((svg[3] - svg[1]) / rawHeight);
  });
  const scale = median(scaleCandidates);
  const translateX = median(pairs.flatMap(({ raw, svg }) => [
    svg[0] - raw[0] * scale,
    svg[2] - raw[2] * scale
  ]));
  const translateY = median(pairs.flatMap(({ raw, svg }) => [
    svg[1] + raw[3] * scale,
    svg[3] + raw[1] * scale
  ]));
  return { scale, translateX, translateY };
}

function transformPath(pathData, source, target) {
  let coordinateIndex = 0;
  return pathData.replace(/-?\d+(?:\.\d+)?/g, value => {
    const sourceValue = Number(value);
    const isX = coordinateIndex++ % 2 === 0;
    const rawValue = isX
      ? (sourceValue - source.translateX) / source.scale
      : (source.translateY - sourceValue) / source.scale;
    const targetValue = isX
      ? rawValue * target.scale + target.translateX
      : target.translateY - rawValue * target.scale;
    return Number(targetValue.toFixed(2)).toString();
  });
}

async function fetchSource(relativePath) {
  const response = await fetch(`${sourceRoot}/${relativePath.split("/").map(encodeURIComponent).join("/")}`);
  if (!response.ok)
    throw new Error(`${relativePath} 다운로드 실패: ${response.status}`);
  return response;
}

const overlayData = JSON.parse(await fs.readFile(overlayPath, "utf8"));
const nationalPaths = parsePaths(await fs.readFile(provinceMapPath, "utf8"));
const nationalFeatures = (await (await fetchSource("json/전국_시도_경계.json")).json()).features;
const nationalProjection = deriveProjection(nationalFeatures, nationalPaths);

for (const region of overlayData.regions) {
  const fileBase = `${region.provinceId}_시군구_경계`;
  const [sourceSvg, sourceGeoJson] = await Promise.all([
    (await fetchSource(`svg/simple/${fileBase}.svg`)).text(),
    (await fetchSource(`json/${fileBase}.json`)).json()
  ]);
  const sourcePaths = parsePaths(sourceSvg);
  const sourceProjection = deriveProjection(sourceGeoJson.features, sourcePaths);
  region.paths = sourcePaths.map(item => ({
    id: item.id,
    d: transformPath(item.d, sourceProjection, nationalProjection)
  }));
  region.viewBox = targetViewBox;
}

overlayData.version = 3;
overlayData.coordinateSpace = "national";
await fs.writeFile(overlayPath, `${JSON.stringify(overlayData, null, 2)}\n`, "utf8");
console.log(`시군구 ${overlayData.regions.reduce((count, region) => count + region.paths.length, 0)}개를 전국 좌표계로 정렬했습니다.`);
