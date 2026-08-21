const svgNamespace = "http://www.w3.org/2000/svg";

function formatDate(date) {
  return date.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$1.$2.$3");
}

function recordDate(record) {
  if (!record.startDate)
    return "";
  const start = formatDate(record.startDate);
  const end = formatDate(record.endDate);
  return start === end ? start : `${start}~${end.slice(5)}`;
}

function createSvgPath(pathData) {
  const path = document.createElementNS(svgNamespace, "path");
  path.setAttribute("d", pathData);
  return path;
}

function addCityInteraction(paths, city, selectCity, status = "visited") {
  paths.forEach(path => {
    if (!path)
      return;
    path.classList.add("home-city-shape", `is-${status}`);
    path.dataset.city = city.id;
    path.setAttribute("role", "button");
    path.setAttribute("tabindex", "0");
    path.setAttribute("aria-label", `${city.name} 발자국 보기`);
    path.addEventListener("click", event => {
      event.stopPropagation();
      selectCity(city.id);
    });
    path.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectCity(city.id);
      }
    });
  });
}

function findBoundaryCity(region, boundaryId, cities) {
  return cities.find(city => city.provinceId === region.provinceId && (
    city.pathIds?.includes(region.provinceId)
    || city.boundaryPrefixes?.some(prefix => boundaryId.startsWith(prefix))
  ));
}

function appendCityOverlays(svg, overlayData, cities, visitedCityIds, plannedCityIds, selectCity) {
  overlayData.regions.forEach(region => {
    const provincePath = svg.querySelector(`[id="${region.provinceId}"]`);
    if (!provincePath)
      return;

    const sourceGroup = document.createElementNS(svgNamespace, "g");
    sourceGroup.classList.add("home-city-overlay-source");
    const cityGroups = new Map();
    region.paths.forEach(boundary => {
      const path = createSvgPath(boundary.d);
      path.classList.add("home-subregion-shape");
      path.dataset.boundary = boundary.id;
      const city = findBoundaryCity(region, boundary.id, cities);
      if (!city || (!visitedCityIds.has(city.id) && !plannedCityIds.has(city.id))) {
        sourceGroup.append(path);
        return;
      }

      let cityGroup = cityGroups.get(city.id);
      if (!cityGroup) {
        cityGroup = document.createElementNS(svgNamespace, "g");
        cityGroups.set(city.id, cityGroup);
        sourceGroup.append(cityGroup);
      }
      cityGroup.append(path);
    });
    svg.append(sourceGroup);

    const [sourceX, sourceY, sourceWidth, sourceHeight] = region.viewBox;
    const targetBox = provincePath.getBBox();
    const scaleX = targetBox.width / sourceWidth;
    const scaleY = targetBox.height / sourceHeight;
    sourceGroup.setAttribute(
      "transform",
      `translate(${targetBox.x} ${targetBox.y}) scale(${scaleX} ${scaleY}) translate(${-sourceX} ${-sourceY})`
    );

    cityGroups.forEach((cityGroup, cityId) => {
      const city = cities.find(candidate => candidate.id === cityId);
      const status = plannedCityIds.has(cityId) ? "planned" : "visited";
      if (city.pathIds) {
        cityGroup.classList.add("home-city-fill", `is-${status}`);
        cityGroup.dataset.city = cityId;
        return;
      }
      addCityInteraction(
        [cityGroup],
        city,
        selectCity,
        status
      );
    });
  });
}

function setupMapZoom(svg, mapHost) {
  const provinceBoxes = [...svg.querySelectorAll("#전국_시도_경계 > path")].map(path => path.getBBox());
  const contentBox = provinceBoxes.reduce((box, current) => ({
    x: Math.min(box.x, current.x),
    y: Math.min(box.y, current.y),
    right: Math.max(box.right, current.x + current.width),
    bottom: Math.max(box.bottom, current.y + current.height)
  }), { x: Infinity, y: Infinity, right: -Infinity, bottom: -Infinity });
  contentBox.width = contentBox.right - contentBox.x;
  contentBox.height = contentBox.bottom - contentBox.y;
  const padding = 12;
  const bounds = {
    x: contentBox.x - padding,
    y: contentBox.y - padding,
    width: contentBox.width + padding * 2,
    height: contentBox.height + padding * 2
  };
  const view = { ...bounds };
  const pointers = new Map();
  let scale = 1;
  let gesture;
  let dragged = false;

  function clampView() {
    view.width = bounds.width / scale;
    view.height = bounds.height / scale;
    view.x = Math.min(Math.max(view.x, bounds.x), bounds.x + bounds.width - view.width);
    view.y = Math.min(Math.max(view.y, bounds.y), bounds.y + bounds.height - view.height);
  }

  function applyView() {
    clampView();
    svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.width} ${view.height}`);
    mapHost.classList.toggle("is-detailed", scale >= 1.5);
    document.getElementById("home-map-zoom-out").disabled = scale <= 1;
    document.getElementById("home-map-zoom-in").disabled = scale >= 7;
  }

  function zoomTo(nextScale, clientX, clientY) {
    const rect = svg.getBoundingClientRect();
    const ratioX = clientX == null ? 0.5 : Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    const ratioY = clientY == null ? 0.5 : Math.min(Math.max((clientY - rect.top) / rect.height, 0), 1);
    const anchorX = view.x + view.width * ratioX;
    const anchorY = view.y + view.height * ratioY;
    scale = Math.min(Math.max(nextScale, 1), 7);
    const nextWidth = bounds.width / scale;
    const nextHeight = bounds.height / scale;
    view.x = anchorX - nextWidth * ratioX;
    view.y = anchorY - nextHeight * ratioY;
    applyView();
  }

  function resetMap() {
    scale = 1;
    Object.assign(view, bounds);
    applyView();
  }

  function startGesture() {
    const points = [...pointers.values()];
    const rect = svg.getBoundingClientRect();
    gesture = { view: { ...view }, scale, points, rect };
    if (points.length === 2) {
      gesture.distance = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
      gesture.midpoint = {
        x: (points[0].x + points[1].x) / 2,
        y: (points[0].y + points[1].y) / 2
      };
    }
  }

  mapHost.addEventListener("wheel", event => {
    event.preventDefault();
    zoomTo(scale * (event.deltaY < 0 ? 1.3 : 1 / 1.3), event.clientX, event.clientY);
  }, { passive: false });

  mapHost.addEventListener("dblclick", event => {
    event.preventDefault();
    zoomTo(scale * 1.7, event.clientX, event.clientY);
  });

  mapHost.addEventListener("pointerdown", event => {
    if (event.target.closest(".home-map-controls"))
      return;
    mapHost.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    startGesture();
  });

  mapHost.addEventListener("pointermove", event => {
    if (!pointers.has(event.pointerId) || !gesture)
      return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.values()];
    if (points.length === 1 && gesture.points.length === 1 && scale > 1) {
      const dx = points[0].x - gesture.points[0].x;
      const dy = points[0].y - gesture.points[0].y;
      view.x = gesture.view.x - dx * gesture.view.width / gesture.rect.width;
      view.y = gesture.view.y - dy * gesture.view.height / gesture.rect.height;
      dragged ||= Math.hypot(dx, dy) > 4;
      applyView();
      return;
    }
    if (points.length === 2 && gesture.points.length === 2) {
      const distance = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
      const midpoint = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
      const nextScale = Math.min(Math.max(gesture.scale * distance / gesture.distance, 1), 7);
      const startRatioX = (gesture.midpoint.x - gesture.rect.left) / gesture.rect.width;
      const startRatioY = (gesture.midpoint.y - gesture.rect.top) / gesture.rect.height;
      const currentRatioX = (midpoint.x - gesture.rect.left) / gesture.rect.width;
      const currentRatioY = (midpoint.y - gesture.rect.top) / gesture.rect.height;
      const anchorX = gesture.view.x + gesture.view.width * startRatioX;
      const anchorY = gesture.view.y + gesture.view.height * startRatioY;
      scale = nextScale;
      view.width = bounds.width / scale;
      view.height = bounds.height / scale;
      view.x = anchorX - view.width * currentRatioX;
      view.y = anchorY - view.height * currentRatioY;
      dragged = true;
      applyView();
    }
  });

  function endPointer(event) {
    pointers.delete(event.pointerId);
    if (pointers.size)
      startGesture();
    else
      gesture = undefined;
  }
  mapHost.addEventListener("pointerup", endPointer);
  mapHost.addEventListener("pointercancel", endPointer);
  mapHost.addEventListener("click", event => {
    if (!dragged)
      return;
    event.preventDefault();
    event.stopImmediatePropagation();
    dragged = false;
  }, true);

  document.getElementById("home-map-zoom-in").addEventListener("click", () => zoomTo(scale * 1.6));
  document.getElementById("home-map-zoom-out").addEventListener("click", () => zoomTo(scale / 1.6));
  document.getElementById("home-map-reset").addEventListener("click", resetMap);
  applyView();
}

function createFootprintItem(record, onSelectTrip) {
  const item = document.createElement("article");
  const date = recordDate(record);
  item.className = `footprint-item${date ? "" : " is-undated"}`;
  item.innerHTML = `${date ? `<span class="footprint-date">${date}${record.planned ? "<em>여행 예정</em>" : ""}</span>` : ""}<strong>${record.label}</strong>`;
  if (record.tripId) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "일정 보기";
    button.addEventListener("click", () => onSelectTrip(record.tripId));
    item.append(button);
  }
  return item;
}

function sortRecords(records) {
  return [...records].sort((a, b) => {
    if (!a.startDate && !b.startDate)
      return a.label.localeCompare(b.label, "ko");
    if (!a.startDate)
      return 1;
    if (!b.startDate)
      return -1;
    return b.startDate.localeCompare(a.startDate);
  });
}

export async function renderHome({ footprints, trips, onSelectTrip }) {
  const panel = document.getElementById("home-panel");
  panel.hidden = false;
  const mapHost = document.getElementById("home-map");
  const list = document.getElementById("footprint-list");
  const cityCard = document.getElementById("home-city-card");
  const cityCardName = document.getElementById("home-city-card-name");
  const cityCardRecords = document.getElementById("home-city-card-records");
  const citiesById = new Map(footprints.cities.map(city => [city.id, city]));
  const plannedRecords = trips.map(trip => ({
    id: `planned-${trip.id}`,
    label: trip.region,
    startDate: trip.startDate,
    endDate: trip.endDate,
    country: "KR",
    cities: trip.footprintCities,
    tripId: trip.id,
    planned: true
  }));
  const allRecords = [...footprints.records, ...plannedRecords];
  const domesticRecords = allRecords.filter(record => record.country === "KR");
  const overseasRecords = allRecords.filter(record => record.country !== "KR");
  const visitedCityIds = new Set(footprints.records.filter(record => record.country === "KR").flatMap(record => record.cities));
  const plannedCityIds = new Set(plannedRecords.flatMap(record => record.cities));

  document.getElementById("home-domestic-count").textContent = `${footprints.records.filter(record => record.country === "KR" && record.startDate).length}번의 여행`;
  document.getElementById("home-city-count").textContent = `${visitedCityIds.size}개 지역`;
  document.getElementById("home-overseas-count").textContent = `${footprints.records.filter(record => record.country !== "KR").length}번의 여행`;
  document.getElementById("domestic-record-count").textContent = `${domesticRecords.length}개 기록`;
  document.getElementById("overseas-record-count").textContent = `${overseasRecords.length}개 기록`;

  function selectMapCity(cityId) {
    const city = citiesById.get(cityId);
    const records = domesticRecords.filter(record => record.cities.includes(cityId));
    cityCardName.textContent = city.name;
    cityCardRecords.replaceChildren(...sortRecords(records).map(record => createFootprintItem(record, onSelectTrip)));
    cityCard.hidden = false;
    mapHost.querySelectorAll(".home-city-shape,.home-city-fill").forEach(path => {
      path.classList.toggle("is-selected", path.dataset.city === cityId);
    });
  }

  function closeCityCard() {
    cityCard.hidden = true;
    mapHost.querySelectorAll(".home-city-shape,.home-city-fill").forEach(path => path.classList.remove("is-selected"));
  }

  list.replaceChildren(...sortRecords(domesticRecords).map(record => createFootprintItem(record, onSelectTrip)));
  document.getElementById("overseas-footprint-list").replaceChildren(
    ...sortRecords(overseasRecords).map(record => createFootprintItem(record, onSelectTrip))
  );
  document.getElementById("home-city-card-close").addEventListener("click", closeCityCard);

  const [mapResponse, overlayResponse] = await Promise.all([
    fetch(new URL("../maps/korea-provinces.svg", import.meta.url)),
    fetch(new URL("../maps/city-overlays.json", import.meta.url))
  ]);
  if (!mapResponse.ok || !overlayResponse.ok)
    throw new Error("발자국 지도를 불러오지 못했습니다.");
  mapHost.innerHTML = await mapResponse.text();
  const svg = mapHost.querySelector("svg");
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  svg.setAttribute("aria-label", "다녀온 지역이 표시된 대한민국 지도");
  svg.setAttribute("role", "img");
  svg.querySelectorAll("path").forEach(path => path.classList.add("home-province-shape"));

  footprints.cities.forEach(city => {
    if (!city.pathIds || (!visitedCityIds.has(city.id) && !plannedCityIds.has(city.id)))
      return;
    const paths = city.pathIds.map(id => svg.querySelector(`[id="${id}"]`)).filter(Boolean);
    addCityInteraction(paths, city, selectMapCity, plannedCityIds.has(city.id) ? "planned" : "visited");
  });
  appendCityOverlays(svg, await overlayResponse.json(), footprints.cities, visitedCityIds, plannedCityIds, selectMapCity);
  setupMapZoom(svg, mapHost);

  mapHost.addEventListener("click", event => {
    const cityTarget = event.target.closest("[data-city]");
    if (cityTarget) {
      selectMapCity(cityTarget.dataset.city);
      return;
    }
    if (event.target === svg || event.target.closest("g")?.id === "전국_시도_경계")
      closeCityCard();
  });
  closeCityCard();
  panel.dataset.ready = "true";
}
