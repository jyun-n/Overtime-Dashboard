# 연장 관리 대시보드 — 보안 검토 보고서

| 항목 | 내용 |
|---|---|
| 시스템명 | 연장 관리 대시보드 (Overtime Management Dashboard) |
| 운영 환경 | 사내망 단일 서버 (Ubuntu 24.04 LTS) |
| 작성자 | jyun-n |
| 작성일 | 2026-05-19 |
| 검토 범위 | 인증/인가, 데이터 보호, 통신 보호, 감사 로그, 인프라 구성 |

---

## 1. 시스템 개요

### 1.1. 용도
- 부서별·직군별·개인별 **월간 연장근무 시간/수당을 시각화**하는 내부 대시보드
- 관리자(ADMIN)가 **인사정보 / 연장근무 엑셀**을 업로드 → 자동 적재 후 차트·표·보고서로 제공
- 일반 사용자(USER)는 본인 부서/조직의 통계만 열람

### 1.2. 다루는 데이터
| 분류 | 항목 | 민감도 |
|---|---|---|
| 인사정보 | 사원번호, 사원명, 소속부서, 직군 | 개인식별정보 |
| 근태/임금 | 자동연장 시간, 초과연장 시간, 연장수당, 시급 | 임금 관련 민감정보 |
| 계정 | 로그인 아이디, bcrypt 해시 (평문 비밀번호 미저장) | 인증정보 |
| 감사 로그 | 로그인/업로드/다운로드 시각·IP·사용자 | 감사용 |

> 환자 정보 등 의료기록은 **취급하지 않음.**

### 1.3. 접근 범위
- 사내망(병원 내부 VLAN)에서만 접근 가능
- 외부 인터넷에서 도달 불가
- 운영서버 SSH는 특정 사내 대역만 허용

---

## 2. 적용된 보안 통제 (OWASP Top 10 기준)

| OWASP 카테고리 | 통제 내역 | 상태 |
|---|---|---|
| A01 Broken Access Control | 모든 API에 인증 미들웨어, 역할 기반(ADMIN/USER) 라우트 분리, **매 요청 DB에서 사용자 상태(isWithdrawn·role) 재검증** | 적용 |
| A02 Cryptographic Failures | • 비밀번호 bcrypt 12 rounds 해싱<br>• JWT HS256 + 64바이트 시크릿<br>• 세션 쿠키 HttpOnly + Secure + SameSite=Lax<br>• 통신 HTTPS 종단(Nginx) | 적용 |
| A03 Injection | Prisma ORM 사용으로 SQL 직접 작성 경로 없음, 모든 입력 zod 스키마 검증 | 적용 |
| A04 Insecure Design | • 글로벌 API rate limit (IP당 분당 120회)<br>• 로그인 rate limit (15분당 5회)<br>• 마스터 비번 리셋 rate limit (15분당 5회)<br>• 파일 업로드 atomic 트랜잭션 | 적용 |
| A05 Security Misconfiguration | • helmet HTTP 보안 헤더<br>• trust proxy 안전 기본값(`loopback`/명시 hop 수)<br>• .env 파일 git 제외(`.gitignore` 확인)<br>• 환경별 secure 쿠키 활성화 | 적용 |
| A06 Vulnerable Components | **npm audit 운영 의존성 0건** (2026-05-19 기준) | 적용 |
| A07 Identification & Authn Failures | • 비밀번호 정책: 10~128자, 영문 대/소·숫자·특수문자 중 3종 이상, 동일 문자 4회 연속 금지, 흔한 약한 비번 사전 차단<br>• 로그인 실패 사유 외부 미노출(공통 `invalid_credentials`)<br>• 세션 30분 자동 만료 | 적용 |
| A08 Software/Data Integrity | • 업로드 파일 매직바이트 검증(XLSX/XLS 시그니처 일치 시에만 통과)<br>• HR 업로드는 단일 트랜잭션 → 중간 실패 시 자동 롤백 | 적용 |
| A09 Logging & Monitoring | LoginLog · UploadLog · ServerLog 3종 감사 테이블 + Winston 일일 회전 파일 로그 (30~60일 보관) | 적용 |
| A10 SSRF | 외부 URL을 호출하는 코드 경로 없음 | 해당 없음 |

---

## 3. 인증 및 세션 관리

- **인증 방식**: 사번 기반 자체 로그인 (bcrypt 해시 비교)
- **세션**: 서버 발급 JWT를 **HttpOnly + SameSite=Lax + Secure 쿠키**로 전달
  - JavaScript에서 토큰 접근 불가 → XSS 시 토큰 탈취 차단
  - SameSite=Lax → CSRF 기본 방어
  - Secure → HTTPS에서만 전송
- **권한 즉시 반영**: 매 요청마다 DB에서 사용자 행을 재조회해 `role` 변경·`isWithdrawn` 처리 즉시 반영
- **세션 만료**: 30분 비활성 시 자동 만료
- **로그아웃**: 서버에서 쿠키 즉시 무효화

---

## 4. 비밀번호 정책

- 최소 10자, 최대 128자
- 영문 대문자 / 영문 소문자 / 숫자 / 특수문자 중 **3종 이상** 포함
- 동일 문자 4회 연속 사용 금지
- 흔히 사용되는 약한 비밀번호 사전 차단 (예: `password1`, `qwerty123` 등)
- 모든 비밀번호는 **bcrypt cost 12로 해싱**되어 저장 (평문 미저장)
- 비밀번호 재설정은 ADMIN만 가능하며, root admin 재설정은 별도 마스터 시크릿 + rate limit + timing-safe 비교 적용

---

## 5. 통신 및 인프라 구성

### 5.1. 토폴로지

```
[사내 PC] ── HTTPS(TLS) ──▶ [Nginx :443] ── 정적 파일(/opt/overtime/frontend/dist)
                                  │
                                  └─ /api/* ──▶ [Node API :4001 (127.0.0.1)]
                                                         │
                                                         └──▶ [PostgreSQL :5432 (127.0.0.1)]
```

### 5.2. 핵심 통제
| 항목 | 설정 |
|---|---|
| 백엔드 바인딩 | `127.0.0.1:4001` — 외부에서 직접 접근 불가, **Nginx만 경유** |
| PostgreSQL 바인딩 | `127.0.0.1:5432` — 외부 차단 |
| TLS | TLS 1.2/1.3, Nginx에서 종단 |
| 방화벽 (ufw) | 22(특정 사내 대역만)/80/443만 허용, 기본 deny |
| HTTPS 인증서 | 사내 CA 인증서 사용 예정 (현재 자체 서명 임시 운영) |
| 보안 헤더 | helmet 미들웨어로 X-Content-Type-Options, X-Frame-Options, Strict-Transport-Security 등 자동 적용 |

### 5.3. 사용 컴포넌트
| 컴포넌트 | 버전 | 비고 |
|---|---|---|
| Ubuntu | 24.04 LTS | 최신 LTS |
| Node.js | 20 LTS (NodeSource) | 운영 표준 |
| PostgreSQL | 16 | apt 패키지 |
| Nginx | 1.24+ | apt 패키지, 리버스 프록시 + 정적 서빙 |
| pm2 | 최신 | 백엔드 프로세스 관리 + systemd 부팅 자동 시작 |

---

## 6. 데이터 보호

| 항목 | 처리 방식 |
|---|---|
| 비밀번호 | bcrypt 12 rounds 해시 (평문 미저장, 미전송) |
| 시크릿 | `.env` 파일에 보관, `chmod 600`, `.gitignore` 제외, GitHub 미커밋 |
| 업로드 파일 | **메모리에서 즉시 파싱 → DB 적재 후 파기, 원본 파일 디스크 미저장** |
| DB 백업 | 운영 정책에 따른 정기 백업(전산실 표준 절차 따름) |
| 감사 로그 | 30일(일반) / 60일(에러) 일일 회전 보관 |

---

## 7. 감사 추적

| 테이블 | 기록 항목 |
|---|---|
| `LoginLog` | 로그인 성공 시각, 사용자, IP, User-Agent |
| `UploadLog` | 업로드/다운로드 시각, 업로더, IP, 파일 타입(HR/OVERTIME/DOWNLOAD) |
| `ServerLog` | 전체 API 요청·이벤트, 레벨(INFO/WARN/ERROR), 메서드/경로/상태코드/응답시간/IP |

별도 기록:
- 사용자 생성·권한 변경·비밀번호 재설정·탈퇴 액션은 ServerLog에 별도 사유 코드로 기록
- 로그인 실패·rate limit 발생도 WARN 레벨로 기록

---

## 8. 위협 모델 및 대응 요약

| 위협 시나리오 | 대응 |
|---|---|
| 자격 증명 탈취(피싱·키로거 등) | 강한 비밀번호 정책 + 세션 30분 만료 + IP 기반 rate limit |
| 비밀번호 무차별 대입 | 로그인 15분당 5회 제한, 응답 사유 동일화로 사용자 존재 여부 비노출 |
| SQL 인젝션 | Prisma ORM으로 prepared statement 강제, raw query 미사용 |
| XSS로 인한 세션 탈취 | HttpOnly 쿠키로 토큰 JS 접근 차단, React 자동 escape |
| CSRF | SameSite=Lax 쿠키 + same-origin 운영(Nginx 경유) |
| 파일 업로드 우회(웹쉘 등) | 확장자 + 매직바이트 이중 검증, 메모리 처리, 디스크 미저장 |
| 권한 상승(일반 ADMIN → root admin) | root admin 비번 재설정 시 별도 마스터 시크릿 필요 + rate limit + timing-safe 비교 |
| 권한 박탈 후에도 토큰 유효 | 매 요청 DB 재검증으로 권한 변경 즉시 반영 |
| IP 위조로 로그/rate limit 우회 | trust proxy 명시(`loopback`/hop 수), 클라이언트 X-Client-IP 헤더 무시 |

---

## 9. 알려진 잔존 위험 및 보완 계획

| 항목 | 현재 상태 | 보완 계획 |
|---|---|---|
| HTTPS 인증서 | 자체 서명(self-signed) 임시 운영 | **전산실 사내 CA 인증서로 교체 예정** |
| 사내 DNS 등록 | 없음(IP 직접 접근) | 사내 도메인 등록 후 인증서 발급 일원화 |
| DB 백업 정책 | 미정 | 전산실 정기 백업 정책에 편입 |

---

## 10. 인수인계 및 운영 책임

| 구분 | 내용 |
|---|---|
| 코드 저장소 | GitHub (사내 운영자 접근 권한 부여) |
| 시크릿 보관 | 별도 비밀 vault (DB 비밀번호, JWT_SECRET, 마스터 시크릿) |
| 운영 절차서 | `DEPLOY.md` (저장소 내 포함) |
| 변경 이력 | git commit log |
| 운영자 | jyun-n |

---

## 11. 결론

본 시스템은 다음을 충족하여 **사내 운영 시작 시점의 보안 기준선을 통과**합니다:

- OWASP Top 10 카테고리별 통제 적용
- 운영 의존성 알려진 취약점 0건 (npm audit 기준)
- 감사 로그 3계층(로그인/업로드/요청) 자동 수집
- 사내망 한정 + HTTPS + helmet + 다중 rate limit 적용
- 시크릿 분리, 평문 비밀번호 미저장
- 권한 즉시 반영 메커니즘 적용

전산실에서 **사내 CA 인증서 발급**과 **사내 DNS 호스트네임 등록**이 완료되면 자체 서명 인증서를 정식 인증서로 교체할 예정입니다.

---

*본 보고서는 운영 시점(2026-05-19) 기준이며, 코드/구성 변경 시 갱신됩니다.*
