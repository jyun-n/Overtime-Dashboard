# Overtime Dashboard — 운영 배포 가이드

이 문서는 **운영 서버에 어떤 구성으로 배포되어 있는지**, 그리고 **신규 운영자가 인수할 때 무엇을 알아야 하는지** 정리합니다.

> ⚠️ **이 문서에는 어떤 비밀(비밀번호·시크릿)도 포함하지 않습니다.**
> 실제 비밀 3종은 [§ 7. 시크릿 인수인계](#7-시크릿-인수인계)의 별도 채널로 받아야 합니다.

---

## 1. 시스템 개요

| 항목 | 값 |
|---|---|
| OS | Ubuntu 24.04 LTS |
| Node.js | 20 LTS (NodeSource 패키지) |
| PostgreSQL | 16 (apt 패키지, 동일 서버에 설치) |
| Nginx | 1.24+ (apt 패키지) |
| 프로세스 관리 | pm2 (또는 systemd) |
| 코드 위치 | `/opt/overtime/` |
| 백엔드 포트 | `4001` (127.0.0.1 바인딩, 외부 비공개) |
| 프론트엔드 | Vite 정적 빌드 → Nginx가 서빙 |
| HTTPS | Nginx 종단 |
| SSH | 사내 보안 정책에 따름 — 별도 안내 |

### 토폴로지

```
[브라우저]
   │ HTTPS
   ▼
[Nginx :443]  ── 정적 파일 (/opt/overtime/frontend/dist)
   │
   └─ /api/*  ──▶  [Node API :4001 (loopback)]  ──▶  [PostgreSQL :5432 (loopback)]
```

---

## 2. 디렉토리 구조

```
/opt/overtime/                 ← git clone 루트 (소유자: 운영 계정)
├─ backend/
│  ├─ src/                     ← TypeScript 소스
│  ├─ dist/                    ← 빌드 산출물 (npm run build 결과)
│  ├─ prisma/                  ← schema.prisma, migrations/
│  ├─ logs/                    ← Winston 일일 회전 로그 (gitignore)
│  └─ .env                     ← ⚠️ 시크릿 포함, 절대 커밋 금지
├─ frontend/
│  ├─ src/                     ← React 소스
│  └─ dist/                    ← Vite 빌드 산출물 (Nginx root)
└─ node_modules/               ← workspaces로 hoisting됨
```

**Git remote**: `https://github.com/jyun-n/Overtime-Dashboard.git`

---

## 3. PostgreSQL 구성

- **호스트**: `127.0.0.1`
- **포트**: `5432`
- **데이터베이스**: `overtime_dashboard`
- **애플리케이션 유저**: `overtime_user`
- **비밀번호**: 시크릿 vault 참조 (§ 7)
- **인증**: `pg_hba.conf`에 `host overtime_dashboard overtime_user 127.0.0.1/32 scram-sha-256` 추가

테이블(Prisma 마이그레이션으로 생성됨):
`User`, `LoginLog`, `UploadLog`, `HrEmployee`, `OvertimeRecord`, `ServerLog`, `IpAcl`

---

## 4. 환경 변수 (`/opt/overtime/backend/.env`)

| 키 | 운영 값 | 비고 |
|---|---|---|
| `DATABASE_URL` | `postgresql://overtime_user:<비번>@127.0.0.1:5432/overtime_dashboard?schema=public` | 비번은 시크릿 |
| `PORT` | `4001` | loopback 바인딩 |
| `HOST` | `127.0.0.1` | 외부 노출은 Nginx만 |
| `NODE_ENV` | `production` | ← **이 값이 있어야 쿠키 `Secure` 켜짐** |
| `JWT_SECRET` | 64바이트 hex (시크릿) | `openssl rand -hex 64`로 생성 |
| `JWT_EXPIRES_IN` | `30m` | 세션 30분 |
| `MAX_UPLOAD_SIZE_MB` | `20` | xlsx 업로드 제한 |
| `WITHDRAW_PASSWORD` | 32바이트 base64url (시크릿) | root admin 비번 리셋 백도어 |
| `LOG_LEVEL` | `info` |  |
| `LOG_DIR` | `./logs` | winston-daily-rotate-file |
| `CORS_ORIGIN` | 운영 프론트 origin (예: `https://overtime.example.kr`) | 도메인 확정 후 갱신 |
| `TRUST_PROXY` | `1` | Nginx 1단 뒤. **IP ACL이 이 값에 의존하므로 정확해야 함** |
| `IP_ACL_MODE` | `off` (초기) | IP 접근 제어. `off`/`audit`/`enforce`. **처음엔 `off` 또는 `audit`로 시작** (§12 참고) |

`backend/.env.example`에 위 형식이 들어 있습니다. 복사 후 시크릿만 채우면 됩니다.

---

## 5. 배포 절차 (신규 설치 기준)

### 5.1. 사전 설치

```bash
sudo apt update
# Node 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
# DB
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql
# Nginx
sudo apt install -y nginx
sudo systemctl enable --now nginx
```

### 5.2. DB 준비

```bash
# DB 유저 비번 생성
openssl rand -hex 24       # ← 출력값을 vault에 저장

sudo -u postgres psql
```
```sql
CREATE USER overtime_user WITH PASSWORD '<위 hex>';
CREATE DATABASE overtime_dashboard OWNER overtime_user;
\q
```

### 5.3. 코드 + 의존성

```bash
sudo mkdir -p /opt/overtime && sudo chown $USER:$USER /opt/overtime
cd /opt/overtime
git clone https://github.com/jyun-n/Overtime-Dashboard.git .
cd backend && npm ci && npx prisma generate
cd ../frontend && npm ci
```

> npm ci에서 frontend `esbuild` moderate 경고는 **dev-only** 라 운영 정적 빌드와 무관합니다.

### 5.4. `.env` 작성

```bash
cd /opt/overtime/backend
cp .env.example .env
nano .env                 # § 4 표에 따라 값 채우기 (시크릿은 vault에서)
```

### 5.5. DB 스키마 적용

```bash
cd /opt/overtime/backend
npx prisma migrate deploy
```

### 5.6. 초기 admin 계정 생성

```bash
cd /opt/overtime/backend
npm run hash -- '임시비번'    # 출력된 bcrypt 해시 복사
psql -h 127.0.0.1 -U overtime_user -d overtime_dashboard
```
```sql
INSERT INTO "User" (id, username, "passwordHash", name, role)
VALUES (gen_random_uuid()::text, 'admin', '<위 해시>', '관리자', 'ADMIN');
```
**최초 로그인 후 즉시 비밀번호 변경.**

### 5.7. 빌드 + 실행

```bash
# 백엔드
cd /opt/overtime/backend && npm run build
sudo npm install -g pm2          # 최초 1회
pm2 start dist/index.js --name overtime-api --time
pm2 save && pm2 startup          # 안내 명령 실행

# 프론트엔드
cd /opt/overtime/frontend && npm run build
# → /opt/overtime/frontend/dist 를 Nginx root로
```

### 5.8. Nginx 설정

`/etc/nginx/sites-available/overtime` 작성 후 활성화. 템플릿은 § 8 참고.

```bash
sudo ln -s /etc/nginx/sites-available/overtime /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 5.9. HTTPS 인증서

사내 인증서가 있으면 그것을 사용. 외부 도메인이면 `certbot --nginx` 권장.

---

## 6. 운영 명령

| 작업 | 명령 |
|---|---|
| 백엔드 상태 | `pm2 status overtime-api` |
| 백엔드 로그 (실시간) | `pm2 logs overtime-api` |
| 백엔드 재시작 | `pm2 restart overtime-api` |
| 백엔드 종료 | `pm2 stop overtime-api` |
| 백엔드 빌드 | `cd /opt/overtime/backend && npm run build && pm2 restart overtime-api` |
| 프론트 빌드 | `cd /opt/overtime/frontend && npm run build` (Nginx reload 불필요) |
| Nginx 재로드 | `sudo nginx -t && sudo systemctl reload nginx` |
| Postgres 접속 | `psql -h 127.0.0.1 -U overtime_user -d overtime_dashboard` |
| 마이그레이션 적용 | `cd /opt/overtime/backend && npx prisma migrate deploy` |
| 헬스체크 | `curl http://127.0.0.1:4001/health` |
| 일별 로그 위치 | `/opt/overtime/backend/logs/app-YYYY-MM-DD.log` (30일 보존) |

### 정기 업데이트 (코드만 바뀐 경우)

```bash
cd /opt/overtime
git pull
cd backend && npm ci && npx prisma migrate deploy && npm run build
cd ../frontend && npm ci && npm run build
pm2 restart overtime-api
```

---

## 7. 시크릿 인수인계

본 문서에는 **절대 평문 시크릿을 적지 않습니다.** 다음 3종은 사내 비밀 vault(또는 동등한 안전 채널)로 받으세요.

| # | 항목 | 길이/형식 | 용도 |
|---|---|---|---|
| 1 | DB `overtime_user` 비밀번호 | 48자 hex | `.env`의 `DATABASE_URL` |
| 2 | `JWT_SECRET` | 128자 hex | 세션 쿠키 서명 |
| 3 | `WITHDRAW_PASSWORD` | 43자 base64url | root admin 비번 리셋 백도어 |

추가로 운영자가 받아야 하는 것:
- SSH 접근 (계정/키)
- 사내 인증서/도메인 관리 권한 (HTTPS 갱신)
- 백업/복구 절차서 (사내 표준)

**Slack DM·이메일·메신저로 평문 전송 금지.** 회수 불가능하고 로그에 남습니다.

---

## 8. Nginx 템플릿

`/etc/nginx/sites-available/overtime`:

```nginx
server {
    listen 80;
    server_name <운영도메인>;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name <운영도메인>;

    ssl_certificate     /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    root  /opt/overtime/frontend/dist;
    index index.html;

    client_max_body_size 25m;

    # API 프록시
    location /api/ {
        proxy_pass http://127.0.0.1:4001;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # SPA fallback
    location / {
        try_files $uri /index.html;
    }
}
```

---

## 9. 보안 주의사항 (운영자 필독)

- **`.env`는 절대 커밋 금지.** `.gitignore`에 등록되어 있지만 한 번 더 확인.
- **`NODE_ENV=production`** 이 빠지면 쿠키 `Secure` 플래그가 꺼져 HTTPS에서만 유효한 보호가 약해집니다.
- **`TRUST_PROXY`** 를 절대 `true`로 두지 마세요. 실제 프록시 hop 수(보통 `1`)로 지정. 잘못되면 클라이언트가 X-Forwarded-For를 위조해 로그·rate limit을 우회할 수 있습니다.
- **`CORS_ORIGIN`** 은 운영 프론트 origin과 정확히 일치해야 합니다. 와일드카드 금지.
- **글로벌 rate limit**: `/api/*` IP당 분당 120회. 추가로 login은 15분당 5회, reset-password는 15분당 5회.
- **세션**: HttpOnly + SameSite=Lax + Secure(production) 쿠키. JWT 만료 30분.
- **권한**: 매 요청 DB에서 사용자 `isWithdrawn` / `role` 재검증 → 관리자가 권한을 박탈하면 즉시 반영됨.
- **파일 업로드**: 매직바이트 검증(XLSX/XLS만 통과). HR 업로드는 단일 트랜잭션이라 중간 실패 시 자동 롤백.
- **비밀번호 정책**: 10~128자, 영문 대/소문자·숫자·특수문자 중 3종 이상, 동일 문자 4회 연속 금지, 흔한 약한 비번 차단.
- **마스터 비번(`WITHDRAW_PASSWORD`)** 은 root admin 비번을 잃었을 때만 쓰는 비상 백도어. 정기 회전 권장. **사전 단어(예: `whatabeautifulday`) 금지 — 강한 랜덤값 사용.**
- **IP 접근 제어(ACL)**: 관리자 화면에서 등록한 허용 IP에서만 로그인 가능(`IP_ACL_MODE=enforce` 시). 적용 강도는 환경변수로만 제어 → 잠겼을 때 `off`로 풀 수 있음(§12). **계정 수정/탈퇴/비번 재설정은 작업 관리자 본인 비밀번호로 재인증**(admin 계정 재설정만 마스터 비번).

---

## 10. 트러블슈팅

| 증상 | 원인 후보 | 확인 |
|---|---|---|
| 로그인 실패 + Set-Cookie에 Secure 없음 | `NODE_ENV != production` | `pm2 env overtime-api`로 환경변수 확인 |
| 모든 IP가 `127.0.0.1`로 기록 | `TRUST_PROXY` 미설정 | `.env`의 `TRUST_PROXY=1` 확인 |
| 로그인 후 즉시 401 무한 루프 | localStorage 옛 캐시(version mismatch) | 브라우저 캐시·localStorage 삭제 |
| `prisma migrate deploy` 실패 | DB 권한 부족 | `psql ... -c "\du"`로 overtime_user 권한 확인 |
| 502 Bad Gateway | 백엔드 다운 | `pm2 status` / `curl http://127.0.0.1:4001/health` |
| 업로드 시 413 | Nginx `client_max_body_size` 미설정 | `/etc/nginx/sites-available/overtime`에 `client_max_body_size 25m` |
| 정상 사용자가 로그인 시 "접근이 허용되지 않은 IP" | `IP_ACL_MODE=enforce`인데 IP 미등록, 또는 `TRUST_PROXY` 오설정 | `IP_ACL_MODE=off`로 임시 해제 후 IP 등록/proxy 점검(§12) |

---

## 11. IP 접근 제어(ACL) 운영

관리자 화면(관리 → IP 접근 제어)에서 등록한 **허용 IP에서만 로그인**하도록 막는 기능. 적용 강도는 **환경변수 `IP_ACL_MODE`로만** 제어한다(관리자 UI로는 모드 변경 불가 — 계정 탈취 시에도 모드는 못 끔, 동시에 잠겼을 때 비상탈출 역할).

| 모드 | 동작 |
|---|---|
| `off` | 미적용(기본). 검사 안 함 |
| `audit` | 차단하지 않고 위반 시도만 `ServerLog`에 기록 (실측/관찰용) |
| `enforce` | 등록·활성 IP가 아니면 로그인/요청 차단 |

**안전 규칙**
- 활성 허용 IP가 **하나도 없으면 전체 허용**(게이트 미무장). 첫 IP 등록 시 무장.
- **loopback(127.0.0.1/::1)은 항상 허용** — 헬스체크·서버 내부.
- 검사 기준 IP는 `req.ip`(= `TRUST_PROXY` 의존). **반드시 `TRUST_PROXY=1` 정확히 설정.**

**권장 적용 순서 (자기잠금 방지)**
1. `IP_ACL_MODE=audit` 로 두고 재시작 → 며칠 운영
2. `ServerLog`에서 `login ip blocked`(WARN) 기록으로 실제 사내 IP 분포 확인 (= TRUST_PROXY 정상 여부도 검증)
3. 관리자 화면에서 허용 IP 등록 (현재 접속 IP "채우기" 버튼 활용)
4. 이상 없으면 `IP_ACL_MODE=enforce` + 재시작

**비상탈출(잠겼을 때)**: `.env`에서 `IP_ACL_MODE=off` 로 바꾸고 `pm2 restart overtime-api`.

---

## 12. 변경 이력

| 날짜 | 작성자 | 내용 |
|---|---|---|
| 2026-05-19 | jyun-n | 최초 작성 |
| 2026-06-08 | jyun-n | IP 접근 제어(ACL) 추가 — `IpAcl` 테이블, `IP_ACL_MODE` 환경변수, 계정 작업 본인 비번 재인증 |
