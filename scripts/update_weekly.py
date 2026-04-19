#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
週次データ更新スクリプト
使用方法: python3 scripts/update_weekly.py [yyyymm]
"""
import os, sys
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

NAVY      = "1F3864"
BLUE      = "2E75B6"
YELLOW_BG = "FFF2CC"
WHITE     = "FFFFFF"
BLUE_FONT = "0070C0"

def thin_border():
    s = Side(style="thin", color="BFBFBF")
    return Border(left=s, right=s, top=s, bottom=s)

def ic(cell, value, color=BLUE_FONT, bg=YELLOW_BG, fmt=None, align="center"):
    cell.value = value
    cell.font = Font(name="Arial", color=color, size=10)
    cell.fill = PatternFill("solid", fgColor=bg)
    cell.alignment = Alignment(horizontal=align, vertical="center")
    cell.border = thin_border()
    if fmt: cell.number_format = fmt

def fc(cell, formula, fmt=None, align="right"):
    cell.value = formula
    cell.font = Font(name="Arial", color="000000", size=10)
    cell.fill = PatternFill("solid", fgColor=WHITE)
    cell.alignment = Alignment(horizontal=align, vertical="center")
    cell.border = thin_border()
    if fmt: cell.number_format = fmt

# ============================================================
# 週次エントリー定義（追加する週のデータをここに記載）
# ============================================================

ENTRIES = [
    # --- 第1週(4月) 2026/04/14 ---
    {
        "week": "第1週(4月)",
        "date": "2026/4/14",
        "total_value": 716023,
        "total_pl": -1470,
        "cash": 0,
        "trend_memo": "中東停戦協議停滞で本日▲700円超の場面。先週比+32,692円回復",
        "portfolio": [
            ("290A",  "Synspective",             100,    1368, "保有継続", "△", "宇宙・防衛テーマ継続。中東紛争で注目度維持",     "来週の停戦協議結果・決算ガイダンスを確認"),
            ("4661",  "オリエンタルランド",    17.88,   2608, "保有継続", "△", "インバウンド底堅いが円高リスクに注意",          "来週の停戦協議結果・決算ガイダンスを確認"),
            ("6146",  "ディスコ",              0.414,  71062, "保有継続", "△", "半導体需要回復で含み損縮小傾向",               "来週の停戦協議結果・決算ガイダンスを確認"),
            ("6460",  "セガサミーHD",          0.751,   2551, "保有継続", "△", "ポジション微小。動向監視",                    "来週の停戦協議結果・決算ガイダンスを確認"),
            ("6758",  "ソニーグループ",            50,   3302, "保有継続", "○", "エンタメ・半導体部門安定。含み益維持",          "来週の停戦協議結果・決算ガイダンスを確認"),
            ("6857",  "アドバンテスト",         1.89,  26808, "保有継続", "○", "AI向けテスタ需要過去最高。決算好調で注目",      "来週の停戦協議結果・決算ガイダンスを確認"),
            ("6954",  "ファナック",             7.23,   6269, "様子見",   "△", "中国需要回復待ち。原油高は製造業に逆風",        "来週の停戦協議結果・決算ガイダンスを確認"),
            ("7011",  "三菱重工業",            19.59,   4774, "様子見",   "△", "停戦協議進展で防衛プレミアム剥落リスク",        "来週の停戦協議結果・決算ガイダンスを確認"),
            ("7735",  "SCREENホールディングス", 1.33,  22435, "保有継続", "○", "半導体装置需要回復。含み損ほぼ解消",            "来週の停戦協議結果・決算ガイダンスを確認"),
            ("7974",  "任天堂",                11.73,   8318, "様子見",   "×", "Switch2生産削減で下落継続。反転確認まで慎重",   "Switch2実売データ・次回決算ガイダンスを確認"),
            ("8035",  "東京エレクトロン",      0.228,  43632, "保有継続", "△", "AI投資拡大で中長期は期待維持",                "来週の停戦協議結果・決算ガイダンスを確認"),
            ("9983",  "ファーストリテイリング", 0.149,  75027, "保有継続", "○", "国内消費強く最高パフォーマンス。利確タイミング検討","来週の停戦協議結果・決算ガイダンスを確認"),
        ],
    },
    # --- 第2週(4月) 2026/04/19 ---
    {
        "week": "第2週(4月)",
        "date": "2026/4/19",
        "total_value": 717202,
        "total_pl": -291,
        "cash": 0,
        "trend_memo": "日経平均4/16に史上最高値59,518円更新。週間+1,552円。取得原価まで291円に迫る",
        "portfolio": [
            ("290A",  "Synspective",             100,    1363, "保有継続", "△", "宇宙・防衛テーマ継続",                        "停戦協議・決算ガイダンス確認"),
            ("4661",  "オリエンタルランド",    17.88,   2635, "保有継続", "△", "インバウンド底堅い",                           "停戦協議・決算ガイダンス確認"),
            ("6146",  "ディスコ",              0.414,  72894, "保有継続", "○", "含み益転換！半導体需要回復",                   "決算ガイダンス確認"),
            ("6460",  "セガサミーHD",          0.751,   2551, "保有継続", "△", "ポジション微小",                              "動向監視"),
            ("6758",  "ソニーグループ",            50,   3395, "保有継続", "○", "AI関連株調整でゲーム・IP株に見直し買い流入",    "決算ガイダンス確認"),
            ("6857",  "アドバンテスト",         1.89,  27921, "保有継続", "○", "AI需要継続。+5.53%で好調維持",                 "決算ガイダンス確認"),
            ("6954",  "ファナック",             7.23,   6230, "様子見",   "△", "中国需要回復待ち",                            "中国景況感指標確認"),
            ("7011",  "三菱重工業",            19.59,   4371, "様子見",   "×", "停戦で防衛プレミアム剥落。-14.36%まで悪化",    "4,300円割れなら損切り検討"),
            ("7735",  "SCREENホールディングス", 1.33,  21175, "保有継続", "△", "半導体装置、含み損再拡大。様子見",              "半導体装置受注動向確認"),
            ("7974",  "任天堂",                11.73,   8619, "保有継続", "○", "含み益転換！ゲーム株見直し買い",               "Switch2実売継続確認"),
            ("8035",  "東京エレクトロン",      0.228,  44092, "保有継続", "△", "微小含み益。AI投資継続期待",                   "決算ガイダンス確認"),
            ("9983",  "ファーストリテイリング", 0.149,  74463, "保有継続", "○", "取得比+10.95%。利確タイミング意識",            "次回決算前に利確検討"),
        ],
    },
]

def update_weekly_log(ws, entry):
    last_row = ws.max_row
    r = last_row + 1
    for code, name, shares, price, trade, eval_, reason, improve in entry["portfolio"]:
        ic(ws.cell(r, 1), entry["week"])
        ic(ws.cell(r, 2), entry["date"])
        ic(ws.cell(r, 3), code)
        ic(ws.cell(r, 4), name, align="left")
        ic(ws.cell(r, 5), trade)
        ic(ws.cell(r, 6), shares, fmt="#,##0.###", align="right")
        ic(ws.cell(r, 7), price, fmt="#,##0", align="right")
        fc(ws.cell(r, 8), f"=F{r}*G{r}", fmt="#,##0")
        ic(ws.cell(r, 9), reason, align="left")
        ic(ws.cell(r, 10), eval_)
        ic(ws.cell(r, 11), improve, align="left")
        r += 1

def update_portfolio_trend(ws, entry):
    r = ws.max_row + 1
    ic(ws.cell(r, 1), entry["week"])
    ic(ws.cell(r, 2), entry["date"])
    ic(ws.cell(r, 3), entry["total_value"], fmt="#,##0", align="right")
    ic(ws.cell(r, 4), entry["cash"], fmt="#,##0", align="right")
    fc(ws.cell(r, 5), f"=IFERROR(D{r}/(C{r}+D{r}),0)", fmt="0.00%", align="center")
    ic(ws.cell(r, 6), entry["total_pl"], fmt="#,##0;-#,##0", align="right")
    fc(ws.cell(r, 7), f"=IFERROR(F{r}/(C{r}-F{r}),0)", fmt="0.00%", align="center")
    ic(ws.cell(r, 8), entry["trend_memo"], align="left")

def update_ai_advice(ws, entry):
    r = ws.max_row + 1
    for code, name, direction, eval_, reason, improve in [
        (p[0], p[1], p[4], p[5], p[6], p[7]) for p in entry["portfolio"]
    ]:
        ic(ws.cell(r, 1), entry["week"])
        ic(ws.cell(r, 2), f"{code} {name}")
        ic(ws.cell(r, 3), direction)
        ic(ws.cell(r, 4), "")
        ic(ws.cell(r, 5), eval_)
        ic(ws.cell(r, 6), reason, align="left")
        ic(ws.cell(r, 7), improve, align="left")
        r += 1

def main():
    yyyymm = sys.argv[1] if len(sys.argv) > 1 else "202604"
    week_index = int(sys.argv[2]) if len(sys.argv) > 2 else len(ENTRIES) - 1

    base = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "株売買アドバイス")
    path = os.path.join(base, yyyymm, f"株式運用ログ_{yyyymm}.xlsx")

    wb = openpyxl.load_workbook(path)
    entry = ENTRIES[week_index]

    update_weekly_log(wb["週次ログ"], entry)
    update_portfolio_trend(wb["ポートフォリオ推移"], entry)
    update_ai_advice(wb["AIアドバイス評価"], entry)

    # 現在ポートフォリオ更新
    ws = wb["現在ポートフォリオ"]
    for i, row in enumerate(entry["portfolio"]):
        ws.cell(i + 2, 6).value = row[3]
        ws.cell(i + 2, 6).number_format = "#,##0"

    wb.save(path)
    print(f"Updated [{entry['week']} {entry['date']}]: {path}")

if __name__ == "__main__":
    main()
