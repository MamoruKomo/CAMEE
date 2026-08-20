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

8方向resize、rotation handle、ratio lock、15度rotation、Alt duplicate、Cmd/Ctrl+D、segment上のde Casteljau UI、handle length/angle、advanced snap、path reorder、SVG S/Q/T/Aとnested transform、Fit Selection、H/Z toolを候補とします。Phase 1Aの完了を優先します。

## 対象外

Text、Brush、Gradient、Image Trace、AI drawing、共同編集、account/cloud sync、mobile full support、nesting、profile/pocket/v-carve/3D CAM、advanced boolean/group、material removal simulationは対象外です。

## Known limitations

Phase 1Aはデスクトップ幅1024px以上を対象とします。SVG style/strokeやnested transformは保持しません。DXF SPLINEは編集用cubic復元に必要な完全なNURBS情報を既存parserが提供しないケースがあるため、有限なline segment列へ正規化します。CNC実機実行前には材料からビットを離したDry Runが必要です。

旧CAMEEのDogbone/T-boneと複数open pathの自動接続UIは、旧ToolPath点列をVectorDocumentへ戻す方式ではBezier情報を失うためPhase 1Aの新Editorへは移植していません。既存CAM純粋関数は残しています。bit libraryはVersion 2で保存・選択できますが、任意bitの追加・詳細編集UIは次段階です。Operationの一括／個別複数file exportは未対応で、選択中Operationを1ファイルずつ安全検査して出力します。
