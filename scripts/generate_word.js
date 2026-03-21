#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * 株式運用月次レポート Word生成スクリプト
 * 用途: 毎月の株式運用月次レポートWordファイルを生成する
 * 使用方法: node scripts/generate_word.js [yyyymm]
 * 例: node scripts/generate_word.js 202603
 */

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, AlignmentType, HeadingLevel,
  TableOfContents, Header, Footer, PageNumber, NumberFormat,
  UnderlineType, ShadingType
} = require("docx");
const fs = require("fs");
const path = require("path");

// ============================================================
// カラー定数
// ============================================================
const NAVY   = "1F3864";
const BLUE   = "2E75B6";
const WHITE  = "FFFFFF";
const GREEN  = "375623";
const GREEN_BG = "E2EFDA";
const RED    = "C00000";
const RED_BG = "FCE4D6";
const YELLOW_BG = "FFF2CC";
const LIGHT_BLUE_BG = "DEEAF1";
const GRAY_BG = "F2F2F2";

// ============================================================
// 初期ポートフォリオデータ（2026年3月21日時点）
// ============================================================
const PORTFOLIO = [
  { code: "290A",  name: "Synspective",           shares: 100,    avgPrice: 1245,  acquisition: 124500, currentPrice: 1367,  value: 136700, pl: 12200,  plRate: 0.098,  sector: "宇宙・防衛" },
  { code: "4661",  name: "オリエンタルランド",   shares: 17.88,  avgPrice: 2796,  acquisition: 49999,  currentPrice: 2724,  value: 48712,  pl: -1287,  plRate: -0.026, sector: "エンタメ・観光" },
  { code: "6146",  name: "ディスコ",             shares: 0.414,  avgPrice: 72470, acquisition: 30000,  currentPrice: 69580, value: 28803,  pl: -1197,  plRate: -0.040, sector: "半導体製造装置" },
  { code: "6460",  name: "セガサミーHD",         shares: 0.751,  avgPrice: 2551,  acquisition: 1914,   currentPrice: 2553,  value: 1915,   pl: 1,      plRate: 0.001,  sector: "エンタメ・ゲーム" },
  { code: "6758",  name: "ソニーグループ",        shares: 50,     avgPrice: 3260,  acquisition: 163000, currentPrice: 3271,  value: 163550, pl: 550,    plRate: 0.003,  sector: "電機・エンタメ" },
  { code: "6857",  name: "アドバンテスト",        shares: 1.89,   avgPrice: 26408, acquisition: 49999,  currentPrice: 23980, value: 45402,  pl: -4597,  plRate: -0.092, sector: "半導体製造装置" },
  { code: "6954",  name: "ファナック",            shares: 7.23,   avgPrice: 6913,  acquisition: 49999,  currentPrice: 5936,  value: 42933,  pl: -7066,  plRate: -0.141, sector: "産業用ロボット" },
  { code: "7011",  name: "三菱重工業",           shares: 19.59,  avgPrice: 5104,  acquisition: 99999,  currentPrice: 4848,  value: 94984,  pl: -5015,  plRate: -0.050, sector: "重工・防衛" },
  { code: "7735",  name: "SCREENホールディングス",shares: 1.33,   avgPrice: 22390, acquisition: 29999,  currentPrice: 19895, value: 26656,  pl: -3343,  plRate: -0.111, sector: "半導体製造装置" },
  { code: "7974",  name: "任天堂",               shares: 11.73,  avgPrice: 8522,  acquisition: 99999,  currentPrice: 9734,  value: 114222, pl: 14223,  plRate: 0.142,  sector: "ゲーム" },
  { code: "8035",  name: "東京エレクトロン",     shares: 0.228,  avgPrice: 43777, acquisition: 10000,  currentPrice: 39330, value: 8984,   pl: -1016,  plRate: -0.102, sector: "半導体製造装置" },
  { code: "9983",  name: "ファーストリテイリング",shares: 0.149,  avgPrice: 66737, acquisition: 10000,  currentPrice: 63430, value: 9504,   pl: -496,   plRate: -0.050, sector: "小売" },
];

const TOTAL = {
  acquisition: 717213,
  value: 712470,
  pl: -4743,
  plRate: -0.0066,
};

// ============================================================
// ヘルパー：数値フォーマット
// ============================================================
function fmtNum(n) {
  return n.toLocaleString("ja-JP");
}
function fmtPct(n) {
  return (n >= 0 ? "+" : "") + (n * 100).toFixed(2) + "%";
}
function fmtPl(n) {
  return (n >= 0 ? "+" : "") + fmtNum(n) + "円";
}

// ============================================================
// ヘルパー：スタイル部品
// ============================================================
function navyRun(text, size = 24, bold = true) {
  return new TextRun({ text, bold, size, color: NAVY, font: "Arial" });
}
function blueRun(text, size = 20, bold = false) {
  return new TextRun({ text, bold, size, color: BLUE, font: "Arial" });
}
function bodyRun(text, size = 20, bold = false, color = "000000") {
  return new TextRun({ text, bold, size, color, font: "Arial" });
}
function whiteRun(text, size = 20, bold = true) {
  return new TextRun({ text, bold, size, color: WHITE, font: "Arial" });
}

function h1Para(text) {
  return new Paragraph({
    children: [
      new TextRun({ text, bold: true, size: 28, color: NAVY, font: "Arial", underline: { type: UnderlineType.SINGLE, color: BLUE } })
    ],
    spacing: { before: 300, after: 120 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 8, color: BLUE },
    }
  });
}

function h2Para(text) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 24, color: BLUE, font: "Arial" })],
    spacing: { before: 200, after: 80 },
  });
}

function bodyPara(text, bold = false, size = 20) {
  return new Paragraph({
    children: [new TextRun({ text, bold, size, font: "Arial" })],
    spacing: { before: 60, after: 60 },
  });
}

function bulletPara(text, size = 20) {
  return new Paragraph({
    children: [new TextRun({ text: `• ${text}`, size, font: "Arial" })],
    spacing: { before: 40, after: 40 },
    indent: { left: 360 },
  });
}

// ============================================================
// テーブルヘルパー
// ============================================================
function makeCell(text, options = {}) {
  const {
    bgColor = WHITE,
    fontColor = "000000",
    bold = false,
    size = 18,
    align = AlignmentType.CENTER,
    width,
  } = options;

  const cellProps = {
    shading: { type: ShadingType.CLEAR, color: bgColor, fill: bgColor },
    borders: {
      top:    { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" },
      left:   { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" },
      right:  { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" },
    },
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
  };
  if (width) cellProps.width = width;

  return new TableCell({
    ...cellProps,
    children: [
      new Paragraph({
        alignment: align,
        children: [new TextRun({ text: String(text), bold, size, color: fontColor, font: "Arial" })],
      }),
    ],
  });
}

function headerCell(text, options = {}) {
  return makeCell(text, { bgColor: NAVY, fontColor: WHITE, bold: true, size: 18, ...options });
}
function subtotalCell(text, options = {}) {
  return makeCell(text, { bgColor: BLUE, fontColor: WHITE, bold: true, size: 18, ...options });
}
function greenCell(text, options = {}) {
  return makeCell(text, { bgColor: GREEN_BG, fontColor: GREEN, bold: false, size: 18, ...options });
}
function redCell(text, options = {}) {
  return makeCell(text, { bgColor: RED_BG, fontColor: RED, bold: false, size: 18, ...options });
}

// ============================================================
// KPIボックステーブル
// ============================================================
function buildKpiTable() {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          headerCell("評価総額", { width: { size: 25, type: WidthType.PERCENTAGE } }),
          headerCell("月間損益額", { width: { size: 25, type: WidthType.PERCENTAGE } }),
          headerCell("月間損益率", { width: { size: 25, type: WidthType.PERCENTAGE } }),
          headerCell("含み益銘柄数", { width: { size: 25, type: WidthType.PERCENTAGE } }),
        ],
        tableHeader: true,
      }),
      new TableRow({
        children: [
          makeCell("¥712,470", { bgColor: LIGHT_BLUE_BG, bold: true, size: 22, fontColor: NAVY }),
          makeCell(fmtPl(TOTAL.pl), { bgColor: RED_BG, bold: true, size: 22, fontColor: RED }),
          makeCell(fmtPct(TOTAL.plRate), { bgColor: RED_BG, bold: true, size: 22, fontColor: RED }),
          makeCell("3銘柄 / 12銘柄", { bgColor: LIGHT_BLUE_BG, bold: true, size: 22, fontColor: NAVY }),
        ],
      }),
    ],
  });
}

// ============================================================
// ポートフォリオ一覧テーブル
// ============================================================
function buildPortfolioTable() {
  const headers = ["コード", "銘柄名", "株数", "取得総額", "評価額", "損益", "損益率", "セクター"];
  const headerRow = new TableRow({
    children: headers.map(h => headerCell(h)),
    tableHeader: true,
  });

  const dataRows = PORTFOLIO.map(s => {
    const isGain = s.pl >= 0;
    const cellFn = isGain ? greenCell : redCell;
    return new TableRow({
      children: [
        makeCell(s.code, { size: 16 }),
        makeCell(s.name, { size: 16, align: AlignmentType.LEFT }),
        makeCell(String(s.shares), { size: 16 }),
        makeCell(`¥${fmtNum(s.acquisition)}`, { size: 16 }),
        makeCell(`¥${fmtNum(s.value)}`, { size: 16 }),
        cellFn(fmtPl(s.pl), { size: 16 }),
        cellFn(fmtPct(s.plRate), { size: 16 }),
        makeCell(s.sector, { size: 16 }),
      ],
    });
  });

  const totalRow = new TableRow({
    children: [
      subtotalCell("合計"),
      subtotalCell(""),
      subtotalCell(""),
      subtotalCell(`¥${fmtNum(TOTAL.acquisition)}`),
      subtotalCell(`¥${fmtNum(TOTAL.value)}`),
      subtotalCell(fmtPl(TOTAL.pl)),
      subtotalCell(fmtPct(TOTAL.plRate)),
      subtotalCell(""),
    ],
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...dataRows, totalRow],
  });
}

// ============================================================
// 週次推移テーブル
// ============================================================
function buildWeeklyTable() {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          headerCell("週"),
          headerCell("記録日"),
          headerCell("評価総額"),
          headerCell("損益額"),
          headerCell("損益率"),
          headerCell("メモ"),
        ],
        tableHeader: true,
      }),
      new TableRow({
        children: [
          makeCell("第1週"),
          makeCell("2026/3/21"),
          makeCell(`¥${fmtNum(TOTAL.value)}`),
          redCell(fmtPl(TOTAL.pl)),
          redCell(fmtPct(TOTAL.plRate)),
          makeCell("初回記録", { align: AlignmentType.LEFT }),
        ],
      }),
      ...[2,3,4].map(w => new TableRow({
        children: [
          makeCell(`第${w}週`, { bgColor: GRAY_BG }),
          makeCell("―", { bgColor: GRAY_BG }),
          makeCell("―", { bgColor: GRAY_BG }),
          makeCell("―", { bgColor: GRAY_BG }),
          makeCell("―", { bgColor: GRAY_BG }),
          makeCell("記録予定", { bgColor: GRAY_BG, align: AlignmentType.LEFT }),
        ],
      })),
    ],
  });
}

// ============================================================
// AIアドバイス評価テーブル（初回）
// ============================================================
function buildAiEvalTable() {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          headerCell("推奨件数"),
          headerCell("〇 的中"),
          headerCell("△ 概ね"),
          headerCell("× 外れ"),
          headerCell("的中率"),
        ],
        tableHeader: true,
      }),
      new TableRow({
        children: [
          makeCell("12件（初回）"),
          makeCell("―"),
          makeCell("―"),
          makeCell("―"),
          makeCell("評価中"),
        ],
      }),
    ],
  });
}

// ============================================================
// セクター構成テーブル
// ============================================================
function buildSectorTable() {
  const sectors = {};
  PORTFOLIO.forEach(s => {
    sectors[s.sector] = (sectors[s.sector] || 0) + s.acquisition;
  });
  const total = TOTAL.acquisition;
  const rows = Object.entries(sectors).map(([sec, amt]) => {
    const pct = ((amt / total) * 100).toFixed(1);
    return new TableRow({
      children: [
        makeCell(sec, { align: AlignmentType.LEFT }),
        makeCell(`¥${fmtNum(amt)}`),
        makeCell(`${pct}%`),
      ],
    });
  });

  return new Table({
    width: { size: 70, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          headerCell("セクター"),
          headerCell("取得総額"),
          headerCell("構成比"),
        ],
        tableHeader: true,
      }),
      ...rows,
      new TableRow({
        children: [
          subtotalCell("合計"),
          subtotalCell(`¥${fmtNum(total)}`),
          subtotalCell("100.0%"),
        ],
      }),
    ],
  });
}

// ============================================================
// 免責文
// ============================================================
const DISCLAIMER =
  "【免責事項】本レポートはAIによる情報整理・分析補助を目的としたものであり、" +
  "特定の銘柄の売買を推奨するものではありません。最終的な投資判断はすべてご自身の責任において行ってください。" +
  "AIは投資アドバイザーではありません。";

// ============================================================
// ドキュメント生成
// ============================================================
function buildDocument(yyyymm) {
  const year  = yyyymm.slice(0, 4);
  const month = parseInt(yyyymm.slice(4, 6), 10);
  const title = `株式運用月次レポート　${year}年${month}月`;

  const doc = new Document({
    creator: "Claude Code Stock Assistant",
    title,
    description: "株式運用月次レポート - AI補助による情報整理",
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1000, bottom: 1000, left: 1200, right: 1200 },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: title,
                    bold: true,
                    size: 22,
                    color: NAVY,
                    font: "Arial",
                  }),
                ],
                border: {
                  bottom: { style: BorderStyle.SINGLE, size: 6, color: BLUE },
                },
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: DISCLAIMER + "    ", size: 14, color: "808080", font: "Arial" }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 14, font: "Arial" }),
                  new TextRun({ text: " / ", size: 14, font: "Arial" }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 14, font: "Arial" }),
                ],
              }),
            ],
          }),
        },
        children: [
          // ========== 表紙タイトル ==========
          new Paragraph({
            children: [new TextRun({ text: title, bold: true, size: 36, color: NAVY, font: "Arial" })],
            alignment: AlignmentType.CENTER,
            spacing: { before: 200, after: 100 },
            border: { bottom: { style: BorderStyle.THICK, size: 12, color: BLUE } },
          }),
          new Paragraph({
            children: [new TextRun({ text: `記録開始日：${year}年${month}月21日　　運用スタイル：中期・中リスク`, size: 20, color: "808080", font: "Arial" })],
            alignment: AlignmentType.CENTER,
            spacing: { before: 80, after: 300 },
          }),

          // ========== 第1章：月間パフォーマンスサマリー ==========
          h1Para("第1章　月間パフォーマンスサマリー"),
          h2Para("1-1. KPI サマリー"),
          buildKpiTable(),
          new Paragraph({ spacing: { before: 120, after: 60 } }),

          h2Para("1-2. 週次評価額推移"),
          buildWeeklyTable(),
          new Paragraph({ spacing: { before: 120, after: 60 } }),

          h2Para("1-3. 銘柄別損益内訳"),
          buildPortfolioTable(),
          new Paragraph({ spacing: { before: 120, after: 60 } }),

          bodyPara("※ 本月は初回記録のため、月間損益は取得時点からの評価損益を示しています。", false, 18),

          // ========== 第2章：AIアドバイス的中率 ==========
          h1Para("第2章　AIアドバイスの的中率・分析"),
          h2Para("2-1. 月間アドバイス集計"),
          buildAiEvalTable(),
          new Paragraph({ spacing: { before: 100, after: 60 } }),

          bodyPara("【初回月のため評価基準の設定】", true),
          bulletPara("第1週は全銘柄「保有継続」として記録（初回基準点）"),
          bulletPara("第2週以降の週次レポートから〇△×評価を積み上げ"),
          bulletPara("的中率 = (〇 + △) ÷ 総推奨件数"),
          new Paragraph({ spacing: { before: 100, after: 60 } }),

          bodyPara("【AI情報整理の方針】", true),
          bulletPara("AIは投資推奨ではなく「情報整理・リスク観点・判断材料の提示」に特化"),
          bulletPara("最終的な売買判断はユーザー自身が行うことを前提とする"),
          bulletPara("アドバイスのズレが生じた場合は翌週のレポートで原因分析を行う"),

          // ========== 第3章：成功・失敗銘柄 ==========
          h1Para("第3章　今月の成功銘柄・失敗銘柄"),
          h2Para("成功銘柄（含み益上位）"),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  headerCell("銘柄"), headerCell("損益額"), headerCell("損益率"), headerCell("主な要因"),
                ],
                tableHeader: true,
              }),
              new TableRow({
                children: [
                  greenCell("7974 任天堂"),
                  greenCell("+14,223円"),
                  greenCell("+14.2%"),
                  greenCell("Nintendo Switch 2発表・ゲーム市場拡大期待", { align: AlignmentType.LEFT }),
                ],
              }),
              new TableRow({
                children: [
                  greenCell("290A Synspective"),
                  greenCell("+12,200円"),
                  greenCell("+9.8%"),
                  greenCell("宇宙・防衛関連への注目度上昇", { align: AlignmentType.LEFT }),
                ],
              }),
              new TableRow({
                children: [
                  greenCell("6758 ソニーグループ"),
                  greenCell("+550円"),
                  greenCell("+0.3%"),
                  greenCell("エンタメ・半導体部門の底堅さ", { align: AlignmentType.LEFT }),
                ],
              }),
            ],
          }),
          new Paragraph({ spacing: { before: 120, after: 60 } }),

          h2Para("要注意銘柄（含み損上位）"),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  headerCell("銘柄"), headerCell("損益額"), headerCell("損益率"), headerCell("主な要因"),
                ],
                tableHeader: true,
              }),
              new TableRow({
                children: [
                  redCell("6954 ファナック"),
                  redCell("-7,066円"),
                  redCell("-14.1%"),
                  redCell("中国需要減速・自動化投資先送り懸念", { align: AlignmentType.LEFT }),
                ],
              }),
              new TableRow({
                children: [
                  redCell("7011 三菱重工業"),
                  redCell("-5,015円"),
                  redCell("-5.0%"),
                  redCell("防衛予算期待一巡・株価調整局面", { align: AlignmentType.LEFT }),
                ],
              }),
              new TableRow({
                children: [
                  redCell("6857 アドバンテスト"),
                  redCell("-4,597円"),
                  redCell("-9.2%"),
                  redCell("半導体市況の不透明感・TSMCガイダンス", { align: AlignmentType.LEFT }),
                ],
              }),
            ],
          }),
          new Paragraph({ spacing: { before: 120, after: 60 } }),

          bodyPara("※ 初回記録のため「失敗」確定ではなく、中期保有前提の含み損として記録。来月以降のトレンドで判断。", false, 18),

          // ========== 第4章：来月に向けた改善アクション ==========
          h1Para("第4章　来月に向けた改善アクション"),
          h2Para("4-1. ポートフォリオ構成の改善点"),
          bulletPara("【セクター集中リスク】半導体製造装置（6146・6857・7735・8035）が取得総額の21%を占める"),
          bulletPara("→ 来月の動向次第では一部整理も検討材料"),
          bulletPara("【分散の方向性】宇宙・防衛（290A・7011）と半導体の2軸集中を意識する"),
          bulletPara("現金比率が記録されていないため、来週より現金残高の入力を開始する"),
          new Paragraph({ spacing: { before: 100, after: 60 } }),

          h2Para("4-2. AI情報整理の精度向上策"),
          bulletPara("週次レポートのweb検索精度を高めるため、銘柄ごとに決算カレンダーを事前確認する"),
          bulletPara("マクロ環境（日経平均・為替・米国金利）の週次記録を開始する"),
          bulletPara("アドバイスのズレ原因を類型化（マクロ要因 / 個別材料 / タイミング）していく"),
          new Paragraph({ spacing: { before: 100, after: 60 } }),

          h2Para("4-3. 来月の重点観察銘柄リスト"),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  headerCell("銘柄"), headerCell("チェックポイント"), headerCell("判断目安"),
                ],
                tableHeader: true,
              }),
              new TableRow({
                children: [
                  makeCell("6954 ファナック"),
                  makeCell("中国向け受注回復の有無・4Q決算", { align: AlignmentType.LEFT }),
                  makeCell("6,000円回復なら継続。5,500円割れで見直し", { align: AlignmentType.LEFT }),
                ],
              }),
              new TableRow({
                children: [
                  makeCell("7735 SCREEN"),
                  makeCell("半導体装置受注動向・顧客ガイダンス", { align: AlignmentType.LEFT }),
                  makeCell("20,000円割れで損切り検討", { align: AlignmentType.LEFT }),
                ],
              }),
              new TableRow({
                children: [
                  makeCell("7974 任天堂"),
                  makeCell("Switch2発売時期確認・初動売上", { align: AlignmentType.LEFT }),
                  makeCell("10,500円以上なら利益確定検討", { align: AlignmentType.LEFT }),
                ],
              }),
              new TableRow({
                children: [
                  makeCell("290A Synspective"),
                  makeCell("衛星打ち上げ進捗・受注状況", { align: AlignmentType.LEFT }),
                  makeCell("1,200円割れで見直し", { align: AlignmentType.LEFT }),
                ],
              }),
            ],
          }),

          // ========== 第5章：ポートフォリオ構成推移 ==========
          h1Para("第5章　ポートフォリオ構成の推移グラフコメント"),
          h2Para("5-1. セクター構成比（取得総額ベース）"),
          buildSectorTable(),
          new Paragraph({ spacing: { before: 120, after: 60 } }),

          bodyPara("【集中リスクコメント】", true),
          bulletPara("半導体製造装置セクターが最多（6146・6857・7735・8035の合計：約120,000円・16.7%）"),
          bulletPara("防衛・重工セクター（290A・7011）が取得総額の31%（224,499円）を占める"),
          bulletPara("ゲーム・エンタメセクター（4661・6460・7974）も構成比高め"),
          bulletPara("→ 来月以降、セクター分散を意識した銘柄入替を検討材料として提示する"),
          new Paragraph({ spacing: { before: 120, after: 60 } }),

          bodyPara("※ グラフは次回以降のExcelデータ蓄積後に自動生成予定。", false, 18),

          // ========== Appendix ==========
          h1Para("Appendix"),
          h2Para("運用ログ記録ルール"),
          bulletPara("週次ログ：毎週末（金曜日）に株式運用ログ_yyyymm.xlsxを更新する"),
          bulletPara("月次レポート：毎月最終週に本レポートを更新・保存する"),
          bulletPara("ファイル命名：株式運用ログ_yyyymm.xlsx / 株式運用月次レポート_yyyy年m月.docx"),
          bulletPara("フォルダ構造：株売買アドバイス/yyyymm/ 配下に格納する"),
          new Paragraph({ spacing: { before: 100, after: 60 } }),

          h2Para("免責事項"),
          new Paragraph({
            children: [new TextRun({ text: DISCLAIMER, size: 18, color: "808080", font: "Arial" })],
            spacing: { before: 60, after: 60 },
            border: {
              top:    { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" },
            },
          }),
        ],
      },
    ],
  });

  return doc;
}

// ============================================================
// メイン処理
// ============================================================
async function main() {
  const yyyymm = process.argv[2] || (() => {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  })();

  const year  = yyyymm.slice(0, 4);
  const month = parseInt(yyyymm.slice(4, 6), 10);

  const baseDir = path.join(__dirname, "..", "株売買アドバイス");
  const folder  = path.join(baseDir, yyyymm);
  fs.mkdirSync(folder, { recursive: true });

  const savePath = path.join(folder, `株式運用月次レポート_${year}年${month}月.docx`);

  const doc    = buildDocument(yyyymm);
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(savePath, buffer);
  console.log(`Word saved: ${savePath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
