# CutPath MVP Scope

## Phase 1A

対象は新規Project、300×200×18mm材料、Selection/Direct Selection/Pen/Line/Rectangle/Ellipse、Bezier anchor/handle編集、multi-select/move/delete/copy/paste、undo/redo、grid/anchor/material/origin/horizontal/vertical snap、数値properties、path list、DXF/SVG/CutPath JSON入出力、SVG出力、IndexedDB保存復元、Version 1 migration、centerline CAM、3D preview、安全なG-codeです。

主なshortcut:

| 操作 | Shortcut |
| --- | --- |
| 選択 | V |
| ダイレクト選択 | A |
| Pen | P |
| Line | L |
| Rectangle | R |
| Ellipse | E |
| 全選択 | Cmd/Ctrl+A |
| Copy / Paste | Cmd/Ctrl+C / V |
| Undo / Redo | Cmd/Ctrl+Z / Shift+Cmd/Ctrl+Z |
| 削除 | Delete / Backspace |
| 1mm移動 | Arrow |
| 10mm移動 | Shift+Arrow |
| Pen open path確定 | Enter |
| Pen終了 | Escape |
| Pan | Space+drag / middle drag |

Completion criteriaは、Bezierを点列へ永続化せず、描画→編集→保存→reload→CAM再計算→3D→G-codeが切れずに動き、stale/unsafe exportが防止され、`npm run check` が成功することです。

## Phase 1B

完了済みです。

- 8方向resize、rotation handle、Shift比率固定、Shift 15°rotation
- Alt drag duplicate、Cmd/Ctrl+D
- segment double clickによるde Casteljau node追加
- In/Out handle length・angle数値編集
- segment midpoint・object center snap
- Path List drag reorder
- SVG S/Q/T/Aとnested affine transform
- Fit Selection、H Hand、Z Zoom

resize/rotate/duplicate/split/reorderは各操作1件としてUndoでき、確定結果はNode/Handleへ反映されます。

## 対象外

Text、Brush、Gradient、Image Trace、AI drawing、共同編集、account/cloud sync、mobile full support、nesting、profile/pocket/v-carve/3D CAM、advanced boolean/group、material removal simulationは対象外です。

Phase 1完了後の文字編集、加工幅、追加加工metadataは [`phase2.md`](./phase2.md) に要件を分離しています。実装前の項目はUIに表示しません。

## Known limitations

Phase 1はデスクトップ幅1024px以上を対象とします。SVG style/stroke、CSS、`use`/symbol、textは保持しません。DXF SPLINEは編集用cubic復元に必要な完全なNURBS情報を既存parserが提供しないケースがあるため、有限なline segment列へ正規化します。CNC実機実行前には材料からビットを離したDry Runが必要です。

旧CAMEEのDogbone/T-boneと複数open pathの自動接続UIは、旧ToolPath点列をVectorDocumentへ戻す方式ではBezier情報を失うためPhase 1Aの新Editorへは移植していません。既存CAM純粋関数は残しています。bit libraryはVersion 2で保存・選択できますが、任意bitの追加・詳細編集UIは次段階です。Operationの一括／個別複数file exportは未対応で、選択中Operationを1ファイルずつ安全検査して出力します。
