/**
 * Cloudflare Worker: 株式ポートフォリオ週次レポート自動生成
 * GET  /         → ログイン画面 or アプリ画面（Cookie認証）
 * POST /login    → パスワード検証 → Cookieセット → リダイレクト
 * POST /analyze  → スクショ画像 → Gemini解析 → HTMLレポート
 *
 * 環境変数 (Workerシークレット):
 *   GEMINI_API_KEY  ... Google AI Studio APIキー
 *   WORKER_SECRET   ... アクセス用パスワード（任意の文字列を設定）
 */

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME    = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

// Step1: 画像からポートフォリオデータを抽出するプロンプト
const EXTRACTION_PROMPT = `
証券会社アプリのポートフォリオ画面のスクリーンショットです。
表示されている全データを正確に読み取り、以下のJSON形式で出力してください。

{
  "total": { "value": 評価総額(数値), "gain": 損益額(数値), "gainPct": 損益率(数値) },
  "holdings": [
    { "code": "銘柄コード", "name": "銘柄名", "value": 評価額, "gain": 損益額, "gainPct": 損益率, "shares": 保有株数 }
  ]
}

JSONのみ出力し、説明文は不要です。
`.trim();

// Step2: ポートフォリオデータ + Web検索でHTMLレポートを生成するプロンプト
const REPORT_PROMPT = `
あなたは株式ポートフォリオの週次レポートを生成するAIアシスタントです。
以下のポートフォリオデータをもとに、HTMLレポートを生成してください。

[PORTFOLIO_DATA]

【生成するHTMLレポートの構成】
1. ヘッダー: 「週次ポートフォリオレポート」タイトル
2. サマリーカード（横並び3枚）:
   - 評価総額・損益額・損益率
3. 銘柄別評価テーブル:
   - 銘柄コード | 銘柄名 | 評価額 | 損益額 | 損益率 | 評価(〇/△/×) | 来週のアクション
   - 損益プラスの行: 薄緑背景 (#e8f5e9)
   - 損益マイナスの行: 薄赤背景 (#ffebee)
4. 今週のポイント（箇条書き3〜5点）: 特に動きの大きかった銘柄・市場の出来事
5. 今週の株価変動要因ニュース一覧:
   - Google検索を使い、当該週に実際に起きた国内外の具体的な出来事・事件・政策決定のニュースを3〜5件取得する
   - 【選定基準】「イランがホルムズ海峡封鎖を宣言」「米FRBが緊急利上げ」のような実際の事象ニュースのみ。投資ノウハウ系記事は除外する
   - 各ニュースについて以下を記載:
     ① 出来事の概要（いつ・どこで・何が起きたか）
     ② 記事URL（Google検索で取得した実際の記事URL）
     ③ 保有銘柄との関連（このニュースがなぜ・どの銘柄にどう影響したか、経済的因果関係を詳しく）
     ④ 過去の類似事例（同種の出来事が過去にどの銘柄にどう影響したか具体的に）
6. 新規購入検討候補（2〜3銘柄）:
   - 現在未保有のセクターから提案
   - 各銘柄: コード・銘柄名・セクター・参考価格帯・注目理由・リスク
7. 来週の重点確認項目（箇条書き）

【出力ルール】
- 完全なHTMLドキュメント（<!DOCTYPE html>〜</html>まで）
- スマホファースト・レスポンシブデザイン（max-width: 600px 中心）
- 全文日本語
- <style>タグにCSSをまとめて記述
- カラーテーマ: ネイビー(#1F3864)・ブルー(#2E75B6)・白(#FFFFFF)
- フォント: -apple-system, 'Helvetica Neue', sans-serif
- テーブルは横スクロール対応 (overflow-x: auto)
- HTMLのみ出力（説明文・コードブロック記号不要）
`.trim();

// ============================================================
// Cookie ユーティリティ
// ============================================================
function isAuthenticated(request, env) {
  const cookie = request.headers.get('Cookie') ?? '';
  const m = cookie.match(/(?:^|;\s*)pa_session=([^;]+)/);
  return m ? m[1] === env.WORKER_SECRET : false;
}

function setSessionCookie(value) {
  return `pa_session=${value}; HttpOnly; Secure; SameSite=Strict; Max-Age=604800; Path=/`;
}

// ============================================================
// ログイン画面HTML
// ============================================================
function getLoginHTML(errorMsg = '') {
  const err = errorMsg
    ? `<div style="margin-top:12px;padding:12px;background:#fff0f0;border:1px solid #f5c6cb;border-radius:8px;color:#c0392b;font-size:14px">${errorMsg}</div>`
    : '';
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <title>株式ポートフォリオ分析</title>
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%93%8A%3C/text%3E%3C/svg%3E">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, 'Helvetica Neue', sans-serif; background: #f4f6f9; min-height: 100vh; }
    header { background: #1F3864; color: #fff; padding: 16px 20px; }
    header h1 { font-size: 18px; font-weight: 700; }
    header p  { font-size: 12px; opacity: 0.75; margin-top: 2px; }
    .container { max-width: 600px; margin: 40px auto; padding: 0 16px; }
    .card { background: #fff; border-radius: 12px; padding: 28px 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    h2 { font-size: 17px; color: #1F3864; margin-bottom: 8px; }
    p  { font-size: 13px; color: #666; margin-bottom: 20px; line-height: 1.6; }
    input[type="password"] {
      display: block; width: 100%; padding: 14px 16px;
      border: 1.5px solid #ddd; border-radius: 10px;
      font-size: 16px; outline: none; margin-bottom: 12px;
    }
    input[type="password"]:focus { border-color: #2E75B6; }
    button[type="submit"] {
      display: block; width: 100%; padding: 14px;
      background: #2E75B6; color: #fff; border: none;
      border-radius: 10px; font-size: 16px; font-weight: 700; cursor: pointer;
    }
    button[type="submit"]:active { background: #1F3864; }
  </style>
</head>
<body>
  <header>
    <h1>📊 株式ポートフォリオ分析</h1>
    <p>スクショをアップロードして週次レポートを自動生成</p>
  </header>
  <div class="container">
    <div class="card">
      <h2>🔑 アクセスパスワード</h2>
      <p>Cloudflare Worker に設定した <code>WORKER_SECRET</code> を入力してください。</p>
      <form method="POST" action="/login">
        <input type="password" name="password" placeholder="パスワードを入力" autocomplete="current-password" autofocus>
        <button type="submit">認証</button>
      </form>
      ${err}
    </div>
  </div>
</body>
</html>`;
}

// ============================================================
// アプリ画面HTML（認証済み後に表示）
// ============================================================
function getFrontendHTML() {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <title>株式ポートフォリオ分析</title>
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%93%8A%3C/text%3E%3C/svg%3E">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, 'Helvetica Neue', sans-serif; background: #f4f6f9; min-height: 100vh; }
    header {
      background: #1F3864; color: #fff; padding: 16px 20px;
      display: flex; align-items: center; gap: 10px;
    }
    header h1 { font-size: 18px; font-weight: 700; }
    header p  { font-size: 12px; opacity: 0.75; margin-top: 2px; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px 16px; }
    .card {
      background: #fff; border-radius: 12px; padding: 24px 20px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08); margin-bottom: 16px;
    }
    .btn-primary {
      padding: 12px 20px; background: #2E75B6; color: #fff; border: none;
      border-radius: 8px; font-size: 15px; font-weight: 700; cursor: pointer;
    }
    .btn-primary:active   { background: #1F3864; }
    .btn-primary:disabled { background: #aaa; cursor: not-allowed; }
    .btn-outline {
      width: 100%; padding: 12px; background: #f0f4fa; color: #1F3864;
      border: 2px solid #1F3864; border-radius: 10px; font-size: 15px;
      font-weight: 600; cursor: pointer; margin-bottom: 24px;
    }
    #paste-btn {
      width: 100%; min-height: 110px; border: 2.5px dashed #2E75B6; border-radius: 12px;
      background: #f8fbff; cursor: pointer; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 6px; padding: 16px;
    }
    #paste-btn:active { background: #eef4ff; border-color: #1F3864; }
    #paste-btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .paste-icon { font-size: 36px; }
    .paste-text { color: #1F3864; font-size: 15px; font-weight: 700; }
    .paste-sub  { color: #888; font-size: 12px; }
    #paste-msg  { font-size: 13px; margin-top: 6px; color: #c0392b; display: none; }
    .divider { display: flex; align-items: center; gap: 10px; margin: 12px 0; color: #bbb; font-size: 12px; }
    .divider::before, .divider::after { content: ''; flex: 1; height: 1px; background: #e0e0e0; }
    .upload-area {
      border: 2px dashed #2E75B6; border-radius: 10px; padding: 32px 16px;
      text-align: center; cursor: pointer; transition: background 0.2s; position: relative;
    }
    .upload-area:active, .upload-area.drag-over { background: #e8f0fe; }
    .upload-area input[type="file"] {
      position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%;
    }
    #preview-wrap { display: none; margin-top: 16px; text-align: center; }
    #preview-img  { max-width: 100%; max-height: 240px; border-radius: 8px; border: 1px solid #ddd; }
    #analyze-btn  { display: none; width: 100%; margin-top: 16px; }
    #loading { display: none; text-align: center; }
    .spinner {
      width: 40px; height: 40px; border: 4px solid #e0e7f0; border-top-color: #2E75B6;
      border-radius: 50%; animation: spin 0.9s linear infinite; margin: 0 auto 12px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    #loading p { color: #555; font-size: 14px; }
    .error-box {
      display: none; background: #fff0f0; border: 1px solid #f5c6cb;
      border-radius: 10px; padding: 14px 16px; color: #c0392b; font-size: 14px; margin-bottom: 16px;
    }
    #report-wrap { display: none; margin-bottom: 24px; }
    #report-wrap h2 { font-size: 14px; color: #555; margin-bottom: 8px; }
    #report-frame { width: 100%; border: none; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.10); min-height: 80vh; }
    #new-analyze-btn { display: none; }
    #top-new-btn {
      display: none; width: 100%; padding: 10px; margin-bottom: 12px;
      background: #f0f4fa; color: #1F3864; border: 2px solid #1F3864;
      border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer;
    }
    #history-section h3 { font-size: 14px; color: #555; margin-bottom: 10px; }
    .history-item {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 14px; border: 1px solid #dce8f5; border-radius: 8px;
      margin-bottom: 8px; cursor: pointer; transition: background 0.15s;
    }
    .history-item:active { background: #eef4ff; }
    .history-date { font-size: 14px; color: #1F3864; font-weight: 600; }
    .history-arrow { color: #2E75B6; font-size: 18px; line-height: 1; }
    .history-empty { color: #bbb; font-size: 13px; text-align: center; padding: 12px 0; }
    .badge {
      display: inline-block; background: #e8f5e9; color: #2e7d32;
      font-size: 11px; padding: 2px 8px; border-radius: 20px; margin-left: 8px; vertical-align: middle;
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>📊 株式ポートフォリオ分析 <span class="badge">🔓 認証済み</span></h1>
      <p>スクショをアップロードして週次レポートを自動生成</p>
    </div>
  </header>

  <div class="container">
    <button id="top-new-btn">&#8629; 新しいスクショを分析する</button>
    <div class="card">
      <button id="paste-btn" type="button">
        <div class="paste-icon">📋</div>
        <div class="paste-text">スクショを貼り付け</div>
        <div class="paste-sub">タップしてクリップボードから読み込む</div>
      </button>
      <div id="paste-msg"></div>
      <div class="divider"><span>または</span></div>
      <div class="upload-area" id="drop-zone">
        <input type="file" id="file-input" accept="image/*">
        <div style="font-size:13px;color:#888">📂 ファイルから選択</div>
      </div>
      <div id="preview-wrap"><img id="preview-img" alt="選択した画像"></div>
      <button id="analyze-btn" class="btn-primary">🔍 分析してレポートを生成</button>
    </div>

    <div class="card" id="history-section">
      <h3>🗂 分析履歴</h3>
      <div id="history-list"></div>
    </div>

    <div class="card" id="loading">
      <div class="spinner"></div>
      <p>Gemini がレポートを生成中です...<br>少々お待ちください（10〜30秒）</p>
    </div>

    <div class="error-box" id="analyze-error"></div>

    <div id="report-wrap">
      <h2>✅ 生成されたレポート</h2>
      <iframe id="report-frame" scrolling="yes" sandbox="allow-same-origin allow-popups"></iframe>
    </div>
    <button class="btn-outline" id="new-analyze-btn">↩ 新しいスクショを分析する</button>
  </div>

  <script>
    const pasteBtn     = document.getElementById('paste-btn');
    const pasteMsg     = document.getElementById('paste-msg');
    const fileInput    = document.getElementById('file-input');
    const dropZone     = document.getElementById('drop-zone');
    const previewWrap  = document.getElementById('preview-wrap');
    const previewImg   = document.getElementById('preview-img');
    const analyzeBtn   = document.getElementById('analyze-btn');
    const loading      = document.getElementById('loading');
    const analyzeError = document.getElementById('analyze-error');
    const reportWrap   = document.getElementById('report-wrap');
    const reportFrame  = document.getElementById('report-frame');
    const newBtn       = document.getElementById('new-analyze-btn');
    const topNewBtn    = document.getElementById('top-new-btn');
    const uploadCard   = analyzeBtn.closest('.card');

    let selectedFile = null;

    // ---- 分析履歴 ----
    const HISTORY_KEY = 'portfolio_history';
    const MAX_HISTORY = 20;

    function loadHistory() {
      try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch(_) { return []; }
    }

    function saveHistory(report) {
      const history = loadHistory();
      const now = new Date();
      const days = ['日','月','火','水','木','金','土'];
      const label = now.getFullYear() + '年' + (now.getMonth()+1) + '月' + now.getDate() + '日（' + days[now.getDay()] + '）';
      history.unshift({ id: now.getTime(), label, report });
      if (history.length > MAX_HISTORY) history.pop();
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch(_) {}
    }

    function renderHistory() {
      const history = loadHistory();
      const list = document.getElementById('history-list');
      if (history.length === 0) {
        list.innerHTML = '<div class="history-empty">まだ分析履歴がありません</div>';
        return;
      }
      list.innerHTML = history.map(item =>
        '<div class="history-item" data-id="' + item.id + '">' +
        '<span class="history-date">&#128196; ' + item.label + '</span>' +
        '<span class="history-arrow">&#8250;</span>' +
        '</div>'
      ).join('');
      list.querySelectorAll('.history-item').forEach(el => {
        el.addEventListener('click', () => {
          const item = loadHistory().find(h => h.id === Number(el.dataset.id));
          if (!item) return;
          reportFrame.srcdoc = item.report;
          reportFrame.onload = () => {
            try { reportFrame.style.height = reportFrame.contentDocument.body.scrollHeight + 40 + 'px'; } catch(_) {}
          };
          reportWrap.style.display = 'block';
          newBtn.style.display = 'block';
          topNewBtn.style.display = 'block';
          reportWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
    }

    renderHistory();

    function showPasteMsg(text, isError = true) {
      pasteMsg.textContent = text;
      pasteMsg.style.color = isError ? '#c0392b' : '#2e7d32';
      pasteMsg.style.display = 'block';
      setTimeout(() => { pasteMsg.style.display = 'none'; }, 4000);
    }

    pasteBtn.addEventListener('click', async () => {
      if (!navigator.clipboard?.read) {
        showPasteMsg('このブラウザは clipboard.read に未対応です。下の「ファイルから選択」をお使いください。');
        return;
      }
      pasteBtn.disabled = true;
      try {
        const clipItems = await navigator.clipboard.read();
        for (const item of clipItems) {
          for (const type of item.types) {
            if (type.startsWith('image/')) {
              const blob = await item.getType(type);
              setFile(new File([blob], 'screenshot.png', { type }));
              pasteBtn.disabled = false;
              return;
            }
          }
        }
        showPasteMsg('クリップボードに画像がありません。スクショをコピーしてから再度タップしてください。');
      } catch (err) {
        if (err.name === 'NotAllowedError') {
          showPasteMsg('アクセスが拒否されました。iOSの「許可」を選択してから再度タップしてください。');
        } else {
          showPasteMsg('読み込み失敗: ' + err.message);
        }
      }
      pasteBtn.disabled = false;
    });

    fileInput.addEventListener('change', e => { if (e.target.files[0]) setFile(e.target.files[0]); });
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => {
      e.preventDefault(); dropZone.classList.remove('drag-over');
      const f = e.dataTransfer.files[0];
      if (f && f.type.startsWith('image/')) setFile(f);
    });

    function setFile(file) {
      selectedFile = file;
      const reader = new FileReader();
      reader.onload = e => {
        previewImg.src = e.target.result;
        previewWrap.style.display = 'block';
        analyzeBtn.style.display = 'block';
      };
      reader.readAsDataURL(file);
    }

    analyzeBtn.addEventListener('click', async () => {
      if (!selectedFile) return;
      analyzeBtn.disabled = true;
      analyzeError.style.display = 'none';
      uploadCard.style.display = 'none';
      loading.style.display = 'block';

      try {
        const base64 = await toBase64(selectedFile);
        const res = await fetch('/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64, mediaType: selectedFile.type }),
        });

        const data = await res.json();

        if (res.status === 401) {
          location.href = '/';
          return;
        }

        if (!res.ok || data.error) throw new Error(data.error || 'エラーが発生しました');

        loading.style.display = 'none';
        saveHistory(data.report);
        renderHistory();
        reportFrame.srcdoc = data.report;
        reportFrame.onload = () => {
          try { reportFrame.style.height = reportFrame.contentDocument.body.scrollHeight + 40 + 'px'; } catch(_) {}
        };
        reportWrap.style.display = 'block';
        newBtn.style.display = 'block';
        topNewBtn.style.display = 'block';
      } catch (err) {
        loading.style.display = 'none';
        uploadCard.style.display = 'block';
        analyzeBtn.disabled = false;
        analyzeError.textContent = '⚠️ ' + err.message;
        analyzeError.style.display = 'block';
      }
    });

    function resetToUpload() {
      selectedFile = null; fileInput.value = '';
      previewWrap.style.display = 'none'; analyzeBtn.style.display = 'none';
      analyzeBtn.disabled = false; reportWrap.style.display = 'none';
      newBtn.style.display = 'none'; topNewBtn.style.display = 'none';
      analyzeError.style.display = 'none'; uploadCard.style.display = 'block';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    newBtn.addEventListener('click', resetToUpload);
    topNewBtn.addEventListener('click', resetToUpload);

    function toBase64(file) {
      return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result.split(',')[1]);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
    }
  </script>
</body>
</html>`;
}

// ============================================================
// Worker ハンドラー
// ============================================================
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ログイン処理（HTMLフォームPOST）
    if (request.method === 'POST' && url.pathname === '/login') {
      let password = '';
      try {
        const form = await request.formData();
        password = (form.get('password') ?? '').trim();
      } catch {
        return new Response(getLoginHTML('リクエスト形式エラー'), { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }

      if (password && password === env.WORKER_SECRET) {
        return new Response(null, {
          status: 302,
          headers: {
            'Location': '/',
            'Set-Cookie': setSessionCookie(env.WORKER_SECRET),
          },
        });
      }
      return new Response(getLoginHTML('パスワードが正しくありません'), {
        status: 401,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // フロントエンド配信（Cookie認証済みのみ）
    if (request.method === 'GET' && url.pathname === '/') {
      if (!isAuthenticated(request, env)) {
        return new Response(getLoginHTML(), {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }
      return new Response(getFrontendHTML(), {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Frame-Options': 'DENY' },
      });
    }

    // 解析エンドポイント（Cookie認証）
    if (request.method === 'POST' && url.pathname === '/analyze') {
      if (!isAuthenticated(request, env)) {
        return json({ error: '認証が必要です' }, 401);
      }

      let body;
      try { body = await request.json(); } catch {
        return json({ error: 'リクエスト形式が不正です' }, 400);
      }

      const { imageBase64, mediaType } = body;

      if (!ALLOWED_MIME.includes(mediaType)) {
        return json({ error: '対応していない画像形式です（JPEG/PNG/WebP/HEIC のみ）' }, 400);
      }

      const approxBytes = (imageBase64?.length ?? 0) * 0.75;
      if (approxBytes > MAX_IMAGE_BYTES) {
        return json({ error: '画像サイズが大きすぎます（上限 5MB）' }, 400);
      }

      if (!imageBase64) return json({ error: '画像データがありません' }, 400);

      const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`;

      function extractText(data) {
        const parts = data?.candidates?.[0]?.content?.parts ?? [];
        return (parts.find(p => p.text && !p.thought) ?? parts.find(p => p.text))?.text ?? '';
      }

      try {
        // Step1: 画像解析 → ポートフォリオデータ抽出（google_search なし）
        const step1Res = await fetch(GEMINI_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [
              { inline_data: { mime_type: mediaType, data: imageBase64 } },
              { text: EXTRACTION_PROMPT },
            ]}],
            generationConfig: { maxOutputTokens: 2048, temperature: 0 },
          }),
        });
        const step1Data = await step1Res.json().catch(() => null);
        if (!step1Res.ok) {
          const errMsg = step1Data?.error?.message ?? `HTTP ${step1Res.status}`;
          return json({ error: 'Step1 Gemini APIエラー: ' + errMsg }, 500);
        }
        const portfolioText = extractText(step1Data).replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
        if (!portfolioText) return json({ error: 'ポートフォリオデータを読み取れませんでした。再度お試しください。' }, 500);

        // Step2: ポートフォリオデータ + google_search でHTMLレポート生成
        const reportPrompt = REPORT_PROMPT.replace('[PORTFOLIO_DATA]', portfolioText);
        const step2Res = await fetch(GEMINI_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: reportPrompt }] }],
            tools: [{ google_search: {} }],
            generationConfig: { maxOutputTokens: 32768, temperature: 0.3 },
          }),
        });
        const step2Data = await step2Res.json().catch(() => null);
        if (!step2Res.ok) {
          const errMsg = step2Data?.error?.message ?? `HTTP ${step2Res.status}`;
          return json({ error: 'Step2 Gemini APIエラー: ' + errMsg }, 500);
        }

        let reportHtml = extractText(step2Data);
        reportHtml = reportHtml.replace(/^```html\s*/i, '').replace(/```\s*$/, '').trim();
        if (!reportHtml) return json({ error: 'Geminiからレポートを取得できませんでした。再度お試しください。' }, 500);
        return json({ report: reportHtml }, 200);
      } catch (e) {
        return json({ error: 'サーバーエラー: ' + (e?.message ?? e) }, 500);
      }
    }

    return new Response('Not Found', { status: 404 });
  },
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
