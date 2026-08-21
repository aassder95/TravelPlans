import { createNaverMapLink } from "./schedule.js";
import { visitIndexMap, visitMap, visitRowIndexes } from "./trip-model.js";

const map = L.map("route-map", { zoomControl: true });
const routeLayers = L.layerGroup().addTo(map);
const mapPlaceCard = document.getElementById("map-place-card");
let routeRequestId = 0;
const roadRouteCache = new Map();
const dayDistanceCache = new Map();

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors"
}).addTo(map);

function segmentLocations(plan, segment) {
  const visits = visitMap(plan);
  return segment.visits.map(id => {
    const visit = visits.get(id);
    return [visit.lng, visit.lat];
  });
}

function distanceBetween([lat1, lon1], [lat2, lon2]) {
  const toRadians = value => value * Math.PI / 180;
  const earthRadius = 6371000;
  const latDelta = toRadians(lat2 - lat1);
  const lonDelta = toRadians(lon2 - lon1);
  const a = Math.sin(latDelta / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(lonDelta / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(a));
}

function polylineDistance(locations) {
  return locations.slice(1).reduce((total, location, index) => total + distanceBetween(locations[index], location), 0);
}

function loadRoadRoute(plan, segment) {
  const locations = segmentLocations(plan, segment);
  const routeLocations = locations.map(([lng, lat]) => [lat, lng]);
  if (segment.mode === "cable")
    return Promise.resolve({ locations: routeLocations, distanceMeters: polylineDistance(routeLocations) });

  const server = segment.mode === "foot"
    ? "https://routing.openstreetmap.de/routed-foot"
    : "https://router.project-osrm.org";
  const coordinates = locations.map(([lng, lat]) => `${lng},${lat}`).join(";");
  const cacheKey = `${server}|${coordinates}`;
  if (roadRouteCache.has(cacheKey))
    return roadRouteCache.get(cacheKey);

  const request = fetch(`${server}/route/v1/driving/${coordinates}?overview=full&geometries=geojson`)
    .then(response => {
      if (!response.ok)
        throw new Error(`경로 서버 응답 오류: ${response.status}`);
      return response.json();
    })
    .then(data => {
      if (data.code !== "Ok" || !data.routes?.[0]?.geometry?.coordinates)
        throw new Error(data.message || "경로를 찾지 못했습니다.");
      return {
        locations: data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]),
        distanceMeters: data.routes[0].distance
      };
    })
    .catch(error => {
      roadRouteCache.delete(cacheKey);
      throw error;
    });
  roadRouteCache.set(cacheKey, request);
  return request;
}

export function calculateDayDistance(plan) {
  if (dayDistanceCache.has(plan))
    return dayDistanceCache.get(plan);

  const segmentsById = new Map(plan.segments.map(segment => [segment.id, segment]));
  const routes = plan.distanceRoutes?.map(route => route.map(id => segmentsById.get(id))) ?? [plan.segments];
  const request = Promise.all(routes.map(segments =>
    Promise.allSettled(segments.map(segment => loadRoadRoute(plan, segment)))
      .then(results => results.reduce((total, result, index) => {
        if (result.status === "fulfilled")
          return total + result.value.distanceMeters;
        const fallback = segmentLocations(plan, segments[index]).map(([lng, lat]) => [lat, lng]);
        return total + polylineDistance(fallback);
      }, 0))
  )).then(distances => ({ min: Math.min(...distances), max: Math.max(...distances) }));

  dayDistanceCache.set(plan, request);
  return request;
}

export function formatDistance(distanceRange, fractionDigits = 1) {
  const representativeDistance = (distanceRange.min + distanceRange.max) / 2;
  return `${(representativeDistance / 1000).toFixed(fractionDigits)}km`;
}

function filteredSegments(plan, startIdx, endIdx) {
  if (startIdx === 0 && endIdx === plan.visits.length - 1)
    return plan.segments;

  const indexes = visitIndexMap(plan);
  const segments = [];
  plan.segments.forEach(segment => {
    let run = [];
    for (let index = 0; index < segment.visits.length - 1; index++) {
      const startId = segment.visits[index];
      const endId = segment.visits[index + 1];
      const start = indexes.get(startId);
      const end = indexes.get(endId);
      const isSelected = start >= startIdx && end <= endIdx && start < end;
      if (isSelected) {
        if (run.length === 0)
          run.push(startId);
        run.push(endId);
      } else if (run.length > 0) {
        segments.push({ ...segment, visits: run });
        run = [];
      }
    }
    if (run.length > 0)
      segments.push({ ...segment, visits: run });
  });
  return segments;
}

export async function drawMap(plan, startIdx, endIdx) {
  const requestId = ++routeRequestId;
  const status = document.getElementById("route-status");
  const bounds = L.latLngBounds();
  const segments = filteredSegments(plan, startIdx, endIdx);
  routeLayers.clearLayers();
  mapPlaceCard.hidden = true;
  status.hidden = true;
  status.textContent = "";

  const visibleLocations = new Map();
  plan.visits.forEach((visit, index) => {
    if (index < startIdx || index > endIdx)
      return;

    const locationKey = `${visit.lng},${visit.lat}`;
    if (!visibleLocations.has(locationKey))
      visibleLocations.set(locationKey, { lng: visit.lng, lat: visit.lat, names: [], indexes: [] });
    const location = visibleLocations.get(locationKey);
    location.names.push(visit.name);
    location.indexes.push(index);
    bounds.extend([visit.lat, visit.lng]);
  });

  visibleLocations.forEach(({ lng, lat, names, indexes }) => {
    const isCombined = indexes.length > 1;
    const isEndpoint = indexes.includes(startIdx) || indexes.includes(endIdx);
    const width = isCombined ? 42 : 30;
    const numbers = indexes.map(index => index + 1).join("·");
    const labels = [...new Set(names)].join(" / ");
    const directionIndex = indexes[0];
    const icon = L.divIcon({
      className: "",
      html: `<span class="route-pin${isCombined ? " is-combined" : ""}" style="--pin-color:${plan.color}">${numbers}</span>`,
      iconSize: [width, 30],
      iconAnchor: [width / 2, 15]
    });
    const marker = L.marker([lat, lng], { icon }).bindTooltip(labels, {
      permanent: isEndpoint,
      direction: directionIndex % 2 ? "bottom" : "top",
      className: "place-label",
      offset: [0, directionIndex % 2 ? 12 : -12]
    });
    marker.on("click", () => {
      marker.openTooltip();
      showMapPlaceCard(plan, indexes);
    });
    marker.addTo(routeLayers);
  });

  map.fitBounds(bounds, { padding: [45, 45], maxZoom: 15 });
  setTimeout(() => map.invalidateSize(), 0);

  if (segments.length === 0) {
    status.textContent = "선택한 번호 사이에 이어지는 동선이 없습니다.";
    status.hidden = false;
    return;
  }

  const results = await Promise.allSettled(segments.map(segment => loadRoadRoute(plan, segment)));
  if (requestId !== routeRequestId)
    return;

  let failureCount = 0;
  results.forEach((result, index) => {
    const segment = segments[index];
    let locations;
    if (result.status === "fulfilled")
      locations = result.value.locations;
    else {
      failureCount++;
      locations = segmentLocations(plan, segment).map(([lng, lat]) => [lat, lng]);
    }

    L.polyline(locations, {
      color: plan.color,
      weight: segment.mode === "foot" ? 5 : 6,
      opacity: .88,
      dashArray: segment.mode === "foot" ? "3 9" : segment.mode === "cable" ? "12 9" : null,
      lineCap: "round",
      lineJoin: "round"
    }).addTo(routeLayers);
  });

  if (failureCount > 0) {
    status.textContent = `일부 경로 ${failureCount}개를 불러오지 못해 해당 구간만 직선으로 표시했습니다.`;
    status.hidden = false;
  }
}

function showMapPlaceCard(plan, indexes) {
  const names = [...new Set(indexes.map(index => plan.visits[index].name))];
  const rowIndexes = visitRowIndexes(plan);
  const heading = document.getElementById("map-place-name");
  const details = document.getElementById("map-place-details");
  const link = createNaverMapLink(plan, names[0]);
  link.classList.add("map-place-name");
  link.textContent = names.join(" / ");
  link.id = "map-place-name";
  link.setAttribute("aria-label", `${names.join(" / ")} 네이버지도에서 열기`);
  heading.replaceWith(link);
  document.getElementById("map-place-number").textContent = indexes.map(index => index + 1).join("·");
  details.replaceChildren();

  indexes.forEach(index => {
    const row = plan.rows[rowIndexes[index]];
    if (!row)
      return;
    const detail = document.createElement("span");
    detail.className = "map-place-detail";
    detail.textContent = `${index + 1}. ${[row.time, row.activity, row.note].filter(Boolean).join(" · ")}`;
    details.append(detail);
  });
  mapPlaceCard.hidden = false;
}

export function invalidateMapSize() {
  map.invalidateSize();
}

map.on("click", () => {
  mapPlaceCard.hidden = true;
});
