# ai-news-digest

평일 아침 10시에 AI 소식을 모아 한국어로 요약해 주는 개인용 도구입니다.

여러 사이트를 매일 돌아다니며 보는 게 번거로워서 만들었습니다. 전날 이후 새로 올라온 글만 모아 Claude Code로 요약하고, 결과 페이지를 브라우저로 띄웁니다.

## 하는 일

1. 아래 출처에서 지난 실행 이후 올라온 글을 모은다
2. Claude Code를 비대화형(`claude -p`)으로 실행해 한국어로 요약한다
3. `out/YYYY-MM-DD.html`로 저장하고 브라우저로 연다

| 출처 | 형식 |
|---|---|
| GeekNews | Atom |
| Simon Willison 블로그 | Atom |
| Hacker News (150점 이상) | RSS (hnrss) |
| OpenAI 소식 | RSS |
| Hugging Face 블로그 | RSS |
| r/LocalLLaMA (하루 인기글) | Atom |
| Claude Code 변경 내역 | GitHub CHANGELOG.md, 새 버전일 때만 |

## 요약 페이지 구성

- **오늘의 핵심** 3~5개: 무슨 내용인지, 왜 중요한지
- **Claude Code 업데이트**: 새 버전이 있을 때 실무에 쓸 만한 변경점
- **오늘 직접 써 볼 만한 것**: 15분 안에 시험해 볼 수 있는 것 하나
- **나머지 소식**: 출처별 한 줄 요약

예시: [sample/2026-10-26.html](sample/2026-10-26.html)

## 실행

필요한 것: Node.js 18 이상, 로그인된 Claude Code CLI

```powershell
node digest.js            # 요약 생성 후 브라우저로 열기
node digest.js --no-open  # 파일만 생성
```

평일 10시 자동 실행 등록 (Windows 작업 스케줄러):

```powershell
.\install-task.ps1
```

PC가 꺼져 있었으면 켜진 뒤에 실행되고, 실행 중 콘솔 창은 뜨지 않습니다.

## 실패에 대비한 처리

매일 혼자 도는 도구라 조용히 멈추는 게 제일 위험해서 아래를 넣었습니다.

- 출처 하나가 실패하면 5초 뒤 한 번 더 시도하고, 그래도 안 되면 그 출처만 빼고 진행
- Claude 요약이 실패하면 제목 목록만이라도 보여 줌
- 모든 실행과 실패 원인을 `log.txt`에 기록
- 페이지 상단에 출처별 수집 건수(실패 표시 포함)를 보여 줌

## 만들면서 고친 것

- GeekNews가 0건으로 나옴 → Atom 링크가 작은따옴표(`href='...'`)로 돼 있는데 큰따옴표만 읽고 있었음
- Hacker News가 가끔 접속 실패 → 1회 재시도 추가
- 실행 중 검은 콘솔 창이 1분 넘게 떠 있음 → `conhost --headless`로 실행

## 비용

요약은 Claude Code 구독(Max) 안에서 돌기 때문에 별도 API 요금이 들지 않습니다. 1회 실행에 약 1분 20초 걸립니다.

## 알려진 한계

- 같은 날 여러 번 실행하면 직전 실행 이후 글만 모으기 때문에 얇은 페이지로 덮어쓴다 (`state.json`의 `lastRun`을 지우고 다시 실행하면 복구)
- 요약은 수집된 제목과 링크만 근거로 하므로, 본문까지 읽은 요약은 아니다
