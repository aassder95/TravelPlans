# 여행 데이터 작성 형식

새 여행을 추가할 때 공용 JavaScript를 복사하거나 수정하지 않습니다. 여행 JSON 한 파일을 만들고 매니페스트에 등록한 뒤 검증하면 됩니다.

## 1. 여행 목록 등록

`data/trips.json`의 `trips`에 여행을 등록합니다.

```json
{
  "id": "busan-2026-12",
  "file": "trips/2026-12-busan.json"
}
```

`id`는 전체 여행에서 고유해야 하고 여행 파일 내부의 `id`와 같아야 합니다.

## 2. 여행 기본 정보

```json
{
  "version": 2,
  "id": "busan-2026-12",
  "tab": "26.12.25~26.12.27/부산",
  "region": "부산",
  "dateRange": "2026.12.25 ~ 2026.12.27",
  "color": "#206c4c",
  "days": []
}
```

`region`은 네이버지도 검색어 앞에 붙는 지역명입니다. `days`는 실제 여행 날짜 순서대로 넣고 각 날짜의 `isoDate`는 중복하지 않습니다.

## 3. 날짜별 방문 장소

`visits`는 지도에 표시할 방문 순서입니다. 같은 숙소라도 출발과 복귀는 다른 방문이므로 서로 다른 `id`를 사용합니다.

```json
"visits": [
  { "id": "hotel-start", "name": "숙소", "lng": 129.0000, "lat": 35.0000 },
  { "id": "beach", "name": "해변", "lng": 129.1000, "lat": 35.1000 },
  { "id": "hotel-return", "name": "숙소", "lng": 129.0000, "lat": 35.0000 }
]
```

## 4. 지도 동선

`segments`는 방문 `id`를 연결합니다. 차량은 `drive`, 도보는 `foot`, 케이블카 같은 특수 이동은 `cable`을 사용합니다.

```json
"segments": [
  { "id": "outbound", "mode": "drive", "visits": ["hotel-start", "beach"] },
  { "id": "return", "mode": "drive", "visits": ["beach", "hotel-return"] }
]
```

택일 동선이 있으면 실제 가능한 경로별 구간 `id`를 `distanceRoutes`에 작성합니다. 모든 후보를 한 번에 더하지 않고 각 경로를 따로 계산합니다.

```json
"distanceRoutes": [
  ["route-a-out", "route-a-in"],
  ["route-b-out", "route-b-in"]
]
```

## 5. 일정 행

`type`은 체류 `stay`, 이동 `move`, 개인 교통편 묶음 `travel` 중 하나입니다. 지도 방문 장소에 해당하는 체류 일정에는 `visitIds`를 연결합니다.

```json
{
  "time": "14:10~15:10",
  "type": "stay",
  "to": "이순신광장 점심 권역",
  "activity": "점심 식사",
  "visitIds": ["square-lunch"],
  "candidates": [
    { "name": "식당 이름", "menu": "대표 메뉴 · 대표 메뉴" }
  ]
}
```

이동 일정은 실제 출발지와 도착지를 모두 작성합니다.

```json
{
  "time": "15:10~15:25",
  "type": "move",
  "from": "이순신광장",
  "to": "숙소",
  "activity": "이동",
  "note": "택시"
}
```

## 6. 검증

저장소 루트에서 실행합니다.

```powershell
npm test
```

검증기는 다음 오류를 배포 전에 찾습니다.

- 여행·방문·구간 id 중복
- 필수 속성 또는 좌표 누락
- 존재하지 않는 방문 id를 사용하는 경로
- 존재하지 않는 구간 id를 사용하는 거리 대안
- 지도 방문 장소와 일정의 `visitIds` 연결 누락
- 후보 식당이나 개인 교통편의 필수 정보 누락
