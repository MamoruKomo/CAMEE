# GORDIX CAM

DXFの2D図形から、GORDIX6ポスト形式の彫り込みG-codeを作成するブラウザCAMです。

## 対応内容

- DXF: LINE, LWPOLYLINE, POLYLINE, ARC, CIRCLE, ELLIPSE, SPLINE
- ツールパス: DXF線上のセンターライン加工
- 多段加工: 最終深さと1回の深さから自動分割
- 表示: Three.jsによる2D/3Dプレビュー
- 出力: GORDIX6 Studio V4スタイルの `.gcode`

## GORDIX出力の前提

- mm (`G21`)
- 絶対座標 (`G90`)
- Z0 = 材料上面
- 退避高さ = 2 mm
- 主軸は手動操作
- 1ファイルに1本のビット

## ローカル起動

```bash
npm install
npm run dev
```

## 検証

```bash
npm test
```

実機での本加工前に、ビットを材料から離した状態で動作確認してください。
