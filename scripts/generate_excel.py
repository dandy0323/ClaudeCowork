#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
株式運用ログ Excel生成スクリプト
用途: 毎月の株式運用ログExcelファイルを生成する
使用方法: python3 scripts/generate_excel.py [yyyymm]
例: python3 scripts/generate_excel.py 202603
"""

import os
import sys
import openpyxl
from openpyxl.styles import (
    Font, PatternFill, Alignment, Border, Side, numbers
)
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation
from datetime import date

# ============================================================
# カラー定数
# ============================================================
NAVY       = "1F3864"   # ヘッダー背景
BLUE       = "2E75B6"   # 小計・合計行背景
YELLOW_BG  = "FFF2CC"   # 入力セル背景
WHITE      = "FFFFFF"
BLUE_FONT  = "0070C0"   # ユーザー入力値（青文字）
GREEN_FONT = "375623"   # 他シート参照（緑文字）

# ============================================================
# スタイルヘルパー
# ============================================================
def header_style(bold=True):
    return {
        "font": Font(name="Arial", bold=bold, color=WHITE, size=10),
        "fill": PatternFill("solid", fgColor=NAVY),
        "alignment": Alignment(horizontal="center", vertical="center", wrap_text=True),
        "border": thin_border()
    }

def input_style():
    return {
        "font": Font(name="Arial", color=BLUE_FONT, size=10),
        "fill": PatternFill("solid", fgColor=YELLOW_BG),
        "alignment": Alignment(horizontal="center", vertical="center"),
        "border": thin_border()
    }

def calc_style():
    return {
        "font": Font(name="Arial", color="000000", size=10),
        "fill": PatternFill("solid", fgColor=WHITE),
        "alignment": Alignment(horizontal="center", vertical="center"),
        "border": thin_border()
    }

def ref_style():
    return {
        "font": Font(name="Arial", color=GREEN_FONT, size=10),
        "fill": PatternFill("solid", fgColor=WHITE),
        "alignment": Alignment(horizontal="center", vertical="center"),
        "border": thin_border()
    }

def subtotal_style():
    return {
        "font": Font(name="Arial", bold=True, color=WHITE, size=10),
        "fill": PatternFill("solid", fgColor=BLUE),
        "alignment": Alignment(horizontal="center", vertical="center"),
        "border": thin_border()
    }

def thin_border():
    side = Side(style="thin", color="BFBFBF")
    return Border(left=side, right=side, top=side, bottom=side)

def apply_style(cell, style_dict):
    for k, v in style_dict.items():
        setattr(cell, k, v)

def set_row_style(ws, row, cols, style_fn):
    for col in cols:
        apply_style(ws.cell(row=row, column=col), style_fn())

# ============================================================
# 初期ポートフォリオデータ（2026年3月21日時点）
# ============================================================
PORTFOLIO = [
    # (code, name,         shares, avg_price, acquisition, current_price, value,    pl,       sector)
    ("290A", "Synspective",           100,    1245,  124500, 1367,  136700,  12200,  "宇宙・防衛"),
    ("4661", "オリエンタルランド",   17.88,   2796,   49999, 2724,   48712,  -1287,  "エンタメ・観光"),
    ("6146", "ディスコ",             0.414,  72470,   30000, 69580,  28803,  -1197,  "半導体製造装置"),
    ("6460", "セガサミーHD",         0.751,   2551,    1914, 2553,    1915,      1,  "エンタメ・ゲーム"),
    ("6758", "ソニーグループ",          50,   3260,  163000, 3271,  163550,    550,  "電機・エンタメ"),
    ("6857", "アドバンテスト",        1.89,  26408,   49999, 23980,  45402,  -4597,  "半導体製造装置"),
    ("6954", "ファナック",            7.23,   6913,   49999, 5936,   42933,  -7066,  "産業用ロボット"),
    ("7011", "三菱重工業",           19.59,   5104,   99999, 4848,   94984,  -5015,  "重工・防衛"),
    ("7735", "SCREENホールディングス", 1.33,  22390,   29999, 19895,  26656,  -3343,  "半導体製造装置"),
    ("7974", "任天堂",               11.73,   8522,   99999, 9734,  114222,  14223,  "ゲーム"),
    ("8035", "東京エレクトロン",     0.228,  43777,   10000, 39330,   8984,  -1016,  "半導体製造装置"),
    ("9983", "ファーストリテイリング",0.149,  66737,   10000, 63430,   9504,   -496,  "小売"),
]

# ============================================================
# Sheet 1: 週次ログ
# ============================================================
def build_weekly_log(ws):
    ws.title = "週次ログ"

    headers = [
        "週", "日付", "銘柄コード", "銘柄名",
        "売買区分", "株数", "価格(円)", "金額(自動)",
        "AI推奨理由", "実績評価", "メモ"
    ]
    col_widths = [8, 12, 14, 20, 16, 8, 12, 14, 40, 10, 30]

    # ヘッダー行
    for c, h in enumerate(headers, 1):
        cell = ws.cell(row=1, column=c, value=h)
        apply_style(cell, header_style())

    ws.row_dimensions[1].height = 25

    # データ行（初期：保有継続として記録）
    today = "2026/3/21"
    for i, (code, name, shares, avg_p, acq, cur_p, val, pl, sector) in enumerate(PORTFOLIO):
        r = i + 2
        # 週
        ws.cell(row=r, column=1, value="第1週").font = Font(name="Arial", color=BLUE_FONT, size=10)
        ws.cell(row=r, column=1).fill = PatternFill("solid", fgColor=YELLOW_BG)
        ws.cell(row=r, column=1).alignment = Alignment(horizontal="center")
        ws.cell(row=r, column=1).border = thin_border()
        # 日付
        ws.cell(row=r, column=2, value=today).font = Font(name="Arial", color=BLUE_FONT, size=10)
        ws.cell(row=r, column=2).fill = PatternFill("solid", fgColor=YELLOW_BG)
        ws.cell(row=r, column=2).alignment = Alignment(horizontal="center")
        ws.cell(row=r, column=2).border = thin_border()
        # コード
        ws.cell(row=r, column=3, value=code).font = Font(name="Arial", color=BLUE_FONT, size=10)
        ws.cell(row=r, column=3).fill = PatternFill("solid", fgColor=YELLOW_BG)
        ws.cell(row=r, column=3).alignment = Alignment(horizontal="center")
        ws.cell(row=r, column=3).border = thin_border()
        # 銘柄名
        ws.cell(row=r, column=4, value=name).font = Font(name="Arial", color=BLUE_FONT, size=10)
        ws.cell(row=r, column=4).fill = PatternFill("solid", fgColor=YELLOW_BG)
        ws.cell(row=r, column=4).alignment = Alignment(horizontal="left")
        ws.cell(row=r, column=4).border = thin_border()
        # 売買区分
        ws.cell(row=r, column=5, value="保有継続").font = Font(name="Arial", color=BLUE_FONT, size=10)
        ws.cell(row=r, column=5).fill = PatternFill("solid", fgColor=YELLOW_BG)
        ws.cell(row=r, column=5).alignment = Alignment(horizontal="center")
        ws.cell(row=r, column=5).border = thin_border()
        # 株数
        ws.cell(row=r, column=6, value=shares).font = Font(name="Arial", color=BLUE_FONT, size=10)
        ws.cell(row=r, column=6).fill = PatternFill("solid", fgColor=YELLOW_BG)
        ws.cell(row=r, column=6).alignment = Alignment(horizontal="right")
        ws.cell(row=r, column=6).border = thin_border()
        # 価格
        ws.cell(row=r, column=7, value=cur_p).font = Font(name="Arial", color=BLUE_FONT, size=10)
        ws.cell(row=r, column=7).fill = PatternFill("solid", fgColor=YELLOW_BG)
        ws.cell(row=r, column=7).number_format = "#,##0"
        ws.cell(row=r, column=7).alignment = Alignment(horizontal="right")
        ws.cell(row=r, column=7).border = thin_border()
        # 金額（自動計算: 株数×価格）
        formula_cell = ws.cell(row=r, column=8)
        formula_cell.value = f"=F{r}*G{r}"
        formula_cell.font = Font(name="Arial", color="000000", size=10)
        formula_cell.fill = PatternFill("solid", fgColor=WHITE)
        formula_cell.number_format = "#,##0"
        formula_cell.alignment = Alignment(horizontal="right")
        formula_cell.border = thin_border()
        # AI推奨理由
        ws.cell(row=r, column=9, value="初回記録").font = Font(name="Arial", color=BLUE_FONT, size=10)
        ws.cell(row=r, column=9).fill = PatternFill("solid", fgColor=YELLOW_BG)
        ws.cell(row=r, column=9).border = thin_border()
        # 実績評価
        ws.cell(row=r, column=10, value="△").font = Font(name="Arial", color=BLUE_FONT, size=10)
        ws.cell(row=r, column=10).fill = PatternFill("solid", fgColor=YELLOW_BG)
        ws.cell(row=r, column=10).alignment = Alignment(horizontal="center")
        ws.cell(row=r, column=10).border = thin_border()
        # メモ
        ws.cell(row=r, column=11, value="").font = Font(name="Arial", color=BLUE_FONT, size=10)
        ws.cell(row=r, column=11).fill = PatternFill("solid", fgColor=YELLOW_BG)
        ws.cell(row=r, column=11).border = thin_border()

    # 合計行
    total_row = len(PORTFOLIO) + 2
    ws.cell(row=total_row, column=1, value="合計").font = Font(name="Arial", bold=True, color=WHITE, size=10)
    ws.cell(row=total_row, column=1).fill = PatternFill("solid", fgColor=BLUE)
    ws.cell(row=total_row, column=1).alignment = Alignment(horizontal="center")
    ws.cell(row=total_row, column=1).border = thin_border()
    for c in range(2, 12):
        cell = ws.cell(row=total_row, column=c)
        cell.fill = PatternFill("solid", fgColor=BLUE)
        cell.border = thin_border()
    ws.cell(row=total_row, column=8).value = f"=SUM(H2:H{total_row-1})"
    ws.cell(row=total_row, column=8).font = Font(name="Arial", bold=True, color=WHITE, size=10)
    ws.cell(row=total_row, column=8).number_format = "#,##0"
    ws.cell(row=total_row, column=8).alignment = Alignment(horizontal="right")

    # ドロップダウン：売買区分
    dv_trade = DataValidation(
        type="list",
        formula1='"買い,売り,保有継続,一部売り,一部買い増し"',
        allow_blank=True
    )
    dv_trade.add(f"E2:E{total_row-1}")
    ws.add_data_validation(dv_trade)

    # ドロップダウン：実績評価
    dv_eval = DataValidation(
        type="list",
        formula1='"〇,△,×"',
        allow_blank=True
    )
    dv_eval.add(f"J2:J{total_row-1}")
    ws.add_data_validation(dv_eval)

    # 列幅設定
    for c, w in enumerate(col_widths, 1):
        ws.column_dimensions[get_column_letter(c)].width = w

    # ウィンドウ枠を固定（1行目ヘッダー）
    ws.freeze_panes = "A2"

# ============================================================
# Sheet 2: ポートフォリオ推移
# ============================================================
def build_portfolio_trend(ws):
    ws.title = "ポートフォリオ推移"

    headers = [
        "週", "記録日", "評価総額(円)", "現金残高(円)",
        "現金比率(%)", "損益額(円)", "損益率(%)", "メモ"
    ]
    col_widths = [8, 12, 16, 16, 14, 14, 12, 40]

    for c, h in enumerate(headers, 1):
        cell = ws.cell(row=1, column=c, value=h)
        apply_style(cell, header_style())
    ws.row_dimensions[1].height = 25

    # 初回データ行
    r = 2
    ws.cell(row=r, column=1, value="第1週").font = Font(name="Arial", color=BLUE_FONT, size=10)
    ws.cell(row=r, column=1).fill = PatternFill("solid", fgColor=YELLOW_BG)
    ws.cell(row=r, column=1).alignment = Alignment(horizontal="center")
    ws.cell(row=r, column=1).border = thin_border()

    ws.cell(row=r, column=2, value="2026/3/21").font = Font(name="Arial", color=BLUE_FONT, size=10)
    ws.cell(row=r, column=2).fill = PatternFill("solid", fgColor=YELLOW_BG)
    ws.cell(row=r, column=2).alignment = Alignment(horizontal="center")
    ws.cell(row=r, column=2).border = thin_border()

    # 評価総額
    ws.cell(row=r, column=3, value=712470).font = Font(name="Arial", color=BLUE_FONT, size=10)
    ws.cell(row=r, column=3).fill = PatternFill("solid", fgColor=YELLOW_BG)
    ws.cell(row=r, column=3).number_format = "#,##0"
    ws.cell(row=r, column=3).alignment = Alignment(horizontal="right")
    ws.cell(row=r, column=3).border = thin_border()

    # 現金残高（ユーザー入力）
    ws.cell(row=r, column=4, value=0).font = Font(name="Arial", color=BLUE_FONT, size=10)
    ws.cell(row=r, column=4).fill = PatternFill("solid", fgColor=YELLOW_BG)
    ws.cell(row=r, column=4).number_format = "#,##0"
    ws.cell(row=r, column=4).alignment = Alignment(horizontal="right")
    ws.cell(row=r, column=4).border = thin_border()

    # 現金比率 = 現金残高 ÷ (評価総額 + 現金残高)　※#DIV/0!対策
    ws.cell(row=r, column=5).value = f"=IFERROR(D{r}/(C{r}+D{r}),0)"
    ws.cell(row=r, column=5).font = Font(name="Arial", color="000000", size=10)
    ws.cell(row=r, column=5).fill = PatternFill("solid", fgColor=WHITE)
    ws.cell(row=r, column=5).number_format = "0.00%"
    ws.cell(row=r, column=5).alignment = Alignment(horizontal="center")
    ws.cell(row=r, column=5).border = thin_border()

    # 損益額
    ws.cell(row=r, column=6, value=-4743).font = Font(name="Arial", color=BLUE_FONT, size=10)
    ws.cell(row=r, column=6).fill = PatternFill("solid", fgColor=YELLOW_BG)
    ws.cell(row=r, column=6).number_format = "#,##0;-#,##0"
    ws.cell(row=r, column=6).alignment = Alignment(horizontal="right")
    ws.cell(row=r, column=6).border = thin_border()

    # 損益率 = 損益額 ÷ (評価総額 - 損益額)　※#DIV/0!対策
    ws.cell(row=r, column=7).value = f"=IFERROR(F{r}/(C{r}-F{r}),0)"
    ws.cell(row=r, column=7).font = Font(name="Arial", color="000000", size=10)
    ws.cell(row=r, column=7).fill = PatternFill("solid", fgColor=WHITE)
    ws.cell(row=r, column=7).number_format = "0.00%"
    ws.cell(row=r, column=7).alignment = Alignment(horizontal="center")
    ws.cell(row=r, column=7).border = thin_border()

    # メモ
    ws.cell(row=r, column=8, value="初回記録（2026年3月21日）").font = Font(name="Arial", color=BLUE_FONT, size=10)
    ws.cell(row=r, column=8).fill = PatternFill("solid", fgColor=YELLOW_BG)
    ws.cell(row=r, column=8).border = thin_border()

    # 空行を4週分用意
    for r2 in range(3, 6):
        for c in range(1, 9):
            cell = ws.cell(row=r2, column=c)
            cell.fill = PatternFill("solid", fgColor=YELLOW_BG) if c in [1,2,3,4,6,8] else PatternFill("solid", fgColor=WHITE)
            cell.border = thin_border()
            if c == 5:
                cell.value = f"=IFERROR(D{r2}/(C{r2}+D{r2}),0)"
                cell.number_format = "0.00%"
                cell.font = Font(name="Arial", color="000000", size=10)
                cell.alignment = Alignment(horizontal="center")
            elif c == 7:
                cell.value = f"=IFERROR(F{r2}/(C{r2}-F{r2}),0)"
                cell.number_format = "0.00%"
                cell.font = Font(name="Arial", color="000000", size=10)
                cell.alignment = Alignment(horizontal="center")
            elif c in [3, 4, 6]:
                cell.number_format = "#,##0"
                cell.font = Font(name="Arial", color=BLUE_FONT, size=10)
                cell.alignment = Alignment(horizontal="right")
            else:
                cell.font = Font(name="Arial", color=BLUE_FONT, size=10)
                cell.alignment = Alignment(horizontal="center")

    for c, w in enumerate(col_widths, 1):
        ws.column_dimensions[get_column_letter(c)].width = w

    ws.freeze_panes = "A2"

# ============================================================
# Sheet 3: AIアドバイス評価
# ============================================================
def build_ai_advice(ws):
    ws.title = "AIアドバイス評価"

    headers = [
        "週", "推奨銘柄", "推奨方向", "実際の騰落率(%)",
        "評価(〇△×)", "失敗原因", "翌週への改善"
    ]
    col_widths = [8, 20, 16, 18, 12, 40, 40]

    for c, h in enumerate(headers, 1):
        cell = ws.cell(row=1, column=c, value=h)
        apply_style(cell, header_style())
    ws.row_dimensions[1].height = 25

    # 初回データ（全銘柄保有継続）
    for i, (code, name, *_) in enumerate(PORTFOLIO):
        r = i + 2
        ws.cell(row=r, column=1, value="第1週").font = Font(name="Arial", color=BLUE_FONT, size=10)
        ws.cell(row=r, column=1).fill = PatternFill("solid", fgColor=YELLOW_BG)
        ws.cell(row=r, column=1).alignment = Alignment(horizontal="center")
        ws.cell(row=r, column=1).border = thin_border()

        ws.cell(row=r, column=2, value=f"{code} {name}").font = Font(name="Arial", color=BLUE_FONT, size=10)
        ws.cell(row=r, column=2).fill = PatternFill("solid", fgColor=YELLOW_BG)
        ws.cell(row=r, column=2).border = thin_border()

        ws.cell(row=r, column=3, value="保有継続").font = Font(name="Arial", color=BLUE_FONT, size=10)
        ws.cell(row=r, column=3).fill = PatternFill("solid", fgColor=YELLOW_BG)
        ws.cell(row=r, column=3).alignment = Alignment(horizontal="center")
        ws.cell(row=r, column=3).border = thin_border()

        for c in [4, 5, 6, 7]:
            cell = ws.cell(row=r, column=c)
            cell.fill = PatternFill("solid", fgColor=YELLOW_BG)
            cell.font = Font(name="Arial", color=BLUE_FONT, size=10)
            cell.border = thin_border()
            if c == 4:
                cell.alignment = Alignment(horizontal="center")
                cell.number_format = "0.00%"
            elif c == 5:
                cell.alignment = Alignment(horizontal="center")

    # ドロップダウン：推奨方向
    dv_dir = DataValidation(
        type="list",
        formula1='"買い,売り,保有継続,一部売り,一部買い増し,様子見"',
        allow_blank=True
    )
    dv_dir.add(f"C2:C{len(PORTFOLIO)+10}")
    ws.add_data_validation(dv_dir)

    # ドロップダウン：評価
    dv_eval = DataValidation(
        type="list",
        formula1='"〇,△,×"',
        allow_blank=True
    )
    dv_eval.add(f"E2:E{len(PORTFOLIO)+10}")
    ws.add_data_validation(dv_eval)

    for c, w in enumerate(col_widths, 1):
        ws.column_dimensions[get_column_letter(c)].width = w

    ws.freeze_panes = "A2"

# ============================================================
# Sheet 4: ポートフォリオ現状（参照用）
# ============================================================
def build_current_portfolio(ws):
    ws.title = "現在ポートフォリオ"

    headers = [
        "銘柄コード", "銘柄名", "保有株数", "平均取得価額(円)",
        "取得総額(円)", "現在値(円)", "評価額(円)", "損益(円)",
        "損益率(%)", "セクター"
    ]
    col_widths = [14, 22, 10, 16, 14, 12, 12, 12, 10, 20]

    for c, h in enumerate(headers, 1):
        cell = ws.cell(row=1, column=c, value=h)
        apply_style(cell, header_style())
    ws.row_dimensions[1].height = 25

    for i, (code, name, shares, avg_p, acq, cur_p, val, pl, sector) in enumerate(PORTFOLIO):
        r = i + 2
        data = [code, name, shares, avg_p, acq, cur_p, val]
        for c, v in enumerate(data, 1):
            cell = ws.cell(row=r, column=c, value=v)
            cell.fill = PatternFill("solid", fgColor=YELLOW_BG)
            cell.font = Font(name="Arial", color=BLUE_FONT, size=10)
            cell.border = thin_border()
            if c in [3,4,5,6,7]:
                cell.number_format = "#,##0.###" if isinstance(v, float) and v < 100 else "#,##0"
                cell.alignment = Alignment(horizontal="right")
            else:
                cell.alignment = Alignment(horizontal="center" if c == 1 else "left")

        # 損益（自動計算: 評価額 - 取得総額）
        pl_cell = ws.cell(row=r, column=8)
        pl_cell.value = f"=G{r}-E{r}"
        pl_cell.font = Font(name="Arial", color="000000", size=10)
        pl_cell.fill = PatternFill("solid", fgColor=WHITE)
        pl_cell.number_format = "#,##0;-#,##0"
        pl_cell.alignment = Alignment(horizontal="right")
        pl_cell.border = thin_border()

        # 損益率（自動計算: 損益額 ÷ 取得総額）
        plr_cell = ws.cell(row=r, column=9)
        plr_cell.value = f"=IFERROR(H{r}/E{r},0)"
        plr_cell.font = Font(name="Arial", color="000000", size=10)
        plr_cell.fill = PatternFill("solid", fgColor=WHITE)
        plr_cell.number_format = "0.00%"
        plr_cell.alignment = Alignment(horizontal="center")
        plr_cell.border = thin_border()

        # セクター
        sec_cell = ws.cell(row=r, column=10, value=sector)
        sec_cell.fill = PatternFill("solid", fgColor=YELLOW_BG)
        sec_cell.font = Font(name="Arial", color=BLUE_FONT, size=10)
        sec_cell.alignment = Alignment(horizontal="center")
        sec_cell.border = thin_border()

    # 合計行
    total_row = len(PORTFOLIO) + 2
    for c in range(1, 11):
        cell = ws.cell(row=total_row, column=c)
        cell.fill = PatternFill("solid", fgColor=BLUE)
        cell.font = Font(name="Arial", bold=True, color=WHITE, size=10)
        cell.border = thin_border()

    ws.cell(row=total_row, column=1, value="合計").alignment = Alignment(horizontal="center")
    ws.cell(row=total_row, column=5).value = f"=SUM(E2:E{total_row-1})"
    ws.cell(row=total_row, column=5).number_format = "#,##0"
    ws.cell(row=total_row, column=5).alignment = Alignment(horizontal="right")
    ws.cell(row=total_row, column=7).value = f"=SUM(G2:G{total_row-1})"
    ws.cell(row=total_row, column=7).number_format = "#,##0"
    ws.cell(row=total_row, column=7).alignment = Alignment(horizontal="right")
    ws.cell(row=total_row, column=8).value = f"=SUM(H2:H{total_row-1})"
    ws.cell(row=total_row, column=8).number_format = "#,##0;-#,##0"
    ws.cell(row=total_row, column=8).alignment = Alignment(horizontal="right")
    ws.cell(row=total_row, column=9).value = f"=IFERROR(H{total_row}/E{total_row},0)"
    ws.cell(row=total_row, column=9).number_format = "0.00%"
    ws.cell(row=total_row, column=9).alignment = Alignment(horizontal="center")

    for c, w in enumerate(col_widths, 1):
        ws.column_dimensions[get_column_letter(c)].width = w

    ws.freeze_panes = "A2"

# ============================================================
# メイン処理
# ============================================================
def main():
    # 対象月の決定
    if len(sys.argv) > 1:
        yyyymm = sys.argv[1]
    else:
        today = date.today()
        yyyymm = today.strftime("%Y%m")

    # 出力先
    base_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "株売買アドバイス")
    folder = os.path.join(base_dir, yyyymm)
    os.makedirs(folder, exist_ok=True)
    save_path = os.path.join(folder, f"株式運用ログ_{yyyymm}.xlsx")

    wb = openpyxl.Workbook()
    wb.remove(wb.active)  # デフォルトシート削除

    build_weekly_log(wb.create_sheet())
    build_portfolio_trend(wb.create_sheet())
    build_ai_advice(wb.create_sheet())
    build_current_portfolio(wb.create_sheet())

    wb.save(save_path)
    print(f"Excel saved: {save_path}")

if __name__ == "__main__":
    main()
