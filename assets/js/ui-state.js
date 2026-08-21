const storageKey = "travelPlans.uiState.v1";

export function loadUiState() {
  try {
    const state = JSON.parse(localStorage.getItem(storageKey));
    return state && typeof state === "object" ? state : null;
  } catch {
    return null;
  }
}

export function saveUiState(state) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // 저장소 사용이 제한된 브라우저에서도 일정표 자체는 그대로 동작한다.
  }
}
