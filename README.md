# 스노우투플러스 네이버 SA 콘솔

기존 `snow2plus_setup.py` CLI를 웹 콘솔로 옮기는 프로젝트.

## 구조

- `backend/` — FastAPI (네이버 검색광고 API 래퍼 + 엔드포인트)
- `web/` — Next.js (TypeScript + Tailwind, App Router)
- `snow2plus_setup.py` — 기존 스크립트 (참고용)

## 실행

### 1. 환경변수

`.env.example`을 `.env`로 복사해서 키 입력:

```
NAVER_API_KEY=...
NAVER_SECRET_KEY=...
NAVER_CUSTOMER_ID=...
```

### 2. 백엔드

```bash
cd backend
pip install -r requirements.txt
uvicorn backend.main:app --reload --port 8000
# (프로젝트 루트에서 실행)
```

확인: http://localhost:8000/health

### 3. 프론트엔드

```bash
cd web
npm run dev
```

확인: http://localhost:3000

## 진행 상황

- [x] 스캐폴딩 (FastAPI + Next.js)
- [ ] `/plan` `/execute` `/stats` 엔드포인트 구현
- [ ] 대시보드 UI + Dry-run 팝업
- [ ] 자동 판단 룰 엔진
- [ ] 스케줄러
