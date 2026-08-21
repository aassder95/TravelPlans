import {
  findCurrentScheduleRow,
  localDateKey,
  renderSchedule,
  rowBriefContent
} from "./schedule.js";
import {
  calculateDayDistance,
  drawMap,
  formatDistance,
  invalidateMapSize
} from "./map.js";

const tripTabs = document.querySelector(".trip-tabs");
const dayTabs = document.querySelector(".day-tabs");
const routeStart = document.getElementById("route-start");
const routeEnd = document.getElementById("route-end");
const routeActions = document.querySelector(".route-actions");
const routeNow = document.getElementById("route-now");
const routeAll = document.getElementById("route-all");
const todayBrief = document.getElementById("today-brief");
const appStatus = document.getElementById("app-status");
const uiStateKey = "travelPlans.uiState.v1";

let trips = [];
let activeTrip;
let activePlan;
let activeDayKey;
let activeView = "schedule";
let feedbackTimer;
let isRestoringUiState = true;

function validateTrip(trip, expectedId) {
  if (trip?.version !== 1)
    throw new Error(`지원하지 않는 여행 데이터 버전입니다: ${expectedId}`);
  if (!trip.id || trip.id !== expectedId || !trip.tab || !trip.color || !trip.days)
    throw new Error(`여행 기본 정보가 올바르지 않습니다: ${expectedId}`);

  Object.entries(trip.days).forEach(([dayKey, plan]) => {
    if (!plan.isoDate || !Array.isArray(plan.points) || plan.points.length < 2
      || !Array.isArray(plan.segments) || !Array.isArray(plan.rows))
      throw new Error(`날짜별 일정 정보가 올바르지 않습니다: ${expectedId}/${dayKey}`);
  });
  return trip;
}

async function loadTrips() {
  const manifestUrl = new URL("../../data/trips.json", import.meta.url);
  const response = await fetch(manifestUrl, { cache: "no-store" });
  if (!response.ok)
    throw new Error(`여행 목록을 불러오지 못했습니다. (HTTP ${response.status})`);

  const manifest = await response.json();
  if (manifest?.version !== 1 || !Array.isArray(manifest.trips) || manifest.trips.length === 0)
    throw new Error("여행 목록 형식이 올바르지 않습니다.");

  return Promise.all(manifest.trips.map(async entry => {
    if (!entry?.id || !entry.file)
      throw new Error("여행 목록에 id 또는 file이 없습니다.");
    const tripUrl = new URL(entry.file, manifestUrl);
    const tripResponse = await fetch(tripUrl, { cache: "no-store" });
    if (!tripResponse.ok)
      throw new Error(`${entry.id} 일정을 불러오지 못했습니다. (HTTP ${tripResponse.status})`);
    return validateTrip(await tripResponse.json(), entry.id);
  }));
}

function loadUiState() {
  try {
    const state = JSON.parse(localStorage.getItem(uiStateKey));
    return state && typeof state === "object" ? state : null;
  } catch {
    return null;
  }
}

function saveUiState() {
  if (isRestoringUiState || !activeTrip || !activePlan || !activeDayKey)
    return;

  try {
    localStorage.setItem(uiStateKey, JSON.stringify({
      tripId: activeTrip.id,
      dayKey: activeDayKey,
      view: activeView,
      startIdx: Number(routeStart.value),
      endIdx: Number(routeEnd.value)
    }));
  } catch {
    // 저장소 사용이 제한된 브라우저에서도 일정표 자체는 그대로 동작한다.
  }
}

function refreshDayDistance(plan) {
  const distance = document.getElementById("day-distance");
  distance.textContent = "거리 계산 중…";
  calculateDayDistance(plan).then(distanceRange => {
    if (activePlan === plan)
      distance.textContent = `약 ${formatDistance(distanceRange)}`;
  });
}

async function refreshTripDistance(trip) {
  const distance = document.getElementById("trip-distance");
  distance.textContent = "이번 여행의 발자국 · 거리 계산 중…";
  const distances = await Promise.all(Object.values(trip.days).map(calculateDayDistance));
  const total = distances.reduce((sum, value) => ({
    min: sum.min + value.min,
    max: sum.max + value.max
  }), { min: 0, max: 0 });
  if (activeTrip === trip)
    distance.textContent = `이번 여행의 발자국 · 총 약 ${formatDistance(total, 0)}`;
}

function selectedRouteSummary(plan, startIdx, endIdx) {
  if (startIdx === 0 && endIdx === plan.points.length - 1)
    return plan.summary;
  return plan.points.slice(startIdx, endIdx + 1)
    .map(([name], idx) => `${startIdx + idx + 1}. ${name}`)
    .join(" → ");
}

function updateTodayBrief(now = new Date()) {
  const currentRow = activePlan ? findCurrentScheduleRow(activePlan, now) : null;
  if (!currentRow) {
    todayBrief.hidden = true;
    return;
  }

  const currentIndex = activePlan.rows.indexOf(currentRow);
  const nextRow = activePlan.rows[currentIndex + 1];
  const current = rowBriefContent(currentRow);
  document.getElementById("today-current-title").textContent = current.title;
  document.getElementById("today-current-detail").textContent = current.detail;

  const nextContainer = document.getElementById("today-next-row");
  nextContainer.hidden = !nextRow;
  if (nextRow) {
    const next = rowBriefContent(nextRow, true);
    document.getElementById("today-next-title").textContent = next.title;
    document.getElementById("today-next-detail").textContent = next.detail;
  }
  todayBrief.hidden = false;
}

function drawSelectedRoute() {
  const startIdx = Number(routeStart.value);
  const endIdx = Number(routeEnd.value);
  document.getElementById("route-summary").textContent = selectedRouteSummary(activePlan, startIdx, endIdx);
  renderSchedule(activePlan, startIdx, endIdx);
  drawMap(activePlan, startIdx, endIdx);
  updateRouteActions();
  updateTodayBrief();
  saveUiState();
}

function updateRouteActions(now = new Date()) {
  const todayKey = localDateKey(now);
  const isTripDay = Object.values(activeTrip.days).some(plan => plan.isoDate === todayKey);
  const isActiveDayToday = activePlan.isoDate === todayKey;
  const isFullRoute = Number(routeStart.value) === 0
    && Number(routeEnd.value) === activePlan.points.length - 1;
  routeNow.hidden = !isTripDay || isActiveDayToday;
  routeAll.hidden = isFullRoute;
  const visibleActionCount = [routeNow, routeAll].filter(button => !button.hidden).length;
  routeActions.hidden = visibleActionCount === 0;
  routeActions.classList.toggle("is-single", visibleActionCount === 1);
}

function fillEndOptions(startIdx, selectedEndIdx) {
  routeEnd.replaceChildren();
  for (let idx = startIdx + 1; idx < activePlan.points.length; idx++) {
    const option = document.createElement("option");
    option.value = idx;
    option.textContent = `${idx + 1}. ${activePlan.points[idx][0]}`;
    routeEnd.append(option);
  }
  routeEnd.value = selectedEndIdx > startIdx ? selectedEndIdx : startIdx + 1;
}

function fillRouteOptions(plan) {
  activePlan = plan;
  routeStart.replaceChildren();
  plan.points.slice(0, -1).forEach(([name], idx) => {
    const option = document.createElement("option");
    option.value = idx;
    option.textContent = `${idx + 1}. ${name}`;
    routeStart.append(option);
  });
  routeStart.value = 0;
  fillEndOptions(0, plan.points.length - 1);
}

function showAllSchedule() {
  routeStart.value = 0;
  fillEndOptions(0, activePlan.points.length - 1);
  drawSelectedRoute();
}

function showFeedback(message) {
  const feedback = document.getElementById("day-feedback");
  clearTimeout(feedbackTimer);
  feedback.textContent = message;
  feedbackTimer = setTimeout(() => feedback.textContent = "", 2500);
}

function focusCurrentSchedule() {
  const todayKey = localDateKey(new Date());
  const dayEntry = Object.entries(activeTrip.days).find(([, plan]) => plan.isoDate === todayKey);
  if (!dayEntry)
    return;

  const [key] = dayEntry;
  if (activeDayKey !== key)
    selectDay(key);
  else
    showAllSchedule();
  setActiveView("schedule");
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const currentRow = document.querySelector("#schedule-body tr.is-current");
    if (currentRow) {
      currentRow.scrollIntoView({ behavior: "smooth", block: "center" });
      showFeedback("현재 일정으로 이동했어요.");
    }
  }));
}

function setActiveView(view) {
  activeView = view;
  const isSchedule = view === "schedule";
  const isMap = view === "map";
  document.getElementById("schedule-panel").hidden = !isSchedule;
  document.getElementById("map-panel").hidden = !isMap;
  document.getElementById("view-schedule").classList.toggle("active", isSchedule);
  document.getElementById("view-map").classList.toggle("active", isMap);
  document.getElementById("view-schedule").setAttribute("aria-selected", isSchedule);
  document.getElementById("view-map").setAttribute("aria-selected", isMap);
  if (isMap) {
    setTimeout(() => {
      invalidateMapSize();
      drawSelectedRoute();
    }, 0);
  }
  saveUiState();
}

function selectDay(key) {
  const keys = Object.keys(activeTrip.days);
  const plan = activeTrip.days[key];
  const dayIndex = keys.indexOf(key);
  activeDayKey = key;
  document.documentElement.style.setProperty("--accent", plan.color);
  document.querySelectorAll(".day-tabs button").forEach(button => {
    const active = button.dataset.day === key;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active);
  });
  document.getElementById("day-number").textContent = `DAY ${dayIndex + 1}`;
  document.getElementById("route-title").textContent = `${plan.date} ${plan.day}`;
  document.getElementById("route-note").textContent = plan.note;
  fillRouteOptions(plan);
  refreshDayDistance(plan);
  drawSelectedRoute();
}

function renderDayTabs(preferredDayKey) {
  const keys = Object.keys(activeTrip.days);
  dayTabs.replaceChildren();
  dayTabs.style.setProperty("--day-count", keys.length);
  keys.forEach(key => {
    const plan = activeTrip.days[key];
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.day = key;
    button.style.setProperty("--tab-color", plan.color);
    button.innerHTML = `<small>${plan.date}</small><strong>${plan.day}</strong><span>${plan.theme}</span>`;
    button.addEventListener("click", () => selectDay(key));
    dayTabs.append(button);
  });
  selectDay(keys.includes(preferredDayKey) ? preferredDayKey : keys[0]);
}

function selectTrip(id, preferredDayKey) {
  activeTrip = trips.find(trip => trip.id === id) ?? trips[0];
  document.querySelectorAll(".trip-tabs button").forEach(button => {
    const active = button.dataset.trip === activeTrip.id;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active);
  });
  renderDayTabs(preferredDayKey);
  refreshTripDistance(activeTrip);
}

function renderTripTabs() {
  tripTabs.replaceChildren();
  trips.forEach(trip => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.trip = trip.id;
    button.textContent = trip.tab;
    button.style.setProperty("--trip-color", trip.color);
    button.addEventListener("click", () => selectTrip(trip.id));
    tripTabs.append(button);
  });
}

function bindEvents() {
  routeStart.addEventListener("change", () => {
    fillEndOptions(Number(routeStart.value), Number(routeEnd.value));
    drawSelectedRoute();
  });
  routeEnd.addEventListener("change", drawSelectedRoute);
  routeAll.addEventListener("click", showAllSchedule);
  routeNow.addEventListener("click", focusCurrentSchedule);
  todayBrief.addEventListener("click", focusCurrentSchedule);
  document.getElementById("view-schedule").addEventListener("click", () => setActiveView("schedule"));
  document.getElementById("view-map").addEventListener("click", () => setActiveView("map"));
  document.getElementById("back-to-top").addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  window.addEventListener("scroll", () => {
    document.getElementById("back-to-top").classList.toggle("show", window.scrollY > 500);
  }, { passive: true });
  setInterval(() => {
    updateTodayBrief();
    updateRouteActions();
    if (activePlan?.isoDate === localDateKey(new Date()))
      renderSchedule(activePlan, Number(routeStart.value), Number(routeEnd.value));
  }, 60000);
}

function showLoadError(error) {
  console.error(error);
  appStatus.classList.add("is-error");
  appStatus.textContent = `여행 정보를 불러오지 못했어요. 잠시 후 새로고침해 주세요. (${error.message})`;
  dayTabs.hidden = true;
  document.querySelector(".day-overview").hidden = true;
  document.querySelector(".view-switch").hidden = true;
  document.getElementById("map-panel").hidden = true;
  document.getElementById("schedule-panel").hidden = true;
  document.getElementById("trip-distance").textContent = "여행 정보를 확인할 수 없어요.";
}

async function initialize() {
  try {
    trips = await loadTrips();
    appStatus.hidden = true;
    renderTripTabs();
    bindEvents();

    const savedUiState = loadUiState();
    const initialTrip = trips.find(trip => trip.id === savedUiState?.tripId) ?? trips[0];
    selectTrip(initialTrip.id, savedUiState?.dayKey);

    if (savedUiState?.tripId === activeTrip.id && savedUiState?.dayKey === activeDayKey) {
      const lastPointIndex = activePlan.points.length - 1;
      const startIdx = Math.min(Math.max(Number(savedUiState.startIdx) || 0, 0), lastPointIndex - 1);
      const endIdx = Math.min(Math.max(Number(savedUiState.endIdx) || lastPointIndex, startIdx + 1), lastPointIndex);
      routeStart.value = startIdx;
      fillEndOptions(startIdx, endIdx);
      drawSelectedRoute();
    }

    setActiveView(savedUiState?.view === "map" ? "map" : "schedule");
    isRestoringUiState = false;
    saveUiState();
  } catch (error) {
    showLoadError(error);
  }
}

initialize();
