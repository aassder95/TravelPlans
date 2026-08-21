import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateFootprints, validateManifest, validateTrip } from "../assets/js/trip-model.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "data", "trips.json");

try {
  const manifest = validateManifest(JSON.parse(await fs.readFile(manifestPath, "utf8")));
  const footprints = validateFootprints(JSON.parse(await fs.readFile(path.join(root, "data", "footprints.json"), "utf8")));
  const mapData = JSON.parse(await fs.readFile(path.join(root, "assets", "maps", "city-overlays.json"), "utf8"));
  if (mapData.version !== 3 || mapData.coordinateSpace !== "national" || !Array.isArray(mapData.regions) || mapData.regions.length !== 17)
    throw new Error("홈 시군구 지도 데이터가 올바르지 않습니다.");
  const boundaryCount = mapData.regions.reduce((count, region) => {
    if (!region.provinceId
      || JSON.stringify(region.viewBox) !== JSON.stringify([0, 0, 800, 759])
      || !Array.isArray(region.paths)
      || region.paths.length === 0)
      throw new Error(`홈 지도 행정구역이 비어 있습니다: ${region.provinceId ?? "이름 없음"}`);
    return count + region.paths.length;
  }, 0);
  const footprintCityIds = new Set(footprints.cities.map(city => city.id));
  for (const entry of manifest.trips) {
    const tripPath = path.resolve(path.dirname(manifestPath), entry.file);
    if (!tripPath.startsWith(path.join(root, "data", "trips") + path.sep))
      throw new Error(`여행 데이터 경로가 data/trips 밖을 가리킵니다: ${entry.file}`);
    const trip = validateTrip(JSON.parse(await fs.readFile(tripPath, "utf8")), entry.id);
    trip.footprintCities.forEach(cityId => {
      if (!footprintCityIds.has(cityId))
        throw new Error(`${entry.id}가 없는 발자국 도시를 참조합니다: ${cityId}`);
    });
    console.log(`✓ ${entry.id}`);
  }
  console.log(`여행 데이터 ${manifest.trips.length}개, 발자국 ${footprints.records.length}개, 시군구 경계 ${boundaryCount}개 검증 완료`);
} catch (error) {
  console.error(`✗ ${error.message}`);
  process.exitCode = 1;
}
