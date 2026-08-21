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
    path.classList.add("home-city-shape", `is-${status}`);
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

function appendCityOverlays(svg, overlayData, citiesById, visitedCityIds, selectCity) {
  overlayData.regions.forEach(region => {
    const provincePath = svg.querySelector(`[id="${region.provinceId}"]`);
    if (!provincePath)
      return;

    const sourceGroup = document.createElementNS(svgNamespace, "g");
    sourceGroup.classList.add("home-city-overlay-source");
    region.cities.forEach(city => {
      const cityGroup = document.createElementNS(svgNamespace, "g");
      cityGroup.dataset.city = city.id;
      city.paths.forEach(pathData => cityGroup.append(createSvgPath(pathData)));
      sourceGroup.append(cityGroup);
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

    region.cities.forEach(city => {
      if (!visitedCityIds.has(city.id))
        return;
      const cityInfo = citiesById.get(city.id);
      addCityInteraction([sourceGroup.querySelector(`[data-city="${city.id}"]`)], cityInfo, selectCity);
    });
  });
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
  const mapHost = document.getElementById("home-map");
  const list = document.getElementById("footprint-list");
  const listTitle = document.getElementById("footprint-list-title");
  const filterReset = document.getElementById("footprint-filter-reset");
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
  document.getElementById("home-city-count").textContent = `${visitedCityIds.size}개 도시`;
  document.getElementById("home-overseas-count").textContent = `${footprints.records.filter(record => record.country !== "KR").length}번의 여행`;

  function showRecords(cityId) {
    const city = cityId ? citiesById.get(cityId) : null;
    listTitle.textContent = city ? `${city.name}의 발자국` : "국내 발자국";
    filterReset.hidden = !city;
    const records = city
      ? domesticRecords.filter(record => record.cities.includes(cityId))
      : domesticRecords;
    list.replaceChildren(...sortRecords(records).map(record => createFootprintItem(record, onSelectTrip)));
    mapHost.querySelectorAll(".home-city-shape").forEach(path => {
      path.classList.toggle("is-selected", Boolean(cityId) && path.dataset.city === cityId);
    });
  }

  filterReset.addEventListener("click", () => showRecords());
  document.getElementById("overseas-footprint-list").replaceChildren(
    ...sortRecords(overseasRecords).map(record => createFootprintItem(record, onSelectTrip))
  );

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
  svg.setAttribute("aria-label", "다녀온 도시가 표시된 대한민국 지도");
  svg.setAttribute("role", "img");
  svg.querySelectorAll("path").forEach(path => path.classList.add("home-province-shape"));

  footprints.cities.forEach(city => {
    if (!city.pathIds || !visitedCityIds.has(city.id))
      return;
    const paths = city.pathIds.map(id => svg.querySelector(`[id="${id}"]`)).filter(Boolean);
    paths.forEach(path => path.dataset.city = city.id);
    addCityInteraction(paths, city, showRecords);
  });
  appendCityOverlays(svg, await overlayResponse.json(), citiesById, visitedCityIds, showRecords);

  plannedCityIds.forEach(cityId => {
    const city = citiesById.get(cityId);
    const paths = city.pathIds
      ? city.pathIds.map(id => svg.querySelector(`[id="${id}"]`)).filter(Boolean)
      : [...svg.querySelectorAll(`[data-city="${cityId}"]`)];
    paths.forEach(path => path.dataset.city = cityId);
    addCityInteraction(paths, city, showRecords, "planned");
  });

  mapHost.addEventListener("click", event => {
    if (event.target === svg || event.target.closest("g")?.id === "전국_시도_경계")
      showRecords();
  });
  showRecords();
  panel.dataset.ready = "true";
}
