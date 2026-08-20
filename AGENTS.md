# CutPath 開発ガイド

## 概要

CutPath は、mm 単位の2Dベクターパスをブラウザで作図・編集し、既存 CAMEE のセンターライン CAM、3Dプレビュー、GORDIX6向け G-code 出力へ接続するアプリです。加工精度、データ整合性、CNC安全性を一般的なドローソフトとの完全互換性より優先します。UI言語は日本語です。

## アーキテクチャ

- `VectorDocument` が編集データの唯一の正です。
- 永続座標は mm、X右向き正、Y上向き正です。Y反転はSVG表示時だけです。
- 編集GeometryはLine segmentとCubic Bézierへ正規化します。
- CAM計算時だけ `VectorPath -> CAM Adapter -> ToolPath` と変換します。
- `CamOperation.sourceRevision` と `VectorDocument.revision` が異なるOperationはstaleです。
- Project Version 2を保存し、Version 1は純粋なmigrationで読み込みます。
- `VectorText`は編集可能なsourceとして保存し、決定的なLine/Cubic `VectorPath`だけを生成します。
- 表示線幅はstyle metadataであり、工具径や加工幅へ流用しません。

## 絶対禁止事項

- `ToolPath`、SVG文字列、DOM、CSS transform、レンダリング結果を編集データの正にしない。
- Bézierを大量の点列として永続化しない。
- staleなCAM OperationからG-codeを書き出さない。
- NaN、Infinity、空／ゼロ長パス、不正な加工条件をCAMへ渡さない。
- 未実装のprofile、pocket、v-carve等を動作可能に見せない。
- 元リポジトリにないライセンスを推測して追加しない。

## コマンド

```bash
npm ci
npm run dev
npm run lint
npm run typecheck
npm run test
npm run build
npm run check
```

## CNC Safety

- 最初のXY Rapidより前に安全Zへ退避する。
- final depth、step down、feed、plunge、rapid、bit diameter、参考RPM、刃数は有限かつ正値にする。
- rampは閉路だけに許可する。
- 材料外、材料厚超過、貫通加工を出力前に検査する。
- 貫通加工はユーザーの明示許可が必要。
- 書き出し時に警告一覧とDry Run案内を表示する。

## 完了条件

Phase 1Aの作図、Bezier編集、保存／復元、DXF/SVG/JSON入出力、Centerline CAM、3D Preview、安全なG-code出力が一続きで動くこと。Phase 1Bのresize/rotate/duplicate/de Casteljau UI、高度Snap、path reorder、SVG高度Import、H/Z/Fit SelectionがVectorDocumentを正として動くこと。Phase 2Aの再編集可能な文字、表示線幅、Centerline CAM統合、font/glyph safetyが同じデータフローで動くこと。`npm run check` が成功し、ドキュメントと実装が一致すること。
