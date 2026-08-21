import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateManifest, validateTrip } from "../assets/js/trip-model.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "data", "trips.json");

try {
  const manifest = validateManifest(JSON.parse(await fs.readFile(manifestPath, "utf8")));
  for (const entry of manifest.trips) {
    const tripPath = path.resolve(path.dirname(manifestPath), entry.file);
    if (!tripPath.startsWith(path.join(root, "data", "trips") + path.sep))
      throw new Error(`여행 데이터 경로가 data/trips 밖을 가리킵니다: ${entry.file}`);
    validateTrip(JSON.parse(await fs.readFile(tripPath, "utf8")), entry.id);
    console.log(`✓ ${entry.id}`);
  }
  console.log(`여행 데이터 ${manifest.trips.length}개 검증 완료`);
} catch (error) {
  console.error(`✗ ${error.message}`);
  process.exitCode = 1;
}
