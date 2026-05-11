/**
 * Cloudflare Worker: 株式ポートフォリオ週次レポート自動生成
 * GET  /         → フロントエンドHTML（初回はパスワード設定画面）
 * POST /analyze  → スクショ画像 → Gemini解析 → HTMLレポート
 *
 * 環境変数 (Workerシークレット):
 *   GEMINI_API_KEY  ... Google AI Studio APIキー
 *   WORKER_SECRET   ... アクセス用パスワード（任意の文字列を設定）
 */

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME    = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

const ANALYZE_PROMPT = `
あなたは株式ポートフォリオの週次レポートを生成するAIアシスタントです。

添付のスクリーンショットは証券会社アプリのポートフォリオ画面です。
スクリーンショットに表示されている数値をすべて正確に読み取り、以下の構成でHTMLレポートを生成してください。

【生成するHTMLレポートの構成】
1. ヘッダー: 「週次ポートフォリオレポート」タイトル
2. サマリーカード（横並び3枚）:
   - 評価総額（スクショの合計値）
   - 損益額
   - 損益率
3. 銘柄別評価テーブル:
   - 銘柄コード | 銘柄名 | 評価額 | 損益額 | 損益率 | 評価(〇/△/×) | 来週のアクション
   - 損益プラスの行: 薄緑背景 (#e8f5e9)
   - 損益マイナスの行: 薄赤背景 (#ffebee)
4. 今週のポイント（箇条書き3〜5点）: 特に動きの大きかった銘柄・市場の出来事
5. 新規購入検討候補（2〜3銘柄）:
   - 現在未保有のセクターから提案
   - 各銘柄: コード・銘柄名・セクター・参考価格帯・注目理由・リスク
6. 来週の重点確認項目（箇条書き）

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
// フロントエンドHTML
// ============================================================
function getFrontendHTML() {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <title>株式ポートフォリオ分析</title>
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
    /* ---- 認証フォーム ---- */
    #auth-section h2 { font-size: 16px; color: #1F3864; margin-bottom: 8px; }
    #auth-section p  { font-size: 13px; color: #666; margin-bottom: 16px; line-height: 1.5; }
    .input-row { display: flex; gap: 8px; }
    #secret-input {
      flex: 1; padding: 12px 14px; border: 1.5px solid #ddd; border-radius: 8px;
      font-size: 15px; outline: none;
    }
    #secret-input:focus { border-color: #2E75B6; }
    /* ---- 共通ボタン ---- */
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
    /* ---- アップロード ---- */
    #upload-section { display: none; }
    .upload-area {
      border: 2px dashed #2E75B6; border-radius: 10px; padding: 32px 16px;
      text-align: center; cursor: pointer; transition: background 0.2s; position: relative;
    }
    .upload-area:active, .upload-area.drag-over { background: #e8f0fe; }
    .upload-area input[type="file"] {
      position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%;
    }
    .upload-icon { font-size: 40px; margin-bottom: 8px; }
    .upload-text { color: #1F3864; font-size: 15px; font-weight: 600; }
    .upload-sub  { color: #888; font-size: 12px; margin-top: 4px; }
    .btn-paste {
      width: 100%; padding: 16px; background: #1F3864; color: #fff; border: none;
      border-radius: 10px; font-size: 17px; font-weight: 700; cursor: pointer; letter-spacing: 0.5px;
    }
    .btn-paste:active { background: #2E75B6; }
    .hint { text-align: center; font-size: 12px; color: #999; margin: 6px 0 12px; }
    .divider { display: flex; align-items: center; gap: 10px; margin: 12px 0; color: #bbb; font-size: 12px; }
    .divider::before, .divider::after { content: ''; flex: 1; height: 1px; background: #e0e0e0; }
    #preview-wrap { display: none; margin-top: 16px; text-align: center; }
    #preview-img  { max-width: 100%; max-height: 240px; border-radius: 8px; border: 1px solid #ddd; }
    #analyze-btn  { display: none; width: 100%; margin-top: 16px; }
    /* ---- ローディング ---- */
    #loading { display: none; text-align: center; }
    .spinner {
      width: 40px; height: 40px; border: 4px solid #e0e7f0; border-top-color: #2E75B6;
      border-radius: 50%; animation: spin 0.9s linear infinite; margin: 0 auto 12px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    #loading p { color: #555; font-size: 14px; }
    /* ---- エラー ---- */
    .error-box {
      display: none; background: #fff0f0; border: 1px solid #f5c6cb;
      border-radius: 10px; padding: 14px 16px; color: #c0392b; font-size: 14px; margin-bottom: 16px;
    }
    /* ---- レポート ---- */
    #report-wrap { display: none; margin-bottom: 24px; }
    #report-wrap h2 { font-size: 14px; color: #555; margin-bottom: 8px; }
    #report-frame { width: 100%; border: none; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.10); min-height: 80vh; }
    #new-analyze-btn { display: none; }
    /* ---- ロック解除バッジ ---- */
    .badge {
      display: inline-block; background: #e8f5e9; color: #2e7d32;
      font-size: 11px; padding: 2px 8px; border-radius: 20px; margin-left: 8px; vertical-align: middle;
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>📊 株式ポートフォリオ分析 <span class="badge" id="lock-badge" style="display:none">🔓 認証済み</span></h1>
      <p>スクショをアップロードして週次レポートを自動生成</p>
    </div>
  </header>

  <div class="container">

    <!-- 認証フォーム -->
    <div class="card" id="auth-section">
      <h2>🔑 アクセスパスワード</h2>
      <p>Cloudflare Worker に設定した <code>WORKER_SECRET</code> を入力してください。<br>入力後はこのブラウザに保存されます。</p>
      <div class="input-row">
        <input type="password" id="secret-input" placeholder="パスワードを入力" autocomplete="current-password">
        <button class="btn-primary" id="auth-btn">認証</button>
      </div>
      <div class="error-box" id="auth-error">パスワードが正しくありません</div>
    </div>

    <!-- アップロード -->
    <div class="card" id="upload-section">
      <button class="btn-paste" id="paste-btn">📋 スクショを貼り付け</button>
      <p class="hint">スクショ撮影後すぐにタップ</p>
      <div class="divider"><span>または</span></div>
      <div class="upload-area" id="drop-zone">
        <input type="file" id="file-input" accept="image/*">
        <div class="upload-text" style="font-size:13px;color:#888">📂 ファイルから選択</div>
      </div>
      <div id="preview-wrap"><img id="preview-img" alt="選択した画像"></div>
      <button id="analyze-btn" class="btn-primary">🔍 分析してレポートを生成</button>
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
    const STORAGE_KEY = 'portfolio_auth_token';
    let authToken = localStorage.getItem(STORAGE_KEY) || '';

    const pasteBtn      = document.getElementById('paste-btn');
    const authSection   = document.getElementById('auth-section');
    const authBtn       = document.getElementById('auth-btn');
    const authError     = document.getElementById('auth-error');
    const secretInput   = document.getElementById('secret-input');
    const uploadSection = document.getElementById('upload-section');
    const fileInput     = document.getElementById('file-input');
    const dropZone      = document.getElementById('drop-zone');
    const previewWrap   = document.getElementById('preview-wrap');
    const previewImg    = document.getElementById('preview-img');
    const analyzeBtn    = document.getElementById('analyze-btn');
    const loading       = document.getElementById('loading');
    const analyzeError  = document.getElementById('analyze-error');
    const reportWrap    = document.getElementById('report-wrap');
    const reportFrame   = document.getElementById('report-frame');
    const newBtn        = document.getElementById('new-analyze-btn');
    const lockBadge     = document.getElementById('lock-badge');

    let selectedFile = null;

    function showUpload() {
      authSection.style.display  = 'none';
      uploadSection.style.display = 'block';
      lockBadge.style.display    = 'inline-block';
    }

    // トークンが保存済みなら即アップロード画面へ
    if (authToken) showUpload();

    authBtn.addEventListener('click', () => {
      const val = secretInput.value.trim();
      if (!val) return;
      authToken = val;
      localStorage.setItem(STORAGE_KEY, authToken);
      authError.style.display = 'none';
      showUpload();
    });
    secretInput.addEventListener('keydown', e => { if (e.key === 'Enter') authBtn.click(); });

    // クリップボードから貼り付け
    pasteBtn.addEventListener('click', async () => {
      if (pasteBtn.disabled) return;
      pasteBtn.disabled = true;
      const orig = pasteBtn.textContent;
      try {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const imgType = item.types.find(t => t.startsWith('image/'));
          if (imgType) {
            const blob = await item.getType(imgType);
            setFile(new File([blob], 'screenshot.png', { type: imgType }));
            pasteBtn.disabled = false;
            return;
          }
        }
        pasteBtn.textContent = '⚠️ クリップボードに画像がありません';
        setTimeout(() => { pasteBtn.textContent = orig; pasteBtn.disabled = false; }, 2500);
      } catch {
        pasteBtn.textContent = '⚠️ 許可が必要です（再タップ）';
        setTimeout(() => { pasteBtn.textContent = orig; pasteBtn.disabled = false; }, 2500);
      }
    });

    // キーボード Cmd+V / Ctrl+V でも貼り付け可能
    document.addEventListener('paste', e => {
      const items = e.clipboardData?.items ?? [];
      for (const item of [...items]) {
        if (item.type.startsWith('image/')) { setFile(item.getAsFile()); return; }
      }
    });

    // ファイル選択
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
      reader.onload = e => { previewImg.src = e.target.result; previewWrap.style.display = 'block'; analyzeBtn.style.display = 'block'; };
      reader.readAsDataURL(file);
    }

    analyzeBtn.addEventListener('click', async () => {
      if (!selectedFile) return;
      analyzeBtn.disabled = true;
      analyzeError.style.display = 'none';
      uploadSection.style.display = 'none';
      loading.style.display = 'block';

      try {
        const base64 = await toBase64(selectedFile);
        const res = await fetch('/analyze', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + authToken,
          },
          body: JSON.stringify({ imageBase64: base64, mediaType: selectedFile.type }),
        });

        const data = await res.json();

        if (res.status === 401) {
          // トークンが無効 → 再認証
          localStorage.removeItem(STORAGE_KEY);
          authToken = '';
          loading.style.display = 'none';
          authSection.style.display = 'block';
          lockBadge.style.display = 'none';
          authError.textContent = 'パスワードが正しくありません。再入力してください。';
          authError.style.display = 'block';
          analyzeBtn.disabled = false;
          return;
        }

        if (!res.ok || data.error) throw new Error(data.error || 'エラーが発生しました');

        loading.style.display = 'none';
        reportFrame.srcdoc = data.report;
        reportFrame.onload = () => {
          try { reportFrame.style.height = reportFrame.contentDocument.body.scrollHeight + 40 + 'px'; } catch(_) {}
        };
        reportWrap.style.display = 'block';
        newBtn.style.display = 'block';
      } catch (err) {
        loading.style.display = 'none';
        uploadSection.style.display = 'block';
        analyzeBtn.disabled = false;
        analyzeError.textContent = '⚠️ ' + err.message;
        analyzeError.style.display = 'block';
      }
    });

    newBtn.addEventListener('click', () => {
      selectedFile = null; fileInput.value = '';
      previewWrap.style.display = 'none'; analyzeBtn.style.display = 'none';
      analyzeBtn.disabled = false; reportWrap.style.display = 'none';
      newBtn.style.display = 'none'; analyzeError.style.display = 'none';
      uploadSection.style.display = 'block';
    });

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
    const url    = new URL(request.url);
    const origin = request.headers.get('Origin') ?? '';
    const workerOrigin = `https://${url.hostname}`;

    // 同一オリジンのみ許可（GET はブラウザ直アクセスのため除外）
    const isSameOrigin = !origin || origin === workerOrigin;

    if (request.method === 'OPTIONS') {
      // プリフライト: 同一オリジンのみ許可
      if (!isSameOrigin) return new Response('Forbidden', { status: 403 });
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': workerOrigin,
          'Access-Control-Allow-Methods': 'POST',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // フロントエンド配信
    if (request.method === 'GET' && url.pathname === '/') {
      return new Response(getFrontendHTML(), {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Frame-Options': 'DENY' },
      });
    }

    // 解析エンドポイント
    if (request.method === 'POST' && url.pathname === '/analyze') {
      // ① Bearer トークン認証
      const auth = request.headers.get('Authorization') ?? '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      if (!env.WORKER_SECRET || token !== env.WORKER_SECRET) {
        return json({ error: '認証に失敗しました' }, 401);
      }

      let body;
      try { body = await request.json(); } catch {
        return json({ error: 'リクエスト形式が不正です' }, 400);
      }

      const { imageBase64, mediaType } = body;

      // ② MIMEタイプ検証
      if (!ALLOWED_MIME.includes(mediaType)) {
        return json({ error: '対応していない画像形式です（JPEG/PNG/WebP/HEIC のみ）' }, 400);
      }

      // ③ サイズ検証（Base64 は元サイズの約4/3）
      const approxBytes = (imageBase64?.length ?? 0) * 0.75;
      if (approxBytes > MAX_IMAGE_BYTES) {
        return json({ error: '画像サイズが大きすぎます（上限 5MB）' }, 400);
      }

      if (!imageBase64) return json({ error: '画像データがありません' }, 400);

      // ④ Gemini API 呼び出し
      try {
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { inline_data: { mime_type: mediaType, data: imageBase64 } },
                  { text: ANALYZE_PROMPT },
                ],
              }],
              generationConfig: { maxOutputTokens: 8192, temperature: 0.3 },
            }),
          }
        );

        const data = await geminiRes.json();
        if (!geminiRes.ok) {
          const errBody = await geminiRes.json().catch(() => ({}));
          const errMsg = errBody?.error?.message ?? '詳細不明';
          return json({ error: `Gemini APIエラー (HTTP ${geminiRes.status}): ${errMsg}` }, 500);
        }

        let report = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        report = report.replace(/^```html\s*/i, '').replace(/```\s*$/, '').trim();
        return json({ report }, 200);
      } catch {
        return json({ error: 'サーバーエラーが発生しました' }, 500);
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
