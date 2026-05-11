/**
 * Cloudflare Worker: 株式ポートフォリオ週次レポート自動生成
 * GET  /         → フロントエンドHTML
 * POST /analyze  → スクショ画像 → Gemini解析 → HTMLレポート
 *
 * 環境変数 (Workerシークレット):
 *   GEMINI_API_KEY  ... Google AI Studio で発行したAPIキー
 */

// ============================================================
// ポートフォリオ取得原価データ（更新時はここを変更）
// ============================================================
const PORTFOLIO_CONTEXT = `
【取得原価データ】
銘柄コード | 銘柄名                    | 保有株数  | 平均取得単価 | 取得総額
290A       | Synspective               | 100株     | 1,245円     | 124,500円
4661       | オリエンタルランド        | 17.88株   | 2,796円     | 49,999円
6146       | ディスコ                  | 0.414株   | 72,470円    | 30,000円
6758       | ソニーグループ            | 50株      | 3,260円     | 163,000円
6857       | アドバンテスト            | 1.89株    | 26,408円    | 49,999円
6954       | ファナック                | 7.23株    | 6,913円     | 49,999円
7011       | 三菱重工業（一部売り済）  | 2.84株    | 5,104円     | 14,513円
7735       | SCREENホールディングス    | 1.33株    | 22,390円    | 29,999円
7974       | 任天堂                    | 11.73株   | 8,522円     | 99,999円
8035       | 東京エレクトロン          | 0.228株   | 43,777円    | 10,000円
9983       | ファーストリテイリング    | 0.149株   | 66,737円    | 10,000円

【投資方針】
- リスク許容度: 中リスク・中期投資
- 1回の取引上限: 500,000円
- 取引市場: 東証のみ
- 具体的な売買指示は行わず、情報整理と検討材料の提供のみ
- 現在未保有セクター: 金融・保険・食品・エネルギー・ヘルスケア
`.trim();

const ANALYZE_PROMPT = `
あなたは株式ポートフォリオの週次レポートを生成するAIアシスタントです。

添付のスクリーンショットは証券会社アプリのポートフォリオ画面です。
スクリーンショットのデータを正確に読み取り、以下の構成でHTMLレポートを生成してください。

${PORTFOLIO_CONTEXT}

【生成するHTMLレポートの構成】
1. ヘッダー: 「週次ポートフォリオレポート」タイトル・スクショから読み取った日付や週次情報
2. サマリーカード（横並び3枚）:
   - 評価総額（スクショの合計値）
   - 損益額（取得原価比）
   - 損益率
3. 銘柄別評価テーブル（全カラム）:
   - 銘柄コード | 銘柄名 | 現在値 | 評価額 | 損益額 | 損益率 | 評価(〇/△/×) | 来週のアクション
   - 損益プラスの行: 薄緑背景 (#e8f5e9)
   - 損益マイナスの行: 薄赤背景 (#ffebee)
4. 今週のポイント（箇条書き3〜5点）: 特に動きの大きかった銘柄・市場の出来事
5. 新規購入検討候補（2〜3銘柄）:
   - 現在未保有のセクター（金融・保険・食品・化学素材・エネルギー等）から提案
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
    body {
      font-family: -apple-system, 'Helvetica Neue', sans-serif;
      background: #f4f6f9;
      min-height: 100vh;
    }
    header {
      background: #1F3864;
      color: #fff;
      padding: 16px 20px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    header h1 { font-size: 18px; font-weight: 700; }
    header p  { font-size: 12px; opacity: 0.75; margin-top: 2px; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px 16px; }

    /* Upload card */
    .upload-card {
      background: #fff;
      border-radius: 12px;
      padding: 24px 20px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      margin-bottom: 16px;
    }
    .upload-area {
      border: 2px dashed #2E75B6;
      border-radius: 10px;
      padding: 32px 16px;
      text-align: center;
      cursor: pointer;
      transition: background 0.2s;
      position: relative;
    }
    .upload-area:active, .upload-area.drag-over { background: #e8f0fe; }
    .upload-area input[type="file"] {
      position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%;
    }
    .upload-icon { font-size: 40px; margin-bottom: 8px; }
    .upload-text { color: #1F3864; font-size: 15px; font-weight: 600; }
    .upload-sub  { color: #888; font-size: 12px; margin-top: 4px; }

    #preview-wrap { display: none; margin-top: 16px; text-align: center; }
    #preview-img  { max-width: 100%; max-height: 240px; border-radius: 8px; border: 1px solid #ddd; }

    #analyze-btn {
      display: none;
      width: 100%;
      margin-top: 16px;
      padding: 14px;
      background: #2E75B6;
      color: #fff;
      border: none;
      border-radius: 10px;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
      transition: background 0.2s;
    }
    #analyze-btn:active  { background: #1F3864; }
    #analyze-btn:disabled { background: #aaa; cursor: not-allowed; }

    /* Loading */
    #loading {
      display: none;
      background: #fff;
      border-radius: 12px;
      padding: 32px;
      text-align: center;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      margin-bottom: 16px;
    }
    .spinner {
      width: 40px; height: 40px;
      border: 4px solid #e0e7f0;
      border-top-color: #2E75B6;
      border-radius: 50%;
      animation: spin 0.9s linear infinite;
      margin: 0 auto 12px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    #loading p { color: #555; font-size: 14px; }

    /* Error */
    #error-msg {
      display: none;
      background: #fff0f0;
      border: 1px solid #f5c6cb;
      border-radius: 10px;
      padding: 14px 16px;
      color: #c0392b;
      font-size: 14px;
      margin-bottom: 16px;
    }

    /* Report iframe */
    #report-wrap { display: none; margin-bottom: 24px; }
    #report-wrap h2 {
      font-size: 14px; color: #555; margin-bottom: 8px;
      display: flex; align-items: center; gap: 6px;
    }
    #report-frame {
      width: 100%;
      border: none;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.10);
      min-height: 80vh;
    }
    #new-analyze-btn {
      display: none;
      width: 100%;
      padding: 12px;
      background: #f0f4fa;
      color: #1F3864;
      border: 2px solid #1F3864;
      border-radius: 10px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      margin-bottom: 24px;
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>📊 株式ポートフォリオ分析</h1>
      <p>スクショをアップロードして週次レポートを自動生成</p>
    </div>
  </header>

  <div class="container">
    <div class="upload-card" id="upload-section">
      <div class="upload-area" id="drop-zone">
        <input type="file" id="file-input" accept="image/*" capture="environment">
        <div class="upload-icon">📸</div>
        <div class="upload-text">スクショを選択 / カメラで撮影</div>
        <div class="upload-sub">タップして選択、またはここにドロップ</div>
      </div>
      <div id="preview-wrap">
        <img id="preview-img" alt="選択した画像">
      </div>
      <button id="analyze-btn">🔍 分析してレポートを生成</button>
    </div>

    <div id="loading">
      <div class="spinner"></div>
      <p>Gemini がレポートを生成中です...<br>少々お待ちください（10〜30秒）</p>
    </div>

    <div id="error-msg"></div>

    <div id="report-wrap">
      <h2>✅ 生成されたレポート</h2>
      <iframe id="report-frame" scrolling="yes"></iframe>
    </div>
    <button id="new-analyze-btn">↩ 新しいスクショを分析する</button>
  </div>

  <script>
    const fileInput    = document.getElementById('file-input');
    const dropZone     = document.getElementById('drop-zone');
    const previewWrap  = document.getElementById('preview-wrap');
    const previewImg   = document.getElementById('preview-img');
    const analyzeBtn   = document.getElementById('analyze-btn');
    const loading      = document.getElementById('loading');
    const errorMsg     = document.getElementById('error-msg');
    const reportWrap   = document.getElementById('report-wrap');
    const reportFrame  = document.getElementById('report-frame');
    const newBtn       = document.getElementById('new-analyze-btn');
    const uploadSection = document.getElementById('upload-section');

    let selectedFile = null;

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) setFile(file);
    });

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) setFile(file);
    });

    function setFile(file) {
      selectedFile = file;
      const reader = new FileReader();
      reader.onload = (e) => {
        previewImg.src = e.target.result;
        previewWrap.style.display = 'block';
        analyzeBtn.style.display = 'block';
      };
      reader.readAsDataURL(file);
    }

    analyzeBtn.addEventListener('click', async () => {
      if (!selectedFile) return;
      analyzeBtn.disabled = true;
      errorMsg.style.display = 'none';
      uploadSection.style.display = 'none';
      loading.style.display = 'block';

      try {
        const base64 = await toBase64(selectedFile);
        const res = await fetch('/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64, mediaType: selectedFile.type }),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'エラーが発生しました');

        loading.style.display = 'none';
        reportFrame.srcdoc = data.report;
        reportFrame.onload = () => {
          reportFrame.style.height = reportFrame.contentDocument.body.scrollHeight + 40 + 'px';
        };
        reportWrap.style.display = 'block';
        newBtn.style.display = 'block';
      } catch (err) {
        loading.style.display = 'none';
        uploadSection.style.display = 'block';
        analyzeBtn.disabled = false;
        errorMsg.textContent = '⚠️ ' + err.message;
        errorMsg.style.display = 'block';
      }
    });

    newBtn.addEventListener('click', () => {
      selectedFile = null;
      fileInput.value = '';
      previewWrap.style.display = 'none';
      analyzeBtn.style.display = 'none';
      analyzeBtn.disabled = false;
      reportWrap.style.display = 'none';
      newBtn.style.display = 'none';
      errorMsg.style.display = 'none';
      uploadSection.style.display = 'block';
    });

    function toBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
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
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    // フロントエンドを返す
    if (request.method === 'GET' && url.pathname === '/') {
      return new Response(getFrontendHTML(), {
        headers: { ...cors, 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // 画像解析エンドポイント
    if (request.method === 'POST' && url.pathname === '/analyze') {
      try {
        const { imageBase64, mediaType } = await request.json();
        if (!imageBase64 || !mediaType) {
          return json({ error: 'imageBase64 と mediaType が必要です' }, 400, cors);
        }

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
              generationConfig: {
                maxOutputTokens: 8192,
                temperature: 0.3,
              },
            }),
          }
        );

        const data = await geminiRes.json();
        if (!geminiRes.ok) {
          return json({ error: data.error?.message ?? 'Gemini API エラー' }, 500, cors);
        }

        let report = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        // コードブロックが混入した場合に除去
        report = report.replace(/^```html\s*/i, '').replace(/```\s*$/, '').trim();

        return json({ report }, 200, cors);
      } catch (e) {
        return json({ error: e.message }, 500, cors);
      }
    }

    return new Response('Not Found', { status: 404 });
  },
};

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}
