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
import { loadFootprints, loadTrips } from "./data-loader.js";
import { renderHome } from "./home.js?v=20260821-solid-outline";
import { loadUiState, saveUiState as persistUiState } from "./ui-state.js";

const tripTabs = document.querySelector(".trip-tabs");
const dayTabs = document.querySelector(".day-tabs");
const routeStart = document.getElementById("route-start");
const routeEnd = document.getElementById("route-end");
const routeActions = document.querySelector(".route-actions");
const routeNow = document.getElementById("route-now");
const routeAll = document.getElementById("route-all");
const todayBrief = document.getElementById("today-brief");
const appStatus = document.getElementById("app-status");

let trips = [];
let activeTrip;
let activePlan;
let activeDayKey;
let activeView = "schedule";
let pageMode = "home";
let footprints;
let savedUiState;
let feedbackTimer;
let isRestoringUiState = true;

function saveUiState() {
  if (isRestoringUiState || pageMode !== "trip" || !activeTrip || !activePlan || !activeDayKey)
    return;
  savedUiState = {
    tripId: activeTrip.id,
    dayKey: activeDayKey,
    view: activeView,
    startIdx: Number(routeStart.value),
    endIdx: Number(routeEnd.value)
  };
  persistUiState(savedUiState);
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
  const distances = await Promise.all(trip.days.map(calculateDayDistance));
  const total = distances.reduce((sum, value) => ({
    min: sum.min + value.min,
    max: sum.max + value.max
  }), { min: 0, max: 0 });
  if (activeTrip === trip)
    distance.textContent = `이번 여행의 발자국 · 총 약 ${formatDistance(total, 0)}`;
}

function selectedRouteSummary(plan, startIdx, endIdx) {
  if (startIdx === 0 && endIdx === plan.visits.length - 1)
    return plan.summary;
  return plan.visits.slice(startIdx, endIdx + 1)
    .map((visit, idx) => `${startIdx + idx + 1}. ${visit.name}`)
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
  if (!activeTrip || !activePlan) {
    routeActions.hidden = true;
    return;
  }
  const todayKey = localDateKey(now);
  const isTripDay = activeTrip.days.some(plan => plan.isoDate === todayKey);
  const isActiveDayToday = activePlan.isoDate === todayKey;
  const isFullRoute = Number(routeStart.value) === 0
    && Number(routeEnd.value) === activePlan.visits.length - 1;
  routeNow.hidden = !isTripDay || isActiveDayToday;
  routeAll.hidden = isFullRoute;
  const visibleActionCount = [routeNow, routeAll].filter(button => !button.hidden).length;
  routeActions.hidden = visibleActionCount === 0;
  routeActions.classList.toggle("is-single", visibleActionCount === 1);
}

function fillEndOptions(startIdx, selectedEndIdx) {
  routeEnd.replaceChildren();
  for (let idx = startIdx + 1; idx < activePlan.visits.length; idx++) {
    const option = document.createElement("option");
    option.value = idx;
    option.textContent = `${idx + 1}. ${activePlan.visits[idx].name}`;
    routeEnd.append(option);
  }
  routeEnd.value = selectedEndIdx > startIdx ? selectedEndIdx : startIdx + 1;
}

function fillRouteOptions(plan) {
  activePlan = plan;
  routeStart.replaceChildren();
  plan.visits.slice(0, -1).forEach((visit, idx) => {
    const option = document.createElement("option");
    option.value = idx;
    option.textContent = `${idx + 1}. ${visit.name}`;
    routeStart.append(option);
  });
  routeStart.value = 0;
  fillEndOptions(0, plan.visits.length - 1);
}

function showAllSchedule() {
  routeStart.value = 0;
  fillEndOptions(0, activePlan.visits.length - 1);
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
  const plan = activeTrip.days.find(day => day.isoDate === todayKey);
  if (!plan)
    return;

  const key = plan.isoDate;
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
  if (pageMode !== "trip")
    return;
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
  const plan = activeTrip.days.find(day => day.isoDate === key) ?? activeTrip.days[0];
  const dayIndex = activeTrip.days.indexOf(plan);
  key = plan.isoDate;
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
  dayTabs.replaceChildren();
  dayTabs.style.setProperty("--day-count", activeTrip.days.length);
  activeTrip.days.forEach(plan => {
    const key = plan.isoDate;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.day = key;
    button.style.setProperty("--tab-color", plan.color);
    button.innerHTML = `<small>${plan.date}</small><strong>${plan.day}</strong><span>${plan.theme}</span>`;
    button.addEventListener("click", () => selectDay(key));
    dayTabs.append(button);
  });
  const selected = activeTrip.days.some(plan => plan.isoDate === preferredDayKey)
    ? preferredDayKey
    : activeTrip.days[0].isoDate;
  selectDay(selected);
}

function selectTrip(id, preferredDayKey) {
  pageMode = "trip";
  activeTrip = trips.find(trip => trip.id === id) ?? trips[0];
  document.querySelectorAll(".trip-tabs button").forEach(button => {
    const active = button.dataset.trip === activeTrip.id;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active);
  });
  document.getElementById("home-panel").hidden = true;
  dayTabs.hidden = false;
  document.querySelector(".day-overview").hidden = false;
  document.querySelector(".view-switch").hidden = false;
  renderDayTabs(preferredDayKey);
  if (savedUiState?.tripId === activeTrip.id && savedUiState?.dayKey === activeDayKey) {
    const lastPointIndex = activePlan.visits.length - 1;
    const startIdx = Math.min(Math.max(Number(savedUiState.startIdx) || 0, 0), lastPointIndex - 1);
    const endIdx = Math.min(Math.max(Number(savedUiState.endIdx) || lastPointIndex, startIdx + 1), lastPointIndex);
    routeStart.value = startIdx;
    fillEndOptions(startIdx, endIdx);
    drawSelectedRoute();
  }
  refreshTripDistance(activeTrip);
  setActiveView(savedUiState?.tripId === activeTrip.id && savedUiState?.view === "map" ? "map" : "schedule");
}

function showHome() {
  pageMode = "home";
  document.documentElement.style.setProperty("--accent", "#2d8b68");
  document.querySelectorAll(".trip-tabs button").forEach(button => {
    const active = button.dataset.page === "home";
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active);
  });
  document.getElementById("home-panel").hidden = false;
  dayTabs.hidden = true;
  document.querySelector(".day-overview").hidden = true;
  document.querySelector(".view-switch").hidden = true;
  document.getElementById("map-panel").hidden = true;
  document.getElementById("schedule-panel").hidden = true;
  todayBrief.hidden = true;
  const visitedCities = new Set(footprints.records.filter(record => record.country === "KR").flatMap(record => record.cities));
  document.getElementById("trip-distance").textContent = `함께한 발자국 · ${visitedCities.size}개 지역`;
}

function renderTripTabs() {
  tripTabs.replaceChildren();
  const homeButton = document.createElement("button");
  homeButton.type = "button";
  homeButton.dataset.page = "home";
  homeButton.textContent = "홈";
  homeButton.addEventListener("click", showHome);
  tripTabs.append(homeButton);
  trips.forEach(trip => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.trip = trip.id;
    button.textContent = trip.tab;
    button.style.setProperty("--trip-color", trip.color);
    button.addEventListener("click", () => {
      const preferredDay = savedUiState?.tripId === trip.id ? savedUiState.dayKey : undefined;
      selectTrip(trip.id, preferredDay);
    });
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
    [trips, footprints] = await Promise.all([loadTrips(), loadFootprints()]);
    appStatus.hidden = true;
    renderTripTabs();
    bindEvents();
    savedUiState = loadUiState();
    await renderHome({ footprints, trips, onSelectTrip: tripId => selectTrip(tripId) });
    showHome();
    isRestoringUiState = false;
  } catch (error) {
    showLoadError(error);
  }
}

initialize();
