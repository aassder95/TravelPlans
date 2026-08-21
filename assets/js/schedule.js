export function placeMatches(schedulePlace, pointName) {
  if (!schedulePlace)
    return false;

  const compactPlace = schedulePlace.replace(/\([^)]*\)/g, "").replace(/\s/g, "");
  const compactPoint = pointName.replace(/\([^)]*\)/g, "").replace(/\s/g, "");
  if (compactPlace.includes(compactPoint) || compactPoint.includes(compactPlace))
    return true;

  return pointName.split(/·|\/|또는/).map(value => value.replace(/\s/g, "")).filter(value => value.length > 1).some(value => compactPlace.includes(value));
}

export function pointRowIndexes(plan) {
  let searchIdx = 0;
  return plan.points.map(([pointName]) => {
    let fallbackIdx = -1;
    let anchorIdx = -1;
    for (let rowIdx = searchIdx; rowIdx < plan.rows.length; rowIdx++) {
      const [, origin, dest] = plan.rows[rowIdx];
      if (!placeMatches(dest, pointName))
        continue;

      if (fallbackIdx < 0) fallbackIdx = rowIdx;
      if (!origin) {
        anchorIdx = rowIdx;
        break;
      }
    }
    const rowIdx = anchorIdx >= 0 ? anchorIdx : fallbackIdx;
    if (rowIdx >= 0) searchIdx = rowIdx;
    return rowIdx;
  });
}

export function rowBriefContent(row, movementDestinationOnly = false) {
  const [time, origin, dest, activity, note] = row;
  const isMovement = activity.startsWith("이동");
  if (isMovement) {
    return {
      title: movementDestinationOnly ? dest : `${origin} → ${dest}`,
      detail: [time, note, activity.replace(/^이동·?/, ""), durationText(time)].filter(Boolean).join(" · ")
    };
  }
  return {
    title: dest || origin || activity,
    detail: [time, activity, note].filter(Boolean).join(" · ")
  };
}

export function selectedScheduleRows(plan, startIdx, endIdx) {
  if (startIdx === 0 && endIdx === plan.points.length - 1)
    return plan.rows;

  const rowIndexes = pointRowIndexes(plan);
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
  const match = row[0].match(/^(\d{1,2}):(\d{2})/);
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

function naverMapUrl(plan, place, exactName = false) {
  const appname = `${location.origin}${location.pathname}`;
  const query = `여수 ${place}`;
  const useApp = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!useApp)
    return `https://map.naver.com/p/search/${encodeURIComponent(query)}`;

  if (!exactName) {
    const compact = value => value.replace(/\([^)]*\)/g, "").replace(/\s/g, "");
    const point = plan.points.find(([pointName]) => compact(pointName) === compact(place))
      ?? plan.points.find(([pointName]) => placeMatches(place, pointName));
    if (point) {
      const [name, lng, lat] = point;
      return `nmap://place?${new URLSearchParams({ lat, lng, name, appname })}`;
    }
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

export function renderSchedule(plan, startIdx, endIdx) {
  const rows = selectedScheduleRows(plan, startIdx, endIdx);
  const currentRow = findCurrentScheduleRow(plan);
  const isFullRoute = startIdx === 0 && endIdx === plan.points.length - 1;
  document.getElementById("row-count").textContent = isFullRoute ? `${rows.length}개 일정` : `${rows.length}개 일정 · ${startIdx + 1}→${endIdx + 1}번`;

  const body = document.getElementById("schedule-body");
  body.replaceChildren();
  rows.forEach(row => {
    const [time, origin, dest, activity, note, candidates, travel, candidateLabel] = row;
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    const timeText = document.createElement("span");
    let placeText = document.createElement("strong");
    const isMovement = activity.startsWith("이동");
    td.className = "schedule-item";
    td.colSpan = 5;
    if (row === currentRow) {
      tr.classList.add("is-current");
      const currentMarker = document.createElement("span");
      currentMarker.className = "current-marker";
      currentMarker.textContent = "지금";
      td.append(currentMarker);
    }
    if (isMovement) {
      const line = document.createElement("div");
      const arrow = document.createElement("span");
      const content = document.createElement("div");
      const summary = document.createElement("strong");
      const route = document.createElement("span");
      const extraActivity = activity.replace(/^이동·?/, "");
      const summaryParts = [note, extraActivity, durationText(time)].filter(Boolean);
      tr.classList.add("movement-row");
      line.className = "movement-line";
      arrow.className = "movement-arrow";
      arrow.textContent = "↓";
      summary.className = "movement-summary";
      summary.textContent = summaryParts.join(" · ");
      route.className = "movement-route";
      route.textContent = `${time} · ${origin} → ${dest}`;
      content.append(summary, route);
      line.append(arrow, content);
      td.append(line);
      tr.append(td);
      body.append(tr);
      return;
    }
    timeText.className = "schedule-time";
    timeText.textContent = time;
    const placeLabel = travel ? activity : origin && dest ? `${origin} → ${dest}` : dest || origin;
    const mapPlace = dest || origin;
    if (!travel && !candidates?.length && shouldShowNaverMap(activity))
      placeText = createNaverMapLink(plan, mapPlace);
    placeText.classList.add("schedule-place");
    placeText.textContent = placeLabel;
    const placeRow = document.createElement("div");
    placeRow.className = "schedule-place-row";
    placeRow.append(placeText);
    td.append(timeText, placeRow);
    if (travel) {
      const group = document.createElement("div");
      group.className = "travel-group";
      travel.journeys.forEach(([label, startTime, startPlace, endTime, endPlace, journeyNote]) => {
        const journey = document.createElement("div");
        const badge = document.createElement("span");
        const content = document.createElement("div");
        const route = document.createElement("strong");
        journey.className = "traveler-row";
        badge.className = "traveler-badge";
        badge.textContent = label;
        route.className = "traveler-route";
        route.textContent = `${startTime} ${startPlace} → ${endTime} ${endPlace}`;
        content.append(route);
        if (journeyNote) {
          const journeyNoteText = document.createElement("span");
          journeyNoteText.className = "traveler-note";
          journeyNoteText.textContent = journeyNote;
          content.append(journeyNoteText);
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
      td.append(group);
    } else if (candidates?.length) {
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      const summaryTitle = document.createElement("span");
      const toggle = document.createElement("span");
      const openLabel = document.createElement("span");
      const closeLabel = document.createElement("span");
      const list = document.createElement("div");
      details.className = "candidate-details";
      summaryTitle.textContent = `${candidateLabel || activity} 후보 ${candidates.length}곳`;
      toggle.className = "candidate-toggle";
      openLabel.className = "candidate-open-label";
      openLabel.textContent = "펼쳐보기";
      closeLabel.className = "candidate-close-label";
      closeLabel.textContent = "접기";
      toggle.append(openLabel, closeLabel);
      summary.append(summaryTitle, toggle);
      list.className = "candidate-list";
      candidates.forEach(([name, menu]) => {
        const item = document.createElement("div");
        const heading = document.createElement("div");
        const nameText = createNaverMapLink(plan, name, true);
        const menuText = document.createElement("span");
        item.className = "candidate-item";
        heading.className = "candidate-heading";
        nameText.classList.add("candidate-name");
        menuText.className = "candidate-menu";
        menuText.textContent = menu;
        heading.append(nameText);
        item.append(heading, menuText);
        list.append(item);
      });
      details.append(summary, list);
      td.append(details);
    } else {
      const detailText = document.createElement("span");
      detailText.className = "schedule-detail";
      detailText.textContent = [activity, note].filter(Boolean).join(" · ");
      td.append(detailText);
    }
    tr.append(td);
    body.append(tr);
  });
}
