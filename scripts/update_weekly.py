#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
週次データ更新スクリプト
使用方法: python3 scripts/update_weekly.py [yyyymm]
"""
import os, sys
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

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
# 2026/04/14 ポートフォリオデータ
# ============================================================
WEEK_LABEL   = "第1週(4月)"
RECORD_DATE  = "2026/4/14"
TOTAL_VALUE  = 716023
TOTAL_PL     = -1470
CASH         = 0

PORTFOLIO_0414 = [
    ("290A",  "Synspective",            100,    1368,  "保有継続", "△"),
    ("4661",  "オリエンタルランド",   17.88,   2608,  "保有継続", "△"),
    ("6146",  "ディスコ",             0.414,  71062,  "保有継続", "△"),
    ("6460",  "セガサミーHD",         0.751,   2551,  "保有継続", "△"),  # 前回値流用
    ("6758",  "ソニーグループ",          50,   3302,  "保有継続", "○"),
    ("6857",  "アドバンテスト",        1.89,  26808,  "保有継続", "○"),
    ("6954",  "ファナック",            7.23,   6269,  "保有継続", "△"),
    ("7011",  "三菱重工業",           19.59,   4774,  "保有継続", "△"),
    ("7735",  "SCREENホールディングス", 1.33,  22435,  "保有継続", "○"),
    ("7974",  "任天堂",               11.73,   8318,  "保有継続", "×"),
    ("8035",  "東京エレクトロン",     0.228,  43632,  "保有継続", "△"),
    ("9983",  "ファーストリテイリング",0.149,  75027,  "保有継続", "○"),
]

AI_ADVICE = [
    ("290A",  "Synspective",            "保有継続", "宇宙・防衛テーマ継続。中東紛争で注目度維持"),
    ("4661",  "オリエンタルランド",    "保有継続", "インバウンド底堅いが円高リスクに注意"),
    ("6146",  "ディスコ",              "保有継続", "半導体需要回復で含み損縮小傾向"),
    ("6758",  "ソニーグループ",         "保有継続", "エンタメ・半導体部門安定。含み益維持"),
    ("6857",  "アドバンテスト",         "保有継続", "AI向けテスタ需要過去最高。決算好調で注目"),
    ("6954",  "ファナック",             "様子見",   "中国需要回復待ち。原油高は製造業に逆風"),
    ("7011",  "三菱重工業",             "様子見",   "停戦協議進展で防衛プレミアム剥落リスク"),
    ("7735",  "SCREENホールディングス","保有継続", "半導体装置需要回復。含み損ほぼ解消"),
    ("7974",  "任天堂",                 "様子見",   "Switch2生産削減報道で下落継続。反転確認まで慎重"),
    ("8035",  "東京エレクトロン",       "保有継続", "AI投資拡大で中長期は期待維持"),
    ("9983",  "ファーストリテイリング", "保有継続", "国内消費強く最高パフォーマンス。利確タイミング検討"),
]

def update_weekly_log(ws):
    # 既存の最終行を探す
    last_row = ws.max_row
    start_row = last_row + 1

    for code, name, shares, price, trade, eval_ in PORTFOLIO_0414:
        r = start_row
        start_row += 1
        ic(ws.cell(r, 1), WEEK_LABEL)
        ic(ws.cell(r, 2), RECORD_DATE)
        ic(ws.cell(r, 3), code)
        ic(ws.cell(r, 4), name, align="left")
        ic(ws.cell(r, 5), trade)
        ic(ws.cell(r, 6), shares, fmt="#,##0.###", align="right")
        ic(ws.cell(r, 7), price, fmt="#,##0", align="right")
        fc(ws.cell(r, 8), f"=F{r}*G{r}", fmt="#,##0")
        ic(ws.cell(r, 9), "web検索による週次分析（4/14）", align="left")
        ic(ws.cell(r, 10), eval_)
        ic(ws.cell(r, 11), "中東情勢・イラン停戦協議が最大変数", align="left")

    # 合計行更新
    total_row = start_row
    for c in range(1, 12):
        cell = ws.cell(total_row, c)
        cell.fill = PatternFill("solid", fgColor=BLUE)
        cell.font = Font(name="Arial", bold=True, color=WHITE, size=10)
        cell.border = thin_border()
    ws.cell(total_row, 1).value = "合計"
    ws.cell(total_row, 1).alignment = Alignment(horizontal="center")
    first_data = last_row + 1
    ws.cell(total_row, 8).value = f"=SUM(H{first_data}:H{total_row-1})"
    ws.cell(total_row, 8).number_format = "#,##0"
    ws.cell(total_row, 8).alignment = Alignment(horizontal="right")

def update_portfolio_trend(ws):
    r = ws.max_row + 1
    ic(ws.cell(r, 1), WEEK_LABEL)
    ic(ws.cell(r, 2), RECORD_DATE)
    ic(ws.cell(r, 3), TOTAL_VALUE, fmt="#,##0", align="right")
    ic(ws.cell(r, 4), CASH, fmt="#,##0", align="right")
    fc(ws.cell(r, 5), f"=IFERROR(D{r}/(C{r}+D{r}),0)", fmt="0.00%", align="center")
    ic(ws.cell(r, 6), TOTAL_PL, fmt="#,##0;-#,##0", align="right")
    fc(ws.cell(r, 7), f"=IFERROR(F{r}/(C{r}-F{r}),0)", fmt="0.00%", align="center")
    ic(ws.cell(r, 8), "中東停戦協議停滞で本日▲700円超の場面。先週比+32,692円回復", align="left")

def update_ai_advice(ws):
    r = ws.max_row + 1
    for code, name, direction, reason in AI_ADVICE:
        ic(ws.cell(r, 1), WEEK_LABEL)
        ic(ws.cell(r, 2), f"{code} {name}")
        ic(ws.cell(r, 3), direction)
        ic(ws.cell(r, 4), "")
        ic(ws.cell(r, 5), "△")
        ic(ws.cell(r, 6), reason, align="left")
        ic(ws.cell(r, 7), "来週の停戦協議結果・決算ガイダンスを確認", align="left")
        r += 1

def main():
    yyyymm = sys.argv[1] if len(sys.argv) > 1 else "202604"
    base = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "株売買アドバイス")
    path = os.path.join(base, yyyymm, f"株式運用ログ_{yyyymm}.xlsx")

    wb = openpyxl.load_workbook(path)
    update_weekly_log(wb["週次ログ"])
    update_portfolio_trend(wb["ポートフォリオ推移"])
    update_ai_advice(wb["AIアドバイス評価"])

    # 現在ポートフォリオシートも更新
    ws = wb["現在ポートフォリオ"]
    for i, (code, name, shares, price, _, _) in enumerate(PORTFOLIO_0414):
        r = i + 2
        ws.cell(r, 6).value = price
        ws.cell(r, 6).number_format = "#,##0"

    wb.save(path)
    print(f"Updated: {path}")

if __name__ == "__main__":
    main()
