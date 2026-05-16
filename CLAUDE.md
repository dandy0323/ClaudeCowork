# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Cloudflare Worker のローカル開発サーバー起動
cd cloudflare-worker && npx wrangler dev

# Cloudflare Worker のデプロイ（通常は CF Git 連携で自動デプロイ）
cd cloudflare-worker && npx wrangler deploy

# Excel ログ新規生成（引数省略時は当月）
python3 scripts/generate_excel.py 202604

# Word 月次レポート新規生成
node scripts/generate_word.js 202604

# Excel 週次データ追記（引数2: ENTRIES配列の0-basedインデックス）
python3 scripts/update_weekly.py 202604 2
```

依存ライブラリ: `npm install`（docx）、`pip install openpyxl`

## Architecture

このリポジトリには2つの独立したサブシステムがある。

### 1. Cloudflare Worker (`cloudflare-worker/worker.js`)

単一ファイルで完結するサーバーレスアプリ。フロントエンド HTML とバックエンド API を同居させている。

**ルーティング**
- `GET /` — Cookie 認証チェック → 未認証ならログイン画面、認証済みならアプリ画面
- `POST /login` — HTML フォーム POST でパスワード検証 → `pa_session` Cookie をセット
- `POST /analyze` — Cookie 認証 → 2ステップ Gemini 解析 → HTML レポートを JSON で返す

**Gemini 2ステップ方式（重要）**
`google_search` ツールと画像入力を同一リクエストに混在させると Gemini API がエラーを返すため、必ず2回に分ける:
- Step1: 画像 → ポートフォリオ JSON 抽出（`google_search` なし、`maxOutputTokens: 2048`）
- Step2: ポートフォリオ JSON → HTML レポート生成（`google_search: {}` 付き、`maxOutputTokens: 32768`）

**Gemini レスポンス処理**
`gemini-2.5-flash` は Thinking モデルであり、`parts[0]` が `thought: true` のノイズになる場合がある。`extractText()` 関数で `!p.thought` なパートを優先して取得している。

**認証**
Cookie ベース（`HttpOnly; Secure; SameSite=Strict`）。JS 不使用の HTML フォーム POST でログインするため iOS Safari の localStorage 制限や keyboard dismiss 問題を回避している。

**フロントエンド**
インライン HTML（`getFrontendHTML()`）。画像入力は `navigator.clipboard.read()`（iOS 対応）とファイル選択の2系統。分析履歴は `localStorage` の `portfolio_history` キーに最大20件保存。

**Worker シークレット（Cloudflare Dashboard で設定）**
- `GEMINI_API_KEY` — Google AI Studio の API キー
- `WORKER_SECRET` — アクセスパスワード兼 Cookie 値

**コーディング制約**
テンプレートリテラル（バッククォート）内に日本語文字列を含めると wrangler ビルドが `Expected ";" but found "$"` エラーを出す。文字列連結（`+`）または HTML エンティティで代替すること。

### 2. ローカルスクリプト群 (`scripts/`)

株式運用ログの Excel・Word ファイルをローカル生成するスタンドアロンスクリプト。出力先は `株売買アドバイス/yyyymm/` 配下。

- `generate_excel.py` — openpyxl で4シート構成の Excel を新規生成（週次ログ・ポートフォリオ推移・AIアドバイス評価・現在ポートフォリオ）
- `generate_word.js` — docx ライブラリで月次レポート Word ファイルを新規生成
- `update_weekly.py` — 既存 Excel に週次データを追記する。`ENTRIES` 配列に新週のデータを追加して実行する

ポートフォリオ初期データ（12銘柄、2026年3月21日時点）は `generate_excel.py` と `generate_word.js` の両方に定数として重複定義されている。銘柄変更時は両ファイルを更新する必要がある。
