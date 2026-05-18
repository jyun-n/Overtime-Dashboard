# 연장 관리 대시보드 (Overtime Dashboard)

직원 인사정보와 월별 연장근무 데이터를 엑셀로 업로드하고, 추이를 시각화하는 사내 대시보드.

## 스택

- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS, Recharts
- **Backend**: Node.js, Express, TypeScript, Prisma ORM
- **DB**: PostgreSQL 18.3
- **프로세스 매니저**: PM2

## 포트

| 서비스 | 포트 |
| --- | --- |
| Frontend (Vite) | 5174 |
| Backend (Express) | 4001 |

내부망의 다른 PC에서도 접근 가능하도록 `0.0.0.0`으로 바인딩됩니다. Windows 방화벽 인바운드 규칙에 5174/4001 TCP 허용이 필요합니다.

## 디렉토리 구조

```
Overtime-Dashboard/
├── backend/         # Express + Prisma API
├── frontend/        # Vite + React UI
└── README.md
```

## 시작 (개발)

자세한 명령은 각 워크스페이스 README 참조.

```bash
# 백엔드
cd backend && npm install && npm run dev

# 프론트
cd frontend && npm install && npm run dev
```

## 권한 모델

- `ADMIN` — 관리 / 연장 관리 대시보드 모두 접근. 계정 생성·수정·탈퇴, 엑셀 업로드 가능.
- `USER` — 연장 관리 대시보드만 접근.

초기 admin 계정은 DB에 직접 INSERT (운영자 작업).

## 로그

- DB: `LoginLog`, `UploadLog`, `ServerLog` 테이블
- 파일: `backend/logs/*.log` (Winston)
