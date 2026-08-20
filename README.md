# CutPath

CutPathは、CNC加工用の2D図形、Bezierパス、stroke文字をブラウザで作成・編集し、そのままセンターラインCAM、3D確認、GORDIX6向けG-code出力まで進められるベクター/CAM統合ツールです。`Isshin-dev/CAMEE` を基にしたPhase 1A + 1B + 2A実装です。

## Phase 1でできること

- mm / X-right / Y-upの`VectorDocument`を編集データの正として保存
- Selection、Direct Selection、Pen、Line、Rectangle、Ellipse
- open/closed path、Cubic Bézier anchor/handle、corner/smooth/symmetric
- 複数選択、範囲選択、移動、削除、copy/paste、undo/redo、数値編集
- 8方向resize、rotation handle、Shift比率固定・15°回転、Alt drag複製、Cmd/Ctrl+D
- segment double clickによるde Casteljau分割、handle長さ/角度の数値編集
- Grid/Anchor/Endpoint/Midpoint/Object Center/Material/Origin/Horizontal/Vertical snap
- cursor中心zoom、Space/middle pan、Fit All/Selection、H Hand、Z Zoom
- DXF → VectorDocument（ARC/CIRCLE/ELLIPSEをcubic化）
- SVG import（path/line/polyline/polygon/rect/circle/ellipse、M/L/H/V/C/S/Q/T/A/Z、nested transform）
- Path Listのドラッグ並べ替え
- VectorDocumentからのSVG export、CutPath JSON import/export
- Project Version 2、Version 1 migration、IndexedDB auto save/reload restore
- VectorPath → adaptive CAM Adapter → ToolPath → Centerline CAM
- Three.js 3D Preview、多段加工、closed path ramp
- stale operation検出、安全警告、安全Zを先行するG-code

## Phase 2Aで追加したこと

- Text Tool（T）、再編集可能な複数行`VectorText`、位置・サイズ・字間・行間・整列・回転
- 決定的な内蔵CNC stroke fontとfont checksum / outline version
- 文字のcopy/paste、duplicate、move、delete、undo/redo、保存/reload、アウトライン化
- 文字stroke → VectorPath → Centerline CAM → 3D → G-code
- Path/文字の表示線幅。CAMの工具径とは非連動
- 参考spindle RPMとflute countの加工記録、安全検証
- 未対応glyphとfont識別不一致のCAM/G-code hard block

## 開発

Node.js 22.13以上を使用します。

```bash
npm ci
npm run dev
```

## 検証

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run check
```

`npm run test` はVitest unit/golden testsです。`npm run check` はlint → typecheck → unit test → production buildを順に実行します。

## CNC Safety

G-code出力前に、非有限値、空／ゼロ長path、加工条件、open path ramp、材料外、材料厚超過、貫通許可、stale revisionを検査します。最初のXY Rapidより前に退避Zへ移動します。

実機の本加工前に、必ずビットを材料から離した状態でDry Runしてください。

設計、scope、upstream、実検証結果、Phase 2の実装状況は [`docs/`](./docs/) を参照してください。参照upstreamにLICENSEファイルはないため、ライセンスを推測して追加していません。
