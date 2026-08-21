const allowedSegmentModes = new Set(["drive", "foot", "cable"]);
const allowedRowTypes = new Set(["stay", "move", "travel"]);

function assert(condition, message) {
  if (!condition)
    throw new Error(message);
}

function isText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateManifest(manifest) {
  assert(manifest?.version === 1, "지원하지 않는 여행 목록 버전입니다.");
  assert(Array.isArray(manifest.trips) && manifest.trips.length > 0, "여행 목록이 비어 있습니다.");

  const ids = new Set();
  manifest.trips.forEach((entry, index) => {
    const path = `trips[${index}]`;
    assert(isText(entry?.id), `${path}.id가 필요합니다.`);
    assert(isText(entry?.file), `${path}.file이 필요합니다.`);
    assert(!ids.has(entry.id), `중복된 여행 id입니다: ${entry.id}`);
    ids.add(entry.id);
  });
  return manifest;
}

export function validateTrip(trip, expectedId = trip?.id) {
  assert(trip?.version === 2, `지원하지 않는 여행 데이터 버전입니다: ${expectedId}`);
  assert(isText(trip.id) && trip.id === expectedId, `여행 id가 목록과 다릅니다: ${expectedId}`);
  assert(isText(trip.tab), `${expectedId}.tab이 필요합니다.`);
  assert(isText(trip.region), `${expectedId}.region이 필요합니다.`);
  assert(isText(trip.dateRange), `${expectedId}.dateRange가 필요합니다.`);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(trip.startDate), `${expectedId}.startDate 형식이 올바르지 않습니다.`);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(trip.endDate), `${expectedId}.endDate 형식이 올바르지 않습니다.`);
  assert(trip.startDate <= trip.endDate, `${expectedId}의 여행 날짜 범위가 올바르지 않습니다.`);
  assert(Array.isArray(trip.footprintCities) && trip.footprintCities.every(isText), `${expectedId}.footprintCities가 필요합니다.`);
  assert(isText(trip.color), `${expectedId}.color가 필요합니다.`);
  assert(Array.isArray(trip.days) && trip.days.length > 0, `${expectedId}.days가 비어 있습니다.`);

  const dates = new Set();
  trip.days.forEach((plan, index) => {
    validateDay(plan, `${expectedId}/days[${index}]`);
    assert(!dates.has(plan.isoDate), `${expectedId}에 중복된 날짜가 있습니다: ${plan.isoDate}`);
    dates.add(plan.isoDate);
  });
  return trip;
}

export function validateFootprints(data) {
  assert(data?.version === 1, "지원하지 않는 발자국 데이터 버전입니다.");
  assert(Array.isArray(data.records), "발자국 records가 필요합니다.");
  assert(Array.isArray(data.cities), "발자국 cities가 필요합니다.");

  const cityIds = new Set();
  data.cities.forEach((city, index) => {
    const path = `cities[${index}]`;
    assert(isText(city?.id), `${path}.id가 필요합니다.`);
    assert(isText(city?.name), `${path}.name이 필요합니다.`);
    assert(!cityIds.has(city.id), `중복된 도시 id입니다: ${city.id}`);
    cityIds.add(city.id);
  });

  const recordIds = new Set();
  data.records.forEach((record, index) => {
    const path = `records[${index}]`;
    assert(isText(record?.id), `${path}.id가 필요합니다.`);
    assert(isText(record?.label), `${path}.label이 필요합니다.`);
    assert(record.country === "KR" || record.country === "JP", `${path}.country가 올바르지 않습니다.`);
    assert(Array.isArray(record.cities) && record.cities.length > 0, `${path}.cities가 비어 있습니다.`);
    record.cities.forEach(cityId => assert(cityIds.has(cityId), `${path}가 없는 도시를 참조합니다: ${cityId}`));
    assert(!recordIds.has(record.id), `중복된 발자국 id입니다: ${record.id}`);
    recordIds.add(record.id);

    const hasStart = isText(record.startDate);
    const hasEnd = isText(record.endDate);
    assert(hasStart === hasEnd, `${path}의 시작일과 종료일은 함께 작성해야 합니다.`);
    if (hasStart) {
      assert(/^\d{4}-\d{2}-\d{2}$/.test(record.startDate), `${path}.startDate 형식이 올바르지 않습니다.`);
      assert(/^\d{4}-\d{2}-\d{2}$/.test(record.endDate), `${path}.endDate 형식이 올바르지 않습니다.`);
      assert(record.startDate <= record.endDate, `${path}의 날짜 범위가 올바르지 않습니다.`);
    }
  });
  return data;
}

function validateDay(plan, path) {
  ["isoDate", "date", "day", "theme", "color", "summary", "note"].forEach(key => {
    assert(typeof plan?.[key] === "string", `${path}.${key}가 필요합니다.`);
  });
  assert(/^\d{4}-\d{2}-\d{2}$/.test(plan.isoDate), `${path}.isoDate 형식이 올바르지 않습니다.`);
  assert(Array.isArray(plan.visits) && plan.visits.length >= 2, `${path}.visits는 두 곳 이상이어야 합니다.`);
  assert(Array.isArray(plan.segments), `${path}.segments가 필요합니다.`);
  assert(Array.isArray(plan.rows) && plan.rows.length > 0, `${path}.rows가 비어 있습니다.`);

  const visitIds = new Set();
  plan.visits.forEach((visit, index) => {
    const visitPath = `${path}.visits[${index}]`;
    assert(isText(visit?.id), `${visitPath}.id가 필요합니다.`);
    assert(!visitIds.has(visit.id), `${path}에 중복된 방문 id가 있습니다: ${visit.id}`);
    assert(isText(visit.name), `${visitPath}.name이 필요합니다.`);
    assert(Number.isFinite(visit.lng) && Number.isFinite(visit.lat), `${visitPath} 좌표가 올바르지 않습니다.`);
    visitIds.add(visit.id);
  });
  const visitOrder = new Map(plan.visits.map((visit, index) => [visit.id, index]));

  const segmentIds = new Set();
  plan.segments.forEach((segment, index) => {
    const segmentPath = `${path}.segments[${index}]`;
    assert(isText(segment?.id), `${segmentPath}.id가 필요합니다.`);
    assert(!segmentIds.has(segment.id), `${path}에 중복된 구간 id가 있습니다: ${segment.id}`);
    assert(allowedSegmentModes.has(segment.mode), `${segmentPath}.mode가 올바르지 않습니다.`);
    assert(Array.isArray(segment.visits) && segment.visits.length >= 2, `${segmentPath}.visits는 두 곳 이상이어야 합니다.`);
    segment.visits.forEach(id => assert(visitIds.has(id), `${segmentPath}에 없는 방문 id가 있습니다: ${id}`));
    segment.visits.slice(1).forEach((id, visitIndex) => {
      const previousId = segment.visits[visitIndex];
      assert(visitOrder.get(previousId) < visitOrder.get(id), `${segmentPath} 방문 순서는 하루 동선의 앞에서 뒤로 이어져야 합니다.`);
    });
    segmentIds.add(segment.id);
  });

  if (plan.distanceRoutes) {
    assert(Array.isArray(plan.distanceRoutes) && plan.distanceRoutes.length > 0, `${path}.distanceRoutes가 비어 있습니다.`);
    plan.distanceRoutes.forEach((route, routeIndex) => {
      assert(Array.isArray(route) && route.length > 0, `${path}.distanceRoutes[${routeIndex}]가 비어 있습니다.`);
      route.forEach(id => assert(segmentIds.has(id), `${path}.distanceRoutes에 없는 구간 id가 있습니다: ${id}`));
    });
  }

  const anchoredVisits = new Set();
  plan.rows.forEach((row, index) => {
    const rowPath = `${path}.rows[${index}]`;
    assert(isText(row?.time), `${rowPath}.time이 필요합니다.`);
    assert(/^\d{1,2}:\d{2}(~\d{1,2}:\d{2})?$/.test(row.time), `${rowPath}.time 형식이 올바르지 않습니다.`);
    assert(allowedRowTypes.has(row?.type), `${rowPath}.type이 올바르지 않습니다.`);
    assert(isText(row?.activity), `${rowPath}.activity가 필요합니다.`);
    if (row.type === "move") {
      assert(isText(row.from) && isText(row.to), `${rowPath} 이동 출발지와 도착지가 필요합니다.`);
    }
    if (row.visitIds) {
      assert(Array.isArray(row.visitIds), `${rowPath}.visitIds는 배열이어야 합니다.`);
      row.visitIds.forEach(id => {
        assert(visitIds.has(id), `${rowPath}에 없는 방문 id가 있습니다: ${id}`);
        assert(!anchoredVisits.has(id), `${path}의 방문 id가 여러 일정에 연결되었습니다: ${id}`);
        anchoredVisits.add(id);
      });
    }
    if (row.candidates) {
      assert(Array.isArray(row.candidates) && row.candidates.length > 0, `${rowPath}.candidates가 비어 있습니다.`);
      row.candidates.forEach((candidate, candidateIndex) => {
        assert(isText(candidate?.name) && isText(candidate?.menu), `${rowPath}.candidates[${candidateIndex}]가 올바르지 않습니다.`);
      });
    }
    if (row.type === "travel") {
      assert(Array.isArray(row.travel?.journeys) && row.travel.journeys.length > 0, `${rowPath}.travel.journeys가 필요합니다.`);
      row.travel.journeys.forEach((journey, journeyIndex) => {
        ["label", "startTime", "startPlace", "endTime", "endPlace"].forEach(key => {
          assert(isText(journey?.[key]), `${rowPath}.travel.journeys[${journeyIndex}].${key}가 필요합니다.`);
        });
      });
    }
  });
  plan.visits.forEach(visit => assert(anchoredVisits.has(visit.id), `${path}의 방문 장소가 일정에 연결되지 않았습니다: ${visit.id}`));
}

export function visitIndexMap(plan) {
  return new Map(plan.visits.map((visit, index) => [visit.id, index]));
}

export function visitMap(plan) {
  return new Map(plan.visits.map(visit => [visit.id, visit]));
}

export function visitRowIndexes(plan) {
  const rowByVisit = new Map();
  plan.rows.forEach((row, rowIndex) => row.visitIds?.forEach(id => rowByVisit.set(id, rowIndex)));
  return plan.visits.map(visit => rowByVisit.get(visit.id) ?? -1);
}
