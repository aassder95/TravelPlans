import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const overlayPath = path.join(root, "assets", "maps", "city-overlays.json");
const provinceMapPath = path.join(root, "assets", "maps", "korea-provinces.svg");
const sourceBaseUrl = "https://raw.githubusercontent.com/statgarten/maps/main/svg";
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

function pathBounds(pathDataList) {
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  pathDataList.forEach(pathData => {
    let coordinateIndex = 0;
    for (const match of pathData.matchAll(/-?\d+(?:\.\d+)?/g)) {
      const value = Number(match[0]);
      if (coordinateIndex++ % 2 === 0) {
        bounds.minX = Math.min(bounds.minX, value);
        bounds.maxX = Math.max(bounds.maxX, value);
      } else {
        bounds.minY = Math.min(bounds.minY, value);
        bounds.maxY = Math.max(bounds.maxY, value);
      }
    }
  });
  return bounds;
}

function transformPath(pathData, sourceBounds, targetBounds) {
  const scaleX = (targetBounds.maxX - targetBounds.minX) / (sourceBounds.maxX - sourceBounds.minX);
  const scaleY = (targetBounds.maxY - targetBounds.minY) / (sourceBounds.maxY - sourceBounds.minY);
  let coordinateIndex = 0;
  return pathData.replace(/-?\d+(?:\.\d+)?/g, value => {
    const source = Number(value);
    const target = coordinateIndex++ % 2 === 0
      ? targetBounds.minX + (source - sourceBounds.minX) * scaleX
      : targetBounds.minY + (source - sourceBounds.minY) * scaleY;
    return Number(target.toFixed(2)).toString();
  });
}

async function fetchCityMap(provinceId) {
  const fileName = `${provinceId}_시군구_경계.svg`;
  const response = await fetch(`${sourceBaseUrl}/${encodeURIComponent(fileName)}`);
  if (!response.ok)
    throw new Error(`${fileName} 다운로드 실패: ${response.status}`);
  return response.text();
}

const overlayData = JSON.parse(await fs.readFile(overlayPath, "utf8"));
const provincePaths = new Map(parsePaths(await fs.readFile(provinceMapPath, "utf8")).map(item => [item.id, item.d]));

for (const region of overlayData.regions) {
  const sourcePaths = parsePaths(await fetchCityMap(region.provinceId));
  const provincePath = provincePaths.get(region.provinceId);
  if (!provincePath)
    throw new Error(`전국 지도에서 ${region.provinceId} 경계를 찾지 못했습니다.`);
  const sourceBounds = pathBounds(sourcePaths.map(item => item.d));
  const targetBounds = pathBounds([provincePath]);
  region.paths = sourcePaths.map(item => ({
    id: item.id,
    d: transformPath(item.d, sourceBounds, targetBounds)
  }));
  region.viewBox = targetViewBox;
}

overlayData.version = 3;
overlayData.coordinateSpace = "national";
await fs.writeFile(overlayPath, `${JSON.stringify(overlayData, null, 2)}\n`, "utf8");
console.log(`시군구 ${overlayData.regions.reduce((count, region) => count + region.paths.length, 0)}개를 전국 좌표계로 정렬했습니다.`);
