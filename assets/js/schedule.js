import { visitRowIndexes } from "./trip-model.js";

export function rowBriefContent(row, movementDestinationOnly = false) {
  if (row.type === "move") {
    return {
      title: movementDestinationOnly ? row.to : `${row.from} → ${row.to}`,
      detail: [row.time, row.note, row.activity.replace(/^이동·?/, ""), durationText(row.time)].filter(Boolean).join(" · ")
    };
  }
  return {
    title: row.to || row.from || row.activity,
    detail: [row.time, row.activity, row.note].filter(Boolean).join(" · ")
  };
}

export function selectedScheduleRows(plan, startIdx, endIdx) {
  if (startIdx === 0 && endIdx === plan.visits.length - 1)
    return plan.rows;

  const rowIndexes = visitRowIndexes(plan);
  const startRowIdx = rowIndexes[startIdx];
  const endRowIdx = rowIndexes[endIdx];
  if (startRowIdx < 0 || endRowIdx < startRowIdx)
    return [];

  return plan.rows.slice(startRowIdx, endRowIdx + 1);
}

export function durationText(time) {
  const match = time.match(/^(\d{1,2}):(\d{2})~(\d{1,2}):(\d{2})$/);
  if (!match)
    return "";
  const [, startHour, startMinute, endHour, endMinute] = match.map(Number);
  let minutes = endHour * 60 + endMinute - (startHour * 60 + startMinute);
  if (minutes < 0) minutes += 24 * 60;
  return `${minutes}분`;
}

export function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function rowStartMinutes(row) {
  const match = row.time.match(/^(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function findCurrentScheduleRow(plan, now = new Date()) {
  if (plan.isoDate !== localDateKey(now))
    return null;

  const timedRows = plan.rows.map(row => ({ row, start: rowStartMinutes(row) })).filter(item => item.start !== null);
  if (timedRows.length === 0)
    return null;

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  if (nowMinutes < timedRows[0].start)
    return timedRows[0].row;

  for (let index = 0; index < timedRows.length; index++) {
    const nextStart = timedRows[index + 1]?.start ?? 24 * 60;
    if (nowMinutes >= timedRows[index].start && nowMinutes < nextStart)
      return timedRows[index].row;
  }
  return timedRows[timedRows.length - 1].row;
}

function findVisit(plan, place) {
  const compact = value => value.replace(/\([^)]*\)/g, "").replace(/\s/g, "");
  const target = compact(place);
  return plan.visits.find(visit => compact(visit.name) === target)
    ?? plan.visits.find(visit => compact(visit.name).includes(target) || target.includes(compact(visit.name)));
}

function naverMapUrl(plan, place, exactName = false) {
  const appname = `${location.origin}${location.pathname}`;
  const query = `${plan.region} ${place}`;
  const useApp = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!useApp)
    return `https://map.naver.com/p/search/${encodeURIComponent(query)}`;

  if (!exactName) {
    const visit = findVisit(plan, place);
    if (visit)
      return `nmap://place?${new URLSearchParams({ lat: visit.lat, lng: visit.lng, name: visit.name, appname })}`;
  }
  return `nmap://search?${new URLSearchParams({ query, appname })}`;
}

export function createNaverMapLink(plan, place, exactName = false) {
  const link = document.createElement("a");
  const useApp = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  link.className = "naver-place-link";
  link.href = naverMapUrl(plan, place, exactName);
  link.textContent = place;
  if (!useApp) {
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  }
  link.setAttribute("aria-label", `${place} 네이버지도에서 열기`);
  return link;
}

function shouldShowNaverMap(activity) {
  return /점심|저녁|간식|카페|구경|관람|산책|케이블카/.test(activity);
}

function renderTravelDetails(container, travel) {
  const group = document.createElement("div");
  group.className = "travel-group";
  travel.journeys.forEach(journeyData => {
    const journey = document.createElement("div");
    const badge = document.createElement("span");
    const content = document.createElement("div");
    const route = document.createElement("strong");
    journey.className = "traveler-row";
    badge.className = "traveler-badge";
    badge.textContent = journeyData.label;
    route.className = "traveler-route";
    route.textContent = `${journeyData.startTime} ${journeyData.startPlace} → ${journeyData.endTime} ${journeyData.endPlace}`;
    content.append(route);
    if (journeyData.note) {
      const note = document.createElement("span");
      note.className = "traveler-note";
      note.textContent = journeyData.note;
      content.append(note);
    }
    journey.append(badge, content);
    group.append(journey);
  });
  if (travel.meeting) {
    const meeting = document.createElement("div");
    meeting.className = "travel-meeting";
    meeting.textContent = travel.meeting;
    group.append(meeting);
  }
  container.append(group);
}

function renderCandidates(container, plan, row) {
  const details = document.createElement("details");
  const summary = document.createElement("summary");
  const summaryTitle = document.createElement("span");
  const toggle = document.createElement("span");
  const openLabel = document.createElement("span");
  const closeLabel = document.createElement("span");
  const list = document.createElement("div");
  details.className = "candidate-details";
  summaryTitle.textContent = `${row.candidateLabel || row.activity} 후보 ${row.candidates.length}곳`;
  toggle.className = "candidate-toggle";
  openLabel.className = "candidate-open-label";
  openLabel.textContent = "펼쳐보기";
  closeLabel.className = "candidate-close-label";
  closeLabel.textContent = "접기";
  toggle.append(openLabel, closeLabel);
  summary.append(summaryTitle, toggle);
  list.className = "candidate-list";

  row.candidates.forEach(candidate => {
    const item = document.createElement("div");
    const heading = document.createElement("div");
    const name = createNaverMapLink(plan, candidate.name, true);
    const menu = document.createElement("span");
    item.className = "candidate-item";
    heading.className = "candidate-heading";
    name.classList.add("candidate-name");
    menu.className = "candidate-menu";
    menu.textContent = candidate.menu;
    heading.append(name);
    item.append(heading, menu);
    list.append(item);
  });
  details.append(summary, list);
  container.append(details);
}

export function renderSchedule(plan, startIdx, endIdx) {
  const rows = selectedScheduleRows(plan, startIdx, endIdx);
  const currentRow = findCurrentScheduleRow(plan);
  const isFullRoute = startIdx === 0 && endIdx === plan.visits.length - 1;
  document.getElementById("row-count").textContent = isFullRoute
    ? `${rows.length}개 일정`
    : `${rows.length}개 일정 · ${startIdx + 1}→${endIdx + 1}번`;

  const body = document.getElementById("schedule-body");
  body.replaceChildren();
  rows.forEach(row => {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.className = "schedule-item";
    td.colSpan = 5;

    if (row === currentRow) {
      tr.classList.add("is-current");
      const marker = document.createElement("span");
      marker.className = "current-marker";
      marker.textContent = "지금";
      td.append(marker);
    }

    if (row.type === "move") {
      const line = document.createElement("div");
      const arrow = document.createElement("span");
      const content = document.createElement("div");
      const summary = document.createElement("strong");
      const route = document.createElement("span");
      const extraActivity = row.activity.replace(/^이동·?/, "");
      tr.classList.add("movement-row");
      line.className = "movement-line";
      arrow.className = "movement-arrow";
      arrow.textContent = "↓";
      summary.className = "movement-summary";
      summary.textContent = [row.note, extraActivity, durationText(row.time)].filter(Boolean).join(" · ");
      route.className = "movement-route";
      route.textContent = `${row.time} · ${row.from} → ${row.to}`;
      content.append(summary, route);
      line.append(arrow, content);
      td.append(line);
      tr.append(td);
      body.append(tr);
      return;
    }

    const time = document.createElement("span");
    let place = document.createElement("strong");
    const placeLabel = row.type === "travel"
      ? row.activity
      : row.from && row.to ? `${row.from} → ${row.to}` : row.to || row.from;
    const mapPlace = row.to || row.from;
    time.className = "schedule-time";
    time.textContent = row.time;
    if (row.type !== "travel" && !row.candidates?.length && shouldShowNaverMap(row.activity))
      place = createNaverMapLink(plan, mapPlace);
    place.classList.add("schedule-place");
    place.textContent = placeLabel;
    const placeRow = document.createElement("div");
    placeRow.className = "schedule-place-row";
    placeRow.append(place);
    td.append(time, placeRow);

    if (row.type === "travel")
      renderTravelDetails(td, row.travel);
    else if (row.candidates?.length)
      renderCandidates(td, plan, row);
    else {
      const detail = document.createElement("span");
      detail.className = "schedule-detail";
      detail.textContent = [row.activity, row.note].filter(Boolean).join(" · ");
      td.append(detail);
    }
    tr.append(td);
    body.append(tr);
  });
}
