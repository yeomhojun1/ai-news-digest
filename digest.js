// AI 뉴스 아침 요약: 여러 출처에서 새 글을 모아 Claude로 한국어 요약 → HTML로 저장 후 브라우저로 연다.
// 실행: node digest.js            (평소)
//       node digest.js --no-open  (브라우저 안 열고 파일만 생성)
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const OUT_DIR = path.join(ROOT, 'out');
const STATE_FILE = path.join(ROOT, 'state.json');
const LOG_FILE = path.join(ROOT, 'log.txt');
const CLAUDE = path.join(process.env.APPDATA, 'npm', 'claude.cmd');
const MAX_PER_SOURCE = 12;

const SOURCES = [
  { name: 'GeekNews', url: 'https://news.hada.io/rss/news' },
  { name: 'Simon Willison', url: 'https://simonwillison.net/atom/everything/' },
  { name: 'Hacker News (150점 이상)', url: 'https://hnrss.org/frontpage?points=150' },
  { name: 'OpenAI', url: 'https://openai.com/news/rss.xml' },
  { name: 'Hugging Face 블로그', url: 'https://huggingface.co/blog/feed.xml' },
  { name: 'r/LocalLLaMA', url: 'https://www.reddit.com/r/LocalLLaMA/top/.rss?t=day' },
];
const CHANGELOG_URL = 'https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md';

function log(msg) {
  fs.appendFileSync(LOG_FILE, `[${new Date().toLocaleString('ko-KR')}] ${msg}\n`);
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; }
}

const decode = s => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/<[^>]+>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
  .trim();

const pick = (block, tag) => {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? decode(m[1]) : '';
};

function parseFeed(xml) {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/g) || [];
  return blocks.map(b => {
    const atomLink = (b.match(/<link[^>]*href=["']([^"']+)["']/) || [])[1];
    const date = pick(b, 'pubDate') || pick(b, 'published') || pick(b, 'updated') || pick(b, 'dc:date');
    return { title: pick(b, 'title'), link: atomLink || pick(b, 'link'), date: date ? new Date(date) : null };
  }).filter(i => i.title && i.link);
}

async function get(url, retry = 1) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 ai-news-digest' }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
  } catch (e) {
    if (retry <= 0) throw e;
    await new Promise(res => setTimeout(res, 5000));
    return get(url, retry - 1);
  }
}

async function collect(since) {
  const result = [];
  for (const s of SOURCES) {
    try {
      const items = parseFeed(await get(s.url))
        .filter(i => !i.date || isNaN(i.date) || i.date >= since)
        .sort((a, b) => (b.date || 0) - (a.date || 0))
        .slice(0, MAX_PER_SOURCE);
      result.push({ source: s.name, items });
    } catch (e) {
      log(`${s.name} 수집 실패: ${e.message}`);
      result.push({ source: s.name, items: [], error: e.message });
    }
  }
  return result;
}

async function latestChangelog(state) {
  try {
    const md = await get(CHANGELOG_URL);
    const m = md.match(/^## (.+)$/m);
    if (!m) return null;
    const version = m[1].trim();
    if (version === state.lastChangelogVersion) return { version, isNew: false, body: '' };
    const start = md.indexOf(m[0]);
    const next = md.indexOf('\n## ', start + m[0].length);
    return { version, isNew: true, body: md.slice(start, next > 0 ? next : start + 4000).slice(0, 4000) };
  } catch (e) {
    log(`Claude Code 변경 내역 수집 실패: ${e.message}`);
    return null;
  }
}

function buildPrompt(feeds, changelog) {
  const lines = [];
  for (const f of feeds) {
    lines.push(`### ${f.source}`);
    if (!f.items.length) lines.push('(새 글 없음)');
    for (const i of f.items) lines.push(`- ${i.title} | ${i.link}`);
  }
  const cc = changelog && changelog.isNew ? `\n### Claude Code 새 버전\n${changelog.body}\n` : '\n### Claude Code\n(새 버전 없음)\n';
  return `너는 AI 업계 소식을 정리해 주는 편집자다. 독자는 한국의 풀스택 개발자로, Claude Code를 실무에 쓰고 있고 AI 업무자동화(FDE) 직무로 이직을 준비 중이다.

아래 목록만 근거로 오늘의 AI 소식 요약을 **HTML 조각**으로 써라. 목록에 없는 사실은 절대 지어내지 말 것. 링크는 목록의 주소를 그대로 쓸 것.

출력 형식 (HTML 태그만, 코드펜스·<html>·<body> 금지):
<h2>오늘의 핵심</h2> AI·LLM·개발도구 관련 가장 중요한 소식 3~5개. 각 항목은 <div class="item"><h3><a href="링크">한국어 제목</a></h3><p>무슨 내용인지 2문장</p><p class="why">왜 중요한가 1문장</p></div>
<h2>Claude Code 업데이트</h2> 새 버전이 있으면 바뀐 점 중 실무에 의미 있는 것 3개 이내를 <ul>로, 없으면 "새 버전 없음" 한 줄.
<h2>오늘 직접 써 볼 만한 것</h2> 위 소식 중 하나를 골라, 15분 안에 직접 시험해 볼 수 있는 구체적 방법 1개를 <p>로. (사전인터뷰 '최근 알게 된 것을 직접 시험해 봤는가' 소재가 되도록)
<h2>나머지 소식</h2> AI와 관련 있는 나머지 항목만 출처별로 <h4>출처</h4><ul><li><a href="링크">한국어 한 줄 요약</a></li></ul>. AI와 무관한 글은 뺀다.

모든 문장은 한국어 존댓말 없이 간결한 평서문.

=== 수집 목록 ===
${lines.join('\n')}
${cc}`;
}

function summarize(prompt) {
  const r = spawnSync(CLAUDE, ['-p', '--output-format', 'text'], {
    input: prompt, encoding: 'utf8', shell: true, timeout: 10 * 60 * 1000, maxBuffer: 20 * 1024 * 1024,
  });
  if (r.status !== 0 || !r.stdout || !r.stdout.trim()) {
    throw new Error(`claude 실패 (status ${r.status}): ${(r.stderr || '').slice(0, 300)}`);
  }
  return r.stdout.replace(/^```html?\s*/i, '').replace(/```\s*$/, '').trim();
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function fallbackHtml(feeds, changelog) {
  let h = '<p class="warn">Claude 요약에 실패해 제목 목록만 보여 줍니다. 원인은 log.txt 참고.</p>';
  if (changelog && changelog.isNew) h += `<h2>Claude Code 새 버전 ${esc(changelog.version)}</h2><pre>${esc(changelog.body)}</pre>`;
  for (const f of feeds) {
    h += `<h4>${esc(f.source)}</h4><ul>`;
    for (const i of f.items) h += `<li><a href="${esc(i.link)}">${esc(i.title)}</a></li>`;
    h += '</ul>';
  }
  return h;
}

function page(dateStr, inner, feeds) {
  const counts = feeds.map(f => `${esc(f.source)} ${f.error ? '실패' : f.items.length}`).join(' · ');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>AI 아침 소식 ${dateStr}</title>
<style>
body{font-family:'Malgun Gothic',sans-serif;max-width:860px;margin:32px auto;padding:0 16px;color:#222;line-height:1.6;background:#fafbfc}
h1{color:#3182F6;margin-bottom:4px} .meta{color:#6B7684;font-size:13px;margin-bottom:24px}
h2{color:#1B2A4A;border-bottom:2px solid #3182F6;padding-bottom:4px;margin-top:32px}
.item{background:#fff;border:1px solid #e5e8eb;border-radius:8px;padding:12px 16px;margin:12px 0}
.item h3{margin:0 0 6px;font-size:17px} .why{color:#3182F6;font-size:14px}
a{color:#1B64DA;text-decoration:none} a:hover{text-decoration:underline}
li{margin:4px 0} .warn{background:#fff4e5;padding:8px 12px;border-radius:6px} pre{white-space:pre-wrap;font-size:13px}
</style></head><body><h1>AI 아침 소식</h1><div class="meta">${dateStr} · 수집: ${counts}</div>${inner}</body></html>`;
}

(async () => {
  const state = loadState();
  const now = new Date();
  const fallbackSince = new Date(now - (now.getDay() === 1 ? 72 : 24) * 3600 * 1000);
  const since = state.lastRun ? new Date(state.lastRun) : fallbackSince;
  log(`시작 (기준 시각 ${since.toLocaleString('ko-KR')})`);

  const feeds = await collect(since);
  const changelog = await latestChangelog(state);

  let inner;
  try {
    inner = summarize(buildPrompt(feeds, changelog));
  } catch (e) {
    log(e.message);
    inner = fallbackHtml(feeds, changelog);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const dateStr = now.toLocaleDateString('sv-SE');
  const file = path.join(OUT_DIR, `${dateStr}.html`);
  fs.writeFileSync(file, page(dateStr, inner, feeds));

  fs.writeFileSync(STATE_FILE, JSON.stringify({
    lastRun: now.toISOString(),
    lastChangelogVersion: changelog ? changelog.version : state.lastChangelogVersion,
  }, null, 2));
  log(`완료: ${file}`);

  if (!process.argv.includes('--no-open')) spawnSync('cmd', ['/c', 'start', '""', `"${file}"`], { shell: true });
})().catch(e => log(`중단: ${e.stack}`));
