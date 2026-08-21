# 대한민국 지도 출처

`korea-provinces.svg`와 `city-overlays.json`의 행정구역 경계는 [swcho/korea-maps](https://github.com/swcho/korea-maps)의 통계청 SGIS 기반 자료를 사용했습니다.

- 원본 저작권: Copyright (c) 2022 StatGarten
- 라이선스: MIT License
- 원본 저장소: https://github.com/swcho/korea-maps
- 사용 파일: 전국 시도 경계 SVG와 경기·전북·전남 시군구 경계 SVG

`city-overlays.json`은 홈 지도의 확대 단계에서 표시하는 전국 17개 시·도의 시·군·구 경계를 추출한 데이터입니다.

지역별 SVG의 독립 좌표를 그대로 확대하지 않고, 각 지역의 실제 외곽 범위를 전국 SVG의 해당 도 외곽 범위에 맞춰 정렬합니다. 재생성은 `node scripts/align-map-overlays.mjs`를 사용합니다.
