# Clothing-Fit

> 사용자의 실제 체형 기반 2D·3D 가상 피팅을 통해 온라인 의류의 핏과 스타일을 직관적으로 확인할 수 있는 플랫폼

---

## 🛠 Backend 기술 스택 (Tech Stack)

| 영역            | 기술                         |
| --------------- | ---------------------------- |
| Package Manager | pnpm                         |
| Runtime         | Node.js                      |
| Language        | TypeScript                   |
| Framework       | Express                      |
| Database        | PostgreSQL                   |
| ORM             | Prisma                       |
| Authentication  | JWT + Refresh Token          |
| Security & Traffic | Rate Limiting             |
| Validation      | Zod                          |
| API Docs        | Swagger (zod-to-openapi)     |
| Environment     | dotenv                       |
| Code Quality    | biome                        |
| Deployment      | AWS s3, AWS EC2, AWS RDS     |

## 📂 Backend 폴더 구조 (Folder Structure)

```text
prisma/
├── schema.prisma       # Prisma 스키마 정의
└── seed.ts             # 초기 데이터 시드

src/
├── app.ts              # Express 앱 설정
├── server.ts           # 서버 실행 진입점
│
├── common/             # 전역 공통 로직
│   ├── errors/         # 커스텀 에러 및 에러 처리
│   ├── middleware/     # Express 미들웨어
│   ├── types/          # 공통 타입 선언
│   └── utils/          # 유틸 함수
│
├── config/             # 환경 및 설정 파일
│
├── lib/     # 외부 시스템 연결 계층
│   ├── logger/         # Winston 등 로깅
│   ├── prisma/         # Prisma 클라이언트
│   └── storage/        # 파일 저장소
│
├── modules/            # 기능(도메인) 단위 모듈
│
└── routes/             # 라우트 통합

tests/                  # 테스트
```


## 📝 커밋/브랜치/PR 컨벤션 (Commit/Branch/PR Convention)

### 타입 목록

| 타입 | 설명 |
| ------------ | -------------------------------------------------- |
| **feat** | 새로운 기능 추가 |
| **fix** | 버그 수정 |
| **docs** | 문서 수정 (코드 변경 없음) |
| **style** | 코드 포맷팅, 세미콜론 등 스타일 변경 (논리 변경 없음) |
| **refactor** | 리팩토링 (기능 변화 없음) |
| **test** | 테스트 관련 코드 추가/수정 |
| **chore** | 빌드, 패키지 매니저 설정 등 기타 작업 |
| **comment** | 필요한 주석 추가 및 변경 |
| **rename** | 파일 혹은 폴더명을 수정하거나 옮기는 작업만인 경우 |
| **remove** | 파일을 삭제하는 작업만 수행한 경우 |
| **!HOTFIX** | 급하게 치명적인 버그를 고쳐야하는 경우 |

### 커밋 메시지 규칙
```text
지라티켓키 타입 : 커밋 내역
1. 설명
2. 설명
3. 설명
예시)
WAL-01 feat : 로그인 기능
1. 로그인 api 연결
2. 로그인 버튼 생성
3. 로그인 연결
```

### 브랜치 이름 규칙
```text
타입/제목
예시)
feat/health-check
```

### PR 제목 규칙
```text
지라티켓키 타입 : 설명
예시)
WAL-01 : 로그인 기능 구현
```

---

## 🚀 로컬 실행 방법 (Getting Started)

프로젝트를 로컬 환경에서 실행하고 테스트하는 방법입니다.

### 1. 레포지토리 클론 및 폴더 이동

```bash
git clone https://github.com/prgrms-fullcycle-devcourse/webfull_9_10_ClothingFit_BE

cd webfull_9_10_ClothingFit_BE
```

### 2. 패키지 설치

```bash
pnpm install
```

### 3. 환경 변수 설정

프로젝트 최상위 경로에 `.env` 파일을 생성하고 `.env.example`을 참고하여 환경 변수를 채워주세요.

### 4. 프로젝트 실행

```bash
pnpm dev        # 개발 모드 실행

pnpm start      # 프로덕션 실행
```

---

## 🧑‍💻 팀원 소개 (Team)

| 프로필                                                         | 이름   | 역할      | GitHub                                             |
| ------------------------------------------------------------- | ------ | --------- | -------------------------------------------------- |
| <img src="https://github.com/hollyjelly.png" width="50" />    | 나현지 | Fitting / Closet | [@hollyjelly](https://github.com/hollyjelly)  |
| <img src="https://github.com/doeun9903.png" width="50" />     | 박도은 | Auth / Items / Users | [@doeun9903](http://github.com/doeun9903) |
| <img src="https://github.com/s576air.png" width="50" />       | 한재민 | Notifications / Posts | [@s576air](https://github.com/s576air)   |
