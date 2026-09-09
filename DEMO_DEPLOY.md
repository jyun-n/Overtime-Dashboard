# 데모(체험용) 인스턴스 배포 — `https://10.10.248.87:8443`

중앙대학교병원 대상 **체험용** 인스턴스를 운영 서버에 나란히 올리는 절차.
도메인/DNS 신청 없이 **IP + 8443 포트**로 접속하고, 운영(`ot-board.cauhs.or.kr`)과는
**코드·프로세스·DB·설정이 전부 분리**된다. 공유하는 것은 Nginx와 PostgreSQL 데몬뿐.

```
운영   :443  → /opt/overtime      → pm2 overtime-api      :4001 → DB overtime_dashboard
데모  :8443  → /opt/overtime-demo → pm2 overtime-demo-api :4002 → DB overtime_demo
```

> **운영 보호 원칙** — pm2는 항상 프로세스명을 지정(`restart all`·`kill` 금지),
> Nginx는 `reload`만(`restart` 금지), PostgreSQL은 건드리지 않는다. 같은 서버에
> 외래 세션 대시보드(`dashboard-api`)도 함께 돌고 있다.

---

## 0. 사전 준비 (이것부터)

1. **망 도달 확인** — 데모를 볼 PC에서:
   ```
   Test-NetConnection 10.10.248.87 -Port 8443      # PowerShell
   ```
   `TcpTestSucceeded : False` 면 아래 5-2(ufw) 이후에도 안 되는지 다시 확인하고,
   그래도 막히면 원내 방화벽(광명↔서울 구간) 개방을 전산팀에 요청해야 한다.
2. **로고 파일** — `중앙대학교병원` 로고 PNG. 배경이 짙은 남색이므로 **밝은/흰색 버전 + 투명 배경**,
   높이 100px 이상 권장.
3. **서버 여유 자원 확인** — 운영과 같은 서버이므로 메모리가 빠듯하면 OOM으로
   **운영까지 같이 죽는다**. 데모 백엔드는 약 150~250MB를 쓴다.
   ```bash
   free -h          # available 이 1GB 미만이면 데모 보류하고 먼저 상담
   df -h /          # 여유 5GB 미만이면 보류
   ```
4. **인증서 경고는 정상** — 서버 인증서는 `*.cauhs.or.kr` 용이라 IP로 접속하면
   "이 사이트는 안전하지 않습니다"가 뜬다. `고급 → 계속`으로 진입. (통신은 암호화됨)
   데모 시작 전에 미리 안내하면 된다.

---

## 1. DB 생성 (운영 DB와 별도 계정)

```bash
openssl rand -hex 24        # 출력값 = 데모 DB 비번, 메모해 둘 것
sudo -u postgres psql
```
```sql
CREATE USER overtime_demo_user WITH PASSWORD '<위 hex>';
CREATE DATABASE overtime_demo OWNER overtime_demo_user;
\q
```

## 2. 코드 배치

```bash
sudo mkdir -p /opt/overtime-demo && sudo chown $USER:$USER /opt/overtime-demo
cd /opt/overtime-demo
git clone -b demo https://github.com/jyun-n/Overtime-Dashboard.git .   # ⚠️ demo 브랜치
npm ci                       # ⚠️ 반드시 저장소 루트에서 (npm workspaces)
```

**로고는 `demo` 브랜치에 포함되어 있다** — 별도 전송 불필요. clone 후 확인만:
```bash
ls -l /opt/overtime-demo/frontend/public/brand/logo-cau.png    # 약 35KB
```

## 3. `.env` 작성

```bash
cd /opt/overtime-demo/backend
cp .env.example .env
openssl rand -base64 32      # JWT_SECRET 용 — 운영과 다른 값 사용
openssl rand -base64 32      # WITHDRAW_PASSWORD 용
nano .env
```
```ini
DATABASE_URL="postgresql://overtime_demo_user:<1번의 hex>@127.0.0.1:5432/overtime_demo?schema=public"
PORT=4002
HOST=127.0.0.1
NODE_ENV=production
JWT_SECRET="<랜덤값 — 운영과 반드시 다르게>"
WITHDRAW_PASSWORD="<랜덤값>"
CORS_ORIGIN=https://10.10.248.87:8443
TRUST_PROXY=1
IP_ACL_MODE=off
LOG_LEVEL=info
```
> `IP_ACL_MODE=off` — 체험자 IP를 미리 알 수 없으므로. 운영 `.env`는 별도 파일이라
> `enforce` 설정에 아무 영향이 없다.

## 4. 스키마 + 관리자 계정

```bash
cd /opt/overtime-demo/backend
npx prisma migrate deploy
npm run hash -- '데모용임시비번'          # 출력된 bcrypt 해시 복사
psql -h 127.0.0.1 -U overtime_demo_user -d overtime_demo
```
```sql
INSERT INTO "User" (id, username, "passwordHash", name, role)
VALUES (gen_random_uuid()::text, 'admin', '<위 해시>', '관리자', 'ADMIN');
```
데이터는 비어 있는 상태로 시작한다. 데모 때 그쪽 병원 엑셀을 직접 올려 보게 하는 것이
가장 설득력 있고, 광명병원 실데이터 노출 문제도 없다.

## 5. 빌드 + 기동

### 5-1. 백엔드 · 프론트
```bash
cd /opt/overtime-demo
npx prisma generate --schema backend/prisma/schema.prisma   # npm ci 후 필수
npm --workspace backend run build

cd /opt/overtime-demo/frontend
VITE_ORG_NAME='중앙대학교병원' VITE_LOGO_URL='/brand/logo-cau.png' npm run build

grep -o '/brand/logo-cau.png' dist/assets/index-*.js | head -1   # 주입 확인
```
> 로고/기관명은 **빌드 시점에 주입**된다. 환경변수를 빼먹고 빌드하면 광명병원 로고가 그대로 나온다.

```bash
cd /opt/overtime-demo/backend
pm2 start dist/index.js --name overtime-demo-api --time
pm2 save
curl -s http://127.0.0.1:4002/health; echo      # {"ok":true}
```

### 5-2. Nginx + 방화벽
```bash
sudo tee /etc/nginx/sites-available/overtime-demo > /dev/null <<'EOF'
server {
    listen 8443 ssl;
    http2 on;
    server_name _;

    ssl_certificate     /etc/ssl/certs/star_cauhs_or_kr.crt;
    ssl_certificate_key /etc/ssl/private/star_cauhs_or_kr.key;

    root  /opt/overtime-demo/frontend/dist;
    index index.html;

    client_max_body_size 25m;

    access_log /var/log/nginx/overtime-demo.access.log;
    error_log  /var/log/nginx/overtime-demo.error.log;

    location /api/ {
        proxy_pass http://127.0.0.1:4002;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri /index.html;
    }
}
EOF
sudo ln -sf /etc/nginx/sites-available/overtime-demo /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx      # ⚠️ restart 아님 (운영·외래 서비스 동시 중단)
sudo ufw allow 8443/tcp
```

## 6. 검증

```bash
curl -k -s -o /dev/null -w "데모 프론트:%{http_code}\n" https://127.0.0.1:8443/
curl -k -s -o /dev/null -w "데모 API   :%{http_code}\n" https://127.0.0.1:8443/api/auth/me
curl -s -o /dev/null -w "운영 무영향  :%{http_code}\n" -k https://127.0.0.1/     # 200 유지 확인
pm2 status                                        # 두 프로세스 모두 online
```
브라우저에서 `https://10.10.248.87:8443` → 인증서 경고 통과 → **중앙대학교병원 로고** 확인 → admin 로그인.

---

## 7. 데모 종료 후 철거

```bash
pm2 delete overtime-demo-api && pm2 save
sudo rm /etc/nginx/sites-enabled/overtime-demo
sudo nginx -t && sudo systemctl reload nginx
sudo ufw delete allow 8443/tcp
sudo -u postgres psql -c 'DROP DATABASE overtime_demo;' -c 'DROP USER overtime_demo_user;'
rm -rf /opt/overtime-demo
```

## 8. 주의사항

- **운영 코드를 절대 재빌드하지 말 것.** 모든 명령은 `/opt/overtime-demo` 에서 실행한다.
  `/opt/overtime` 에서 로고 환경변수를 붙여 빌드하면 운영 화면 로고가 바뀐다.
- **브랜치 분리** — 데모는 `demo` 브랜치, 운영(`/opt/overtime`)은 `main`. 운영에서 정기 배포로
  `git pull` 을 몇 번 하든 데모용 변경이 운영에 들어갈 경로가 없다. 데모 철거 시 브랜치도 삭제.
- **Nginx는 `reload`만.** `nginx -t` 통과 후 reload는 무중단이며, 설정 오류가 있으면 reload
  자체가 실행되지 않아 운영이 보호된다. `restart` 는 운영·외래 서비스가 동시에 끊긴다.
- 데모 인스턴스는 `IP_ACL_MODE=off` + 8443 전면 개방이므로 **로그인이 유일한 보호막**이다.
  체험용 계정 비번을 충분히 강하게 두고, 데모가 끝나면 §7로 즉시 내린다.
- 두 인스턴스의 `JWT_SECRET`은 반드시 다르게 — 데모 토큰으로 운영에 들어갈 수 없어야 한다.
- 로그인 5회 실패 시 15분 잠김. 데모 중 잠기면 `pm2 restart overtime-demo-api` 로 즉시 해제
  (카운터가 메모리에만 있음). **프로세스명을 반드시 지정할 것.**
