import { validateFootprints, validateManifest, validateTrip } from "./trip-model.js";

export async function loadTrips() {
  const manifestUrl = new URL("../../data/trips.json", import.meta.url);
  const response = await fetch(manifestUrl, { cache: "no-store" });
  if (!response.ok)
    throw new Error(`여행 목록을 불러오지 못했습니다. (HTTP ${response.status})`);

  const manifest = validateManifest(await response.json());
  return Promise.all(manifest.trips.map(async entry => {
    const tripUrl = new URL(entry.file, manifestUrl);
    const tripResponse = await fetch(tripUrl, { cache: "no-store" });
    if (!tripResponse.ok)
      throw new Error(`${entry.id} 일정을 불러오지 못했습니다. (HTTP ${tripResponse.status})`);
    const trip = validateTrip(await tripResponse.json(), entry.id);
    return {
      ...trip,
      days: trip.days.map(plan => ({ ...plan, region: trip.region }))
    };
  }));
}

export async function loadFootprints() {
  const url = new URL("../../data/footprints.json", import.meta.url);
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok)
    throw new Error(`발자국을 불러오지 못했습니다. (HTTP ${response.status})`);
  return validateFootprints(await response.json());
}
