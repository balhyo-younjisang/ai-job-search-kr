[한국어](README.md) | [English](README-en.md)

<p align="center">
  <img src="assets/mascot/pip_flight_loop.gif" alt="전령새 Pip" width="200">
</p>

# AI Job Search

*내 컴퓨터에서 실행하는 취업 지원 워크플로.*

<p align="center">
  <a href="https://trendshift.io/repositories/43622?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-43622" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/43622/daily" alt="업스트림 MadsLorentzen/ai-job-search의 Trendshift 순위" width="250" height="55"/></a>
</p>

[![업스트림 CI](https://github.com/MadsLorentzen/ai-job-search/actions/workflows/ci.yml/badge.svg)](https://github.com/MadsLorentzen/ai-job-search/actions/workflows/ci.yml)

[Claude Code](https://claude.com/claude-code)를 기반으로 만든 AI 취업 지원 프레임워크입니다. 저장소를 복제하고 프로필을 채우면 AI 에이전트가 채용 공고 적합도를 평가하고, CV와 자기소개서를 맞춤 작성하며, 면접 준비를 돕습니다. 이 한국 포크에는 국내 채용 포털 검색 스킬 5개와 범용 검색 스킬 2개가 포함되어 있습니다. 위 배지는 이 포크가 아닌 업스트림 프로젝트의 순위와 CI 상태를 나타냅니다.

> 참고: 이 프로젝트는 독립 오픈소스 프로젝트이며 Anthropic과 제휴하거나 Anthropic의 보증·후원·유지보수를 받지 않습니다. Anthropic과 Claude Code는 이 워크플로가 사용하는 도구를 설명하기 위해서만 언급합니다.
>
> 이 프로젝트와 연계된 암호화폐, 토큰 또는 유료 후원 프로그램은 없습니다. 그런 주장은 승인되지 않은 것이므로 사기로 간주해야 합니다. 업스트림 프로젝트를 지원하려면 아래 저자의 Ko-fi 링크나 GitHub 기여를 이용하세요.

<a id="does-it-actually-work"></a>
## 실제로 효과가 있나요?

다음은 **업스트림 저자 Mads Lorentzen의 경험**입니다. 지구물리학자였던 그는 2025년 말 직장을 잃은 뒤 자신의 구직 활동을 위해 이 프레임워크를 만들었습니다. 이 저장소의 `/scrape`, `/apply`, `/interview` 워크플로를 매주 실제 구직에 사용했고, 만난 모든 고용주에게 그 사실을 솔직하게 밝혔습니다. 불이익보다는 진지한 기술 대화로 이어지는 경우가 많았다고 합니다.

맞춤 지원서 69건, 1차 면접 20건, 최종 계약 1건을 거쳐 그는 2026년 6월 AI 엔지니어로 일을 시작했습니다. 이는 업스트림 저자의 개인 사례이며 결과를 보장하지 않습니다. 이 저장소는 그가 사용한 절차를 반복 가능한 워크플로 규칙으로 제공합니다.

*전체 지원 퍼널을 포함한 자세한 이야기는 업스트림 저자의 [LinkedIn](https://www.linkedin.com/in/mads-lorentzen/)에서 볼 수 있습니다.*

<p align="center">
  <i>일요일 하루를 자기소개서 작성에서 아껴 주었나요? 커피 한 잔을 생각해 주세요.<br>
  취업으로 이어졌나요? 그럼 두 잔도 좋습니다.</i> ☕
</p>

<p align="center">
  <a href="https://ko-fi.com/madslorentzen">
    <img src="https://storage.ko-fi.com/cdn/kofi3.png?v=6" alt="ko-fi.com에서 업스트림 저자에게 커피 후원하기" height="40">
  </a>
</p>

<a id="what-this-is"></a>
## 프로젝트 소개

Claude Code를 종합 취업 지원 도우미로 만드는 구조화된 워크플로입니다. 자기 프로필 작성, 적합도 평가, 작성자-검토자 지원서 파이프라인으로 구성된 핵심 절차는 **언어와 국가에 구애받지 않습니다**. 이 한국 포크는 잡코리아, 사람인, 링커리어, 고용24, 인크루트에 맞춘 검색 스킬을 제공하고 LinkedIn과 freehire.me도 함께 지원합니다.

```text
/setup          /scrape              /apply <url>
  |                |                     |
  v                v                     v
프로필 작성     채용 포털 검색        적합도 평가
                 결과 중복 제거       점수와 추천 제시
  |                |                     |
  v                v                     v
프로필 파일     적합도순 후보 제시     맞춤 CV + 자기소개서 작성
준비 완료       /rank로 일괄 평가      (LaTeX)
                   |                     |
                   v                     v
               후보 선택            별도 검토 에이전트 평가
               -> /apply            -> 수정 -> 최종 결과
```

구조화된 평가 기준, 미래 지향적인 자기소개서 구성, 선택적 급여 벤치마킹 등 경력 관리 모범 사례를 워크플로 규칙으로 제공합니다.

<a id="prerequisites"></a>
## 준비 사항

- [Claude Code](https://claude.com/claude-code) CLI. Claude 구독이나 Anthropic API를 사용하거나, Codex·Antigravity·Gemini CLI 같은 다른 에이전트 도구를 사용할 수 있습니다. 비용과 무료 사용 가능 여부는 선택한 도구, 구독, API 사용량과 실행 환경에 따라 달라집니다. 다른 에이전트에서는 [`AGENTS.md`](AGENTS.md)부터 읽으세요. 이 파일은 `.claude/`의 표준 워크플로와 프로필을 단일 출처로 가리키는 thin-pointer 지침이며, `.agents/skills/`의 포털 CLI는 이식 가능한 Agent Skills 형식입니다. 아래 슬래시 명령 예시는 Claude Code 기준이며 다른 에이전트에서 호출하는 방식은 해당 실행 환경에 따릅니다.
- Python 3.10 이상
- 채용 검색 CLI용 [Bun](https://bun.sh)
- `lualatex`와 `xelatex`를 제공하는 LaTeX 배포판: [TeX Live](https://tug.org/texlive/), [MacTeX](https://tug.org/mactex/), [TinyTeX](https://yihui.org/tinytex/) 또는 [MiKTeX](https://miktex.org/). 일부 MiKTeX 환경에서는 `pdflatex`가 `fontawesome5` 글꼴 확장 오류를 일으킬 수 있어 CV는 `lualatex`로 컴파일합니다. `fontspec`이 필요한 `cover.cls` 자기소개서는 `xelatex`로 컴파일합니다. TinyTeX나 BasicTeX 같은 최소 설치 환경에서는 [SETUP.md](SETUP.md#minimal-tex-install-tinytexbasictex)의 추가 패키지도 설치하세요.
- 선택 사항: `/apply`의 ATS 파싱 검사용 `pip install pypdf`(BSD 라이선스, Poppler 불필요). [`tools/verify_pdf.py`](tools/verify_pdf.py)는 `pypdf`를 먼저 사용하고, 실패하거나 설치되지 않았으면 Poppler의 `pdftotext`를 사용합니다(macOS: `brew install poppler`, Debian/Ubuntu: `apt install poppler-utils`, Windows: `choco install poppler`). 둘 다 없으면 시각적 키워드 검토로 축소 실행합니다.

<a id="quick-start"></a>
## 빠른 시작

> 🎥 **먼저 실제 사용 모습을 보고 싶나요?** [The Next New Thing의 실습 영상](https://www.youtube.com/watch?v=HoVxjMNFYv4)에서 설정부터 완성된 지원서까지의 흐름을 볼 수 있습니다. 2026년 8월에 녹화되어 현재 명령과 일부 차이가 있을 수 있습니다.

### 1. 저장소 복제

```bash
git clone "<YOUR_REPOSITORY_URL>" ai-job-search-kr
cd ai-job-search-kr
```

`<YOUR_REPOSITORY_URL>`을 현재 한국 포크나 개인 비공개 복사본의 URL로 바꾸세요. 원본 업스트림에 기여할 목적이라면 `gh repo fork MadsLorentzen/ai-job-search --clone`을 사용할 수 있습니다. 업스트림을 새로 복제한 저장소에는 이 한국 포크의 추가 포털이 포함되어 있지 않습니다.

> [!IMPORTANT]
> `/setup`은 이름, 연락처, 경력, 희망 급여 같은 개인정보를 **Git 추적 대상 파일**에 기록합니다. 공개 저장소나 공개 포크에서 그대로 실행한 뒤 푸시하지 마세요. 개인 구직용이라면 먼저 비공개 저장소를 만들고 원본을 `upstream`으로 연결하는 방식을 권장합니다. [SETUP.md 8절](SETUP.md#8-pulling-upstream-updates-into-your-fork)에 설정 방법이 있으며 업데이트 도구도 같은 방식으로 사용할 수 있습니다. 공개 저장소의 포크는 비공개로 만들 수 없으므로 공개 포크는 기여용으로만 사용하세요.

### 2. 채용 검색 도구 설치

```bash
python3 tools/install_portal_clis.py   # Windows: python tools\install_portal_clis.py
```

이 명령은 `.agents/skills/*/cli/` 아래의 모든 포털 CLI를 자동 발견해 `bun install`을 실행합니다. `/add-portal`로 만든 포털이나 다른 포크에서 복사한 포털도 별도 등록 없이 포함됩니다. `package.json`에 설치 시점 생명주기 스크립트가 선언된 CLI는 실행하지 않고 건너뛴 사실을 보고합니다. `--dry-run`으로 설치 대상을 미리 확인할 수 있습니다.

현재 포함된 7개 포털 CLI는 모두 런타임 의존성이 없어 설치 없이 `bun`으로 실행할 수 있습니다. `bun install`은 테스트와 타입 검사에 쓰는 TypeScript 개발 의존성만 설치합니다.

### 3. 프로필 설정

```bash
claude
# Claude Code 안에서 실행:
/setup
```

`/setup`은 세 가지 입력 경로를 제공합니다. 자료가 들어 있는 `documents/` 폴더(CV PDF, LinkedIn 내보내기, 학위·성적 자료, 추천서, 과거 지원서)를 읽거나, 채팅에 CV 하나를 붙여 넣거나, 인터뷰 형식으로 프로필을 작성할 수 있습니다. 보유 자료를 자동으로 감지해 질문하며, 문서 폴더 방식은 같은 자료에 반복 실행해도 안전합니다. 폴더 구성은 `documents/README.md`를 참고하세요.

### 4. 채용 공고 검색

```bash
/scrape
```

프로필에 맞는 공고를 여러 포털에서 검색하고 중복을 제거한 뒤 적합도순으로 보여 줍니다. 바로 후보 하나를 골라 `/apply`를 실행하거나, 결과가 많으면 `/rank`로 모든 공고를 일괄 평가해 우선순위 목록을 만들 수 있습니다.

### 5. 지원서 작성

```bash
/apply https://www.jobkorea.co.kr/Recruit/GI_Read/50159061
```

일부 포털이 자동 접근을 막아 URL을 가져오지 못하면 공고 전문을 직접 붙여 넣을 수 있습니다.

```bash
/apply <채용 공고 전문을 여기에 붙여 넣으세요>
```

적합도 평가, CV와 자기소개서 초안 작성, 두 번째 에이전트 검토, 수정, 최종 결과 제시를 차례로 실행합니다. 평가 전에 공고 무결성 검사가 숨겨진 텍스트, 보이지 않는 문자, 지시문 형태의 문장과 숨겨진 링크를 확인하고, 한 줄 판정으로 평가를 시작합니다. 공고 수집·평가·검토 에이전트는 읽기 전용 권한으로 실행됩니다.

채용 공고는 신뢰할 수 없는 입력으로 처리합니다. 워크플로는 공고 본문에 삽입된 지시를 따르거나 본문의 링크를 자동으로 가져오지 않습니다. 다만 이 방어는 샌드박스가 아닌 지침 수준이므로 처음 보는 채용 사이트에서는 제출 전에 가져온 내용과 생성 파일을 확인하세요. 자세한 내용은 [SECURITY.md](SECURITY.md)를 참고하세요.

<a id="other-commands"></a>
## 기타 명령

`/setup`, `/scrape`, `/apply`가 핵심 워크플로를 구성합니다. 프로필을 만든 뒤 다음 10개 명령으로 기능을 확장할 수 있습니다.

- **`/interview`**: 추적 중인 지원 건의 예정 면접을 준비합니다. 실제 공고, 면접관이 읽은 CV와 자기소개서, 이전 단계의 피드백을 이용해 단계별 준비 자료를 만들고, 검증 후 사용 규칙에 따라 회사와 면접관을 조사합니다. 예상 질문을 STAR 사례에 연결하고 `07-interview-prep.md`의 역할극 절차로 모의 면접을 진행합니다. 경험이 부족한 부분은 꾸며 내지 않고 솔직한 연결 답변을 만듭니다.
- **`/outcome`**: 면접 단계, 합격 제안, 불합격, 무응답 등 지원 결과를 기록합니다. 제출한 CV·자기소개서·공고를 `documents/applications/<company>_<role>/`에 보관하고, `/setup` 경로 A가 읽을 수 있는 `outcome.md`와 추적기를 갱신합니다. `/outcome followup`은 기본 10일 동안 답이 없는 지원 건을 찾아, 이미 제출한 자료의 사실만으로 채널에 맞는 후속 연락 초안을 만듭니다. 사용자의 문체를 반영한 초안만 제시하고 직접 발송하지 않으며 지원 건당 최대 두 번만 제안합니다. 면접 단계를 기록하는 시점에는 감사 메모도 제안합니다. 지원 결과가 몇 건 쌓이면 `/setup`으로 돌아가 실제 면접으로 이어진 사례를 바탕으로 평가 기준을 보정하도록 안내합니다.
- **`/notion-sync`**: 공식 Notion MCP 서버(OAuth, API 키 불필요)를 통해 파이프라인의 단방향 읽기 전용 보기를 Notion 데이터베이스에 게시합니다. 순위가 매겨진 공고와 추적 중인 지원 건을 각각 한 행으로 만들고, 행마다 한 번 작성하는 브리핑 페이지를 제공합니다. 저장소 파일이 계속 기준 데이터이며 역방향 동기화는 하지 않고, 문서는 파일명만 동기화합니다. `/html-report`가 오프라인 상세 대시보드라면 이 명령은 여러 기기에서 빠르게 보는 현재 상태입니다.
- **`/gmail-sync`**: Gmail 커넥터로 열린 지원 건의 면접 초대, 과제 링크, 합격 제안, 불합격 신호를 읽고, 출처 이메일을 붙인 변경안 묶음을 제시합니다. 사용자가 승인하기 전에는 추적기나 `outcome.md`를 쓰지 않습니다. `hired`와 `offer_declined`는 사용자가 결정하며, 충돌하거나 매칭되지 않는 신호는 추측하지 않고 `/outcome` 수동 검토 대상으로 표시합니다.
- **`/rank`**: `/scrape`와 `/apply` 사이에서 새로 수집한 공고를 적합도 프레임워크의 다섯 기준으로 일괄 평가합니다. 병렬 에이전트가 공고를 가져와 각 평가 항목을 채웁니다. 강점과 부족한 점을 정직하게 표시하고, 필수 제외 조건·마감 임박·종료 공고를 반영해 순위를 만듭니다. 번호를 고르면 전체 `/apply` 워크플로로 넘깁니다.
- **`/expand`**: 프로필에 이미 연결한 공개 출처(GitHub 저장소, 포트폴리오, Kaggle, Google Scholar)를 살펴보고 기재된 과정과 자격의 강의계획을 찾아 역량을 보강합니다. 발견한 역량에는 출처 태그를 붙입니다. `/setup` 직후 문서만으로 드러나지 않는 역량을 보완할 때 유용합니다.
- **`/upskill`**: 프로필, 추적 중인 공고, `/rank`가 `job_scraper/seen_jobs.json`에 기록한 미추적 공고의 역량 차이를 분석합니다. `/upskill <URL>`로 공고 하나만 분석할 수도 있습니다. 우선순위 히트맵과 웹에서 검증한 학습 자료·예상 시간이 포함된 학습 계획을 만듭니다. 지원서 작성 사이에 경력 개발 계획을 세울 때 활용할 수 있습니다.
- **`/html-report`**: `job_search_tracker.csv`와 지원서 보관 파일로 독립 실행형 HTML 대시보드를 만듭니다. 통계 카드, 상태·직군·채널·퍼널 차트, 필터 가능한 지원 목록을 외부 의존성 없는 인라인 SVG로 생성하며 브라우저에서 오프라인으로 열 수 있습니다. `/apply`나 `/outcome`으로 새 기록을 추가한 뒤 언제든 다시 생성할 수 있습니다.
- **`/add-template`**: 기본 템플릿 대신 사용할 LaTeX, Typst 또는 다른 CLI 기반 CV·자기소개서 템플릿을 등록합니다. 원본 확장자, 컴파일 명령, 글꼴, 스타일 규칙, 페이지 제한을 저장하고 반드시 테스트 컴파일한 뒤 `/apply`에 연결합니다. 아래 [사용자 정의 템플릿](#custom-templates)을 참고하세요.
- **`/add-portal`**: 사용하려는 시장의 채용 사이트를 조사해 검색 URL, 결과 구조, 접근 규칙을 확인하고 기존 형식의 포털 CLI 스킬을 생성합니다. 등록 전에 실제 검색을 제한적으로 시험합니다. 아래 [채용 검색 도구](#job-search-tools)를 참고하세요.

`/reset`도 사용할 수 있습니다. 아래 [처음부터 다시 시작](#starting-over)을 참고하세요.

<a id="file-structure"></a>
## 파일 구조

```text
ai-job-search-kr/
├── README.md                          # 한국어 기본 안내
├── README-en.md                       # 영어 안내
├── CLAUDE.md                          # 기본 후보자 프로필과 워크플로 규칙
├── AGENTS.md                          # 여러 에이전트용 thin-pointer 안내
├── .claude/                           # Claude Code의 표준 워크플로 단일 출처
│   ├── agents/                       # 읽기 전용 공고 수집·평가·지원서 검토 에이전트
│   ├── commands/
│   │   ├── apply.md                   # /apply 작성자-검토자 워크플로
│   │   ├── setup.md                   # /setup 문서·CV·인터뷰 온보딩
│   │   ├── expand.md                  # /expand 역량 보강
│   │   ├── add-template.md            # /add-template 사용자 템플릿 등록
│   │   ├── add-portal.md              # /add-portal 포털 스킬 생성
│   │   ├── rank.md                    # /rank 공고 일괄 평가
│   │   ├── outcome.md                 # /outcome 결과 기록과 자료 보관
│   │   ├── gmail-sync.md              # /gmail-sync 이메일 상태 신호 확인
│   │   ├── interview.md               # /interview 면접 준비와 모의 면접
│   │   ├── html-report.md             # /html-report 추적 대시보드 생성
│   │   ├── notion-sync.md             # /notion-sync Notion 단방향 보기
│   │   └── reset.md                   # /reset 프로필 또는 문서 초기화
│   ├── skills/
│   │   ├── job-application-assistant/ # 핵심 지원서 스킬
│   │   │   ├── SKILL.md               # 스킬 정의
│   │   │   ├── 01-candidate-profile.md # 학력·경력·기술
│   │   │   ├── 02-behavioral-profile.md # 행동·성향 평가
│   │   │   ├── 03-writing-style.md    # 문체와 작성 규칙
│   │   │   ├── 04-job-evaluation.md   # 직무 적합도 평가 기준
│   │   │   ├── 05-cv-templates.md     # CV 구성과 맞춤 작성 규칙
│   │   │   ├── 06-cover-letter-templates.md # 자기소개서 템플릿
│   │   │   └── 07-interview-prep.md   # STAR 사례와 면접 프레임워크
│   │   ├── job-scraper/               # /scrape 검색 오케스트레이션
│   │   └── upskill/                   # /upskill 역량 차이 분석
│   └── settings.json                  # Claude Code의 범위 제한 권한
├── .agents/skills/                    # 이식 가능한 채용 포털 CLI 스킬
│   ├── jobkorea-search/               # 잡코리아
│   ├── saramin-search/                # 사람인
│   ├── linkareer-search/              # 링커리어(신입·인턴 중심)
│   ├── worknet-search/                # 고용24(기본 자체 공고, 선택적 연계 제공처)
│   ├── incruit-search/                # 인크루트(EUC-KR 직접 검색)
│   ├── linkedin-search/               # LinkedIn 공개 공고(국가 무관)
│   └── freehire-search/               # freehire.me 기술직 통합 검색
├── cv/
│   └── main_example.tex               # moderncv LaTeX 템플릿
├── cover_letters/
│   ├── cover.cls                      # 사용자 정의 자기소개서 LaTeX 클래스
│   ├── cover_example.tex              # 구조 예시와 CI 스모크 테스트
│   └── OpenFonts/                     # Lato·Raleway 글꼴
├── templates/
│   └── README.md                      # /add-template 등록 폴더 안내
├── documents/                         # /setup 경로 A와 /expand의 경력 자료
│   ├── README.md                      # 폴더 구성 안내
│   ├── cv/                            # 마스터 CV
│   ├── linkedin/                      # LinkedIn 프로필 내보내기
│   ├── diplomas/                      # 학위증명서와 성적표
│   ├── references/                    # 추천서
│   └── applications/                  # 과거 지원 기록(<company>_<role>/)
├── .github/workflows/ci.yml           # LaTeX·스킬 린트·CLI 타입 검사
├── salary_lookup.py                   # 사용자 제공 데이터 기반 급여 조회
├── tools/
│   ├── check_framework_version.py     # 스킬 변경 시 버전 증가 검사
│   ├── check_upstream_updates.py      # 업데이트가 개인화 파일에 미치는 영향 미리보기
│   ├── convert_salary_excel.py        # 급여 Excel을 JSON으로 변환
│   ├── fetch_page.py                  # robots.txt를 적용하는 GET 전용 403 재시도
│   ├── install_portal_clis.py         # 발견한 모든 포털 CLI 설치
│   ├── lint_skills.py                 # 스킬·명령·settings.json 린트
│   ├── posting_guard.py               # 숨은 텍스트 제거와 지시문 형태의 입력 검사
│   ├── robots_check.py                # robots.txt 기반 재시도 허용 검사
│   ├── security_guards.py             # 허용·확인·거부 권한, 스킬 권한·gitignore·매니페스트 검사
│   ├── upstream_triage.py             # 업스트림 커밋 검토 우선순위 분류
│   ├── verify_layout.py               # PDF 레이아웃 측정
│   ├── verify_pdf.py                  # pypdf 우선, pdftotext 대체 PDF 검사
│   └── README_SALARY_TOOL.md          # 급여 도구 설정 안내
├── job_scraper/                       # 검색 상태와 결과
├── gmail_sync/                        # 처리한 이메일 ID와 마지막 동기화 날짜
├── upskill/                           # 실행별 역량 분석 보고서
├── job_search_tracker.csv             # 지원 현황 추적표
└── SETUP.md                           # 상세 설정 안내
```

<a id="how-apply-works"></a>
## `/apply` 작동 방식

`/apply`는 PDF 컴파일을 필수로 하는 **작성자-검토자 워크플로**를 실행합니다.

1. URL 또는 텍스트에서 채용 공고를 **해석**합니다.
2. 기술, 경험, 문화, 위치, 경력 방향을 기준으로 프로필과의 **적합도를 평가**합니다.
3. 맞춤 CV와 자기소개서를 LaTeX로 **작성**합니다.
4. 별도 검토 에이전트를 실행해 회사를 조사하고 초안을 **비평**합니다.
5. 검토 의견을 반영해 **수정**합니다.
6. CV는 `lualatex`, 자기소개서는 `xelatex`로 **컴파일하고 렌더링 결과를 검사**합니다. CV가 정확히 2페이지이고 항목 제목이 페이지 끝에 고립되지 않으며, 자기소개서가 서명을 포함한 정확히 1페이지이며 글꼴도 일관될 때까지 LaTeX를 조정합니다.
7. [`tools/verify_pdf.py`](tools/verify_pdf.py)로 CV를 **ATS 검사**합니다. `pypdf`를 먼저 사용하고 Poppler `pdftotext`를 대체 수단으로 사용해 연락처, 깨진 문자, 읽기 순서와 공고 키워드 포함 여부를 확인합니다. 연락처는 아이콘에만 담기지 않고 실제 텍스트로 추출되어야 합니다. 프로필로 뒷받침되는 키워드만 추가하고 실제 부족한 점은 숨기지 않습니다.
8. 검증 체크리스트와 함께 최종 결과를 **제시**합니다.

CV와 자기소개서의 모든 주장은 실제 프로필에 근거해야 한다는 규칙을 적용합니다. 이 규칙은 검증 절차이며 결과의 완전성을 보장하지 않으므로 제출 전 사용자가 최종 확인해야 합니다.

<a id="what-makes-this-workflow-different"></a>
### 이 워크플로의 차별점

- **PDF 검증 반복:** `.tex`에서 멀쩡해 보여도 PDF에서 직책 제목이 다음 페이지로 밀리거나 자기소개서가 2페이지로 넘치고 글머리표 글꼴이 달라질 수 있습니다. `/apply`는 매번 PDF를 컴파일하고 시각적으로 검사하며 `\needspace`, `\enlargethispage`, 목록 글꼴 래퍼 같은 제한된 수정을 적용합니다.
- **PDF 텍스트 계층 ATS 검증:** ATS는 렌더링 화면이 아니라 PDF의 내장 텍스트를 읽습니다. `verify_pdf.py`가 `pypdf` 우선, `pdftotext` 대체 순서로 텍스트를 추출해 연락처, 읽기 순서, 키워드 포함 여부를 실제 파서 관점에서 확인합니다. 근거 없는 키워드는 채우지 않고 부족한 점으로 남깁니다.
- **관련도 가중 CV 축약:** CV가 2페이지를 넘으면 단순히 가장 오래된 항목부터 자르지 않습니다. 목표 공고와의 관련성, 문서 내 고유성, 자기소개서 의존도를 평가해 합계가 가장 낮은 문장부터 줄입니다. 오래된 경력이라도 공고의 핵심 키워드와 맞으면 최근 경력의 관련 없는 문장보다 우선해 남깁니다.
- **작성자와 검토자 분리:** 작성자는 초안을 만들고, 새 컨텍스트의 두 번째 에이전트가 회사 조사와 비평을 맡습니다. 작성자가 이를 반영해 수정하므로 한 번의 작성에서 놓치기 쉬운 키워드, 약한 구성, 상투적 표현을 찾을 수 있습니다.
- **효율적인 검토 전달:** 검토자는 초안을 인라인으로 받아 다시 파일을 읽는 비용을 줄이고, 검증 체크리스트는 마지막에 한 번 실행합니다. PDF 렌더링과 레이아웃 반복에 추가 비용이 들 수 있으므로 전체 비용은 사용하는 모델과 문서 복잡도에 따라 달라집니다.

<a id="customization"></a>
## 사용자 설정

<a id="which-files-to-edit-manually"></a>
### 직접 편집할 파일

`/setup` 대신 파일을 직접 편집하려면 다음 위치를 사용하세요.

| 파일 | 변경할 내용 |
| --- | --- |
| `CLAUDE.md` | 이름, 학력, 경력, 기술, 목표를 포함한 전체 프로필 |
| `01-candidate-profile.md` | CV 정보를 구조화한 프로필 |
| `02-behavioral-profile.md` | 행동 평가 또는 자기 평가 |
| `04-job-evaluation.md` | 기술 적합 영역, 경력 목표, 동기 필터 |
| `05-cv-templates.md` | 직무 유형별 프로필 문구 템플릿 |
| `07-interview-prep.md` | 실제 경험에 근거한 STAR 사례 |
| `search-queries.md` | 기술과 지역에 맞는 검색어 |

<a id="updating-your-search-queries"></a>
### 검색어 업데이트

전체 프로필 설정을 다시 하지 않고 채용 검색 설정만 바꿀 수 있습니다.

```text
/setup --section search
```

목표 직무, 검색 기술, 지역, 사용할 포털을 다시 질문하고 프로필을 바탕으로 미처 고려하지 않은 직무 유형도 제안합니다.

<a id="custom-templates"></a>
### 사용자 정의 템플릿

기본 CV는 [moderncv](https://ctan.org/pkg/moderncv)의 banking 스타일을 사용합니다. 자기소개서는 Lato와 Raleway 글꼴을 포함한 사용자 정의 `cover.cls`를 사용합니다. 저장소가 기본으로 유지하는 참조 엔진은 LaTeX입니다.

LaTeX, [Typst](https://typst.app/) 또는 명령줄에서 PDF로 컴파일할 수 있는 다른 템플릿을 사용하려면 다음을 실행하세요.

```text
/add-template
```

`.tex`와 관련 `.cls`·`.sty`·글꼴, `.typ`와 로컬 패키지 등 원본 파일을 지정하면 명령이 확장자, 컴파일 명령, 글꼴 위치, 보존할 스타일, 최대 페이지 수를 묻습니다. 설정을 `templates/`에 저장하고 필수 테스트 컴파일을 통과한 뒤 `/apply`에서 활성화합니다. 템플릿은 개인정보 대신 `[PLACEHOLDER]` 토큰을 사용하므로 커밋하고 공유할 수 있습니다.

- `/add-template --list`: 등록한 템플릿 표시
- `/add-template --use <name>`: 해당 템플릿으로 전환
- `/add-template --use default`: 기본 moderncv와 `cover.cls`로 복귀

직접 구성하려면 `05-cv-templates.md`와 `06-cover-letter-templates.md`의 지침을 수정해도 됩니다.

<a id="job-search-tools"></a>
### 채용 검색 도구

`.agents/skills/`에는 한국 시장용 5개와 범용 2개, 총 7개의 독립 CLI 스킬이 있습니다. 각 스킬은 `search`와 `detail`을 제공하며 검색 출력은 `json|table|plain`, 상세 출력은 `json|plain`을 사용합니다. 지원하는 필터는 스킬마다 다르며 `/scrape`가 활성화된 스킬을 자동 발견합니다.

| 스킬 | 범위와 주요 옵션 | 검색 예시 |
| --- | --- | --- |
| [jobkorea-search](.agents/skills/jobkorea-search/SKILL.md) | 잡코리아 직접 검색. 지역은 익명 검색 제약 때문에 키워드로 매칭하며 `--career`, `--jobage`, `--sort` 지원 | `bun run .agents/skills/jobkorea-search/cli/src/cli.ts search -q "백엔드" -l "판교" --career experienced --format table` |
| [saramin-search](.agents/skills/saramin-search/SKILL.md) | 사람인 직접 검색. 시·도와 구 단위 지역 필터, 경력·등록일·정렬 지원 | `bun run .agents/skills/saramin-search/cli/src/cli.ts search -q "데이터 분석" -l "성남시 분당구" --jobage 7 --format table` |
| [linkareer-search](.agents/skills/linkareer-search/SKILL.md) | 링커리어 직접 검색. 신입·인턴 중심이며 `--career new,intern`과 지역 필터 지원. 공모전·대외활동·교육 제외 | `bun run .agents/skills/linkareer-search/cli/src/cli.ts search -q "백엔드" --career new,intern -l "서울" --format table` |
| [worknet-search](.agents/skills/worknet-search/SKILL.md) | 고용24 검색. 기본값은 고용24 자체 공고만 포함. `--source`로 특정 연계 제공처를 선택하거나 `--all-sources`로 고용24에 연계된 모든 제공처 포함 | `bun run .agents/skills/worknet-search/cli/src/cli.ts search -q "개발자" --source work,jobkorea,saramin --limit 5 --format table` |
| [incruit-search](.agents/skills/incruit-search/SKILL.md) | ⚠️ **기본 비활성화**(아래 안내 참고). 인크루트 공개 페이지를 EUC-KR로 직접 검색. `-l`은 지역명을 검색어에 추가하고 `--jobage`는 요청한 페이지 안에서 로컬 필터링 | `bun run .agents/skills/incruit-search/cli/src/cli.ts search -q "백엔드" -l "서울" --jobage 7 --format table` |
| [linkedin-search](.agents/skills/linkedin-search/SKILL.md) | LinkedIn 공개 `jobs-guest` 검색. 국가 무관, 위치 필수, 원격 형태와 등록일 지원 | `bun run .agents/skills/linkedin-search/cli/src/cli.ts search -q "data engineer" -l "Seoul, South Korea" --remote hybrid --format table` |
| [freehire-search](.agents/skills/freehire-search/SKILL.md) | freehire.me 공개 REST API 기반 기술직 통합 검색. 지역·국가·직급·분야·기술·근무 형태 facet 지원 | `bun run .agents/skills/freehire-search/cli/src/cli.ts search -q "backend engineer" --remote remote --region apac --format table` |

> [!WARNING]
> **인크루트 스킬은 기본 비활성화(`enabled: false`) 상태로 제공되며 `/scrape`에서 실행되지 않습니다.** 접근 조건을 확인하지 못했기 때문입니다.
> - 이용약관이 있는 `www.incruit.com`은 robots.txt가 모든 경로를 막고 있어 약관을 검토하지 못했습니다. 자동 접근 허용 여부를 알 수 없습니다.
> - 검색·공고 호스트의 robots.txt는 GPTBot·ClaudeBot을 전면 차단하고 AI 검색 봇의 일부 경로 접근을 제한합니다. 이 CLI는 자체 User-Agent를 쓰지만 AI 에이전트가 실행하는 도구입니다.
> - 공고 안내문에 따르면 재배포에는 인크루트의 동의가 필요하며, 기업·채용담당자 정보는 구직 목적으로만 이용할 수 있습니다.
>
> 사용하려면 인크루트의 최신 약관을 직접 확인한 뒤 [SKILL.md](.agents/skills/incruit-search/SKILL.md) frontmatter를 `enabled: true`로 바꾸세요. 활성화 여부의 판단과 책임은 사용자에게 있습니다. 활성화하지 않아도 고용24의 `--source incruit`로 고용24에 연계된 인크루트 공고를 검색할 수 있습니다.

`--source`는 기본 제공처 선택을 대체하므로 고용24 자체 공고도 유지하려면 `work`를 포함하세요. 기본 검색은 고용24 자체 공고만 대상으로 합니다. 고용24의 `--source`와 `--all-sources`는 **고용24에 연계된 공고**를 검색하며 원 플랫폼 전체를 직접 크롤링하지 않습니다. 잡코리아·사람인·인크루트 전체 검색은 각각의 전용 스킬을 사용하세요. 연계 공고의 상세 조회에는 검색 결과의 전체 URL을 전달해 `infoTypeCd`와 `infoTypeGroup`을 보존하세요. 외부 iframe에 본문이 있으면 `descriptionUrl`로 해당 주소를 확인할 수 있습니다. 인크루트의 지역은 별도 지역 코드가 아닌 키워드이고, `--jobage`는 지정한 한 페이지만 검사하므로 결과가 적을 수 있습니다. 등록일을 알 수 없는 공고는 기간 필터에서 제외하고 수정일은 별도로 기록합니다. 상세 조회는 텍스트와 이미지 URL을 제공하며 이미지에만 있는 요건은 이미지를 확인해야 합니다.

예를 들어 고용24의 모든 연계 제공처를 포함하려면 다음처럼 실행하세요.

```bash
bun run .agents/skills/worknet-search/cli/src/cli.ts search -q "개발자" --all-sources --limit 5
```

스킬의 `enabled: false` 설정으로 `/scrape` 실행 대상에서 제외할 수 있습니다. 각 CLI의 `cli/`에서 `bun test`와 `bun run typecheck`로 오프라인 검증을 실행합니다. 링커리어와 인크루트의 `bun run test:live`는 명시적으로 실행할 때만 실제 요청을 보내며 기본 테스트와 CI에서는 건너뜁니다. 요청량을 제한하고 각 스킬의 개인 사용 및 접근 안내를 따르세요.

다른 포털을 추가하려면 다음을 실행하세요.

```text
/add-portal
```

포털 URL을 주면 검색 URL 패턴, 결과 구조, robots.txt와 접근 규칙을 조사하고 기존 스킬과 같은 구조·명령·출력 계약으로 CLI를 생성한 뒤 제한적인 라이브 검색을 시험합니다. 인증이 필요한 포털은 거절하고, 이용약관에 제한이 있으면 생성된 스킬에 개인 사용 전용 경고를 표시합니다.

한국 밖의 시장에서는 `linkedin-search`와 `freehire-search`를 출발점으로 사용할 수 있습니다. LinkedIn 자동 접근은 이용약관 제한이 있으므로 개인 용도로 요청량을 낮게 유지하세요. freehire.me는 API 키 없이 구조화된 기술직 결과를 제공하며 `FREEHIRE_API_URL`로 자체 호스팅 인스턴스를 지정할 수 있습니다. [freehire 백엔드](https://github.com/strelov1/freehire)는 MIT 라이선스로 공개되어 있습니다. 시장이나 언어에 맞춘 포크를 관리한다면 [커뮤니티 포크·응용 사례](https://github.com/MadsLorentzen/ai-job-search/discussions/78)에 공유할 수 있습니다.

<a id="extending-the-framework-portals-templates-criteria-and-borrowing-from-other-forks"></a>
### 프레임워크 확장: 포털, 템플릿, 평가 기준과 다른 포크 활용

프레임워크에는 세 가지 확장 지점이 있으며 업스트림 코드를 수정하지 않고 사용할 수 있습니다.

1. **포털 스킬:** `.agents/skills/` 아래의 각 `*-search` 폴더는 `search`·`detail` CLI, `--format json|table|plain`, `SKILL.md`의 `enabled:` 값, 자체 테스트를 가진 독립 모듈입니다. `/scrape`가 계약을 만족하는 스킬을 자동 발견하며 `/add-portal`로 새 스킬을 만들 수 있습니다. 다른 포크의 스킬은 [커뮤니티 포털 목록](https://github.com/MadsLorentzen/ai-job-search/discussions/78)에서 찾을 수 있습니다.
2. **문서 템플릿:** `/add-template`은 명령줄에서 PDF로 컴파일할 수 있는 CV 또는 자기소개서 도구 체인을 등록합니다.
3. **평가 기준:** 프로필의 제외 조건과 선호 조건은 자유 형식입니다. 육아휴직 조건, 최소 급여, 온콜 제외 같은 요구를 프로필 한 줄로 기록할 수 있으며 `/rank`와 `/apply`가 그 내용을 실제 평가에 반영합니다. 언어는 구조화된 전용 규칙이 있습니다. `/setup`이 직접 묻거나 CV·LinkedIn 자료에서 파악한 업무 언어와 수준을 `Languages` 표에 기록하고, 공고가 선언하지 않은 언어를 필수로 요구하면 제외합니다. 선언한 언어에서 더 높은 수준을 요구하는 경우에는 자동 제외하지 않고 사용자가 판단할 수 있도록 표시합니다. 예를 들어 본인이 B1/B2 수준으로 기록한 언어에 공고가 유창함을 요구한다면 조용히 제외하는 대신 그 차이를 드러냅니다.

다른 포크의 포털 스킬을 가져올 때는 해당 폴더 하나를 `.agents/skills/`에 수동으로 복사합니다. 실행 전에는 다음을 확인하세요.

- 코드를 전부 읽어 네트워크 요청이 명시된 채용 사이트로만 가는지, 자기 폴더 밖의 파일을 읽거나 쓰지 않는지 확인합니다.
- `package.json`에 예상치 못한 런타임 의존성이나 `postinstall` 같은 생명주기 스크립트가 없는지 확인합니다.
- 해당 스킬의 `cli/`에서 `bun test`를 실행해 오프라인 테스트가 통과하는지 확인합니다.
- `enabled:` 값, 스킬의 이용약관 주의사항, `.claude/settings.json`의 명시적 권한 항목과 `tools/security_guards.py`의 매니페스트 검사를 함께 확인합니다.

현재 저장소에 포함된 CLI만 `.claude/settings.json`에 명시적으로 허용되어 있습니다. 복사한 임의 스킬은 자동으로 사전 승인되지 않으며, 실행 권한과 보안 검사 설정을 검토한 뒤 사용해야 합니다. 수동 복사를 요구하는 이유도 사용자가 코드와 권한을 직접 확인하도록 하기 위해서입니다.

국가별 급여 데이터베이스나 현지 임금표 같은 시장 특화 데이터도 같은 원칙을 따릅니다. 각 시장 포크에서 관리하고 [커뮤니티 논의 #78](https://github.com/MadsLorentzen/ai-job-search/discussions/78)을 통해 공유할 수 있습니다.

<a id="salary-benchmarking"></a>
### 급여 벤치마킹

급여 도구는 노조 통계, Glassdoor 내보내기, 개인 조사 등 사용자가 제공한 데이터를 사용합니다. 형식과 설정 방법은 `tools/README_SALARY_TOOL.md`를 참고하세요. 급여 데이터가 없으면 이 단계만 건너뜁니다.

<a id="starting-over"></a>
### 처음부터 다시 시작

프로필 데이터를 지우고 새로 시작하려면 다음 명령을 사용합니다.

```text
/reset profile    # 스킬 파일의 개인정보를 지우고 프레임워크 규칙은 보존
/reset documents  # documents/ 폴더의 파일 삭제
/reset all        # 둘 다 실행
```

`/reset`은 삭제할 대상을 정확히 보여 주고 사용자가 `RESET`을 직접 입력해야 진행합니다. 입력 전에는 아무것도 삭제하지 않습니다.

<a id="staying-up-to-date"></a>
### 최신 상태 유지

검증되지 않은 `master`를 바로 병합하기보다 태그가 붙은 업스트림 [릴리스](https://github.com/MadsLorentzen/ai-job-search/releases)를 기준으로 업데이트하세요. 각 체크포인트의 변경 사항은 [CHANGELOG.md](CHANGELOG.md)에 설명되어 있습니다. `python3 tools/check_upstream_updates.py`는 병합 전에 개인화 파일에 미치는 영향을 보여 주고, `python3 tools/upstream_triage.py`는 뒤처진 커밋을 검토 권장과 건너뛰기 후보로 분류합니다. 주간 워크플로로 이 분류를 누적 이슈에 게시할 수도 있습니다. 전체 절차는 [SETUP.md 8절](SETUP.md#8-pulling-upstream-updates-into-your-fork)을 참고하세요.

<a id="tips-for-better-results"></a>
## 더 나은 결과를 위한 팁

<a id="profile-depth-matters"></a>
### 프로필의 깊이가 중요합니다

출력 품질에 가장 큰 영향을 주는 요소는 프로필의 구체성입니다. 얕은 프로필은 일반적인 지원서를 만들고, 자세한 프로필은 실제 직무에 맞춘 결과를 가능하게 합니다.

- **직무 설명:** 직함만 나열하지 말고 각 직장에서 실제로 수행한 프로젝트, 사용 도구, 책임, 측정 가능한 성과를 적으세요. 자료가 많을수록 여러 직무에 맞게 경험을 정확히 재구성할 수 있습니다.
- **맥락 속 기술:** `Python`이나 `프로젝트 관리`만 적기보다 어디에서 어떻게 사용했는지 설명하세요. `scikit-learn과 Python으로 고객 이탈 예측 ML 파이프라인 구축`은 단순 기술 목록보다 훨씬 유용합니다.
- **모든 온보딩 경로 활용 가능:** `documents/` 폴더, CV 붙여 넣기, 인터뷰 중 어떤 경로를 선택해도 원칙은 같습니다. 입력이 풍부할수록 결과가 정교해집니다.

<a id="career-path-discovery"></a>
### 경력 경로 발견

두 가지 방식으로 채용 기회를 찾을 수 있습니다.

- **명시적 목표:** 원하는 직무나 산업을 이미 알고 있을 때 적합도를 바탕으로 후보를 다듬고 우선순위를 정합니다.
- **잠재 기회 발견:** 직함뿐 아니라 실제 수행 업무 전체를 분석해 생각하지 못한 경력 경로를 찾습니다. 다른 산업으로 옮길 수 있는 기술, 즐겼거나 잘했던 업무의 패턴, 기존 전문성과 새 기술을 결합한 신흥 역할을 발견할 수 있습니다.

`/setup`에서는 경력만 나열하지 말고 어떤 일이 활력을 주었는지, 무엇이 지치게 했는지, 앞으로 무엇을 더 하고 싶은지도 기록하세요. 이 맥락이 `/scrape`의 후보와 적합도 평가에 직접 반영됩니다.

<a id="contributing"></a>
## 기여

PR을 만들기 전에 [CONTRIBUTING.md](CONTRIBUTING.md)를 읽어 주세요. 업스트림에 병합되는 변경, 시장별 포크에 남겨야 하는 변경, 그 기준의 이유를 설명합니다.

<a id="acknowledgements"></a>
## 감사

- 채용 검색 CLI 스킬의 기반을 제공한 [Mikkel Krogholm](https://github.com/mikkelkrogsholm)과 [skills 저장소](https://github.com/mikkelkrogsholm/skills)
- [Anthropic](https://anthropic.com)의 [Claude Code](https://claude.com/claude-code)
- 원본 프레임워크와 업스트림 유지보수를 맡은 [Mads Lorentzen](https://github.com/MadsLorentzen)

<a id="license"></a>
## 라이선스

MIT
