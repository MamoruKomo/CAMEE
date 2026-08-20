# CutPath

CutPathは、CNC加工用の2D図形やBezierパスをブラウザで作成・編集し、そのままセンターラインCAM、3D確認、GORDIX6向けG-code出力まで進められるベクター/CAM統合ツールです。`Isshin-dev/CAMEE` を基にしたPhase 1A実装です。

## Phase 1Aでできること

- mm / X-right / Y-upの`VectorDocument`を編集データの正として保存
- Selection、Direct Selection、Pen、Line、Rectangle、Ellipse
- open/closed path、Cubic Bézier anchor/handle、corner/smooth/symmetric
- 複数選択、範囲選択、移動、削除、copy/paste、undo/redo、数値編集
- Grid/Anchor/Endpoint/Material/Origin/Horizontal/Vertical snap
- cursor中心zoom、Space/middle pan、Fit All
- DXF → VectorDocument（ARC/CIRCLE/ELLIPSEをcubic化）
- SVG import（path/line/polyline/polygon/rect/circle/ellipse、M/L/H/V/C/Z）
- VectorDocumentからのSVG export、CutPath JSON import/export
- Project Version 2、Version 1 migration、IndexedDB auto save/reload restore
- VectorPath → adaptive CAM Adapter → ToolPath → Centerline CAM
- Three.js 3D Preview、多段加工、closed path ramp
- stale operation検出、安全警告、安全Zを先行するG-code

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

設計、scope、upstream、実検証結果は [`docs/`](./docs/) を参照してください。参照upstreamにLICENSEファイルはないため、ライセンスを推測して追加していません。
