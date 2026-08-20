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

## Phase 2A

完了済みです。Text Tool（T）、編集可能な`VectorText`、内蔵CNC stroke font、文字properties、保存/reload、copy/paste、outline化、表示線幅、Centerline CAM統合、参考回転数・刃数の加工metadataを追加しました。

文字はsource objectとして保存し、生成strokeはLine `VectorPath`です。未対応文字、font checksum不一致、stale operationはCAM/G-codeを拒否します。表示線幅はCAM非連動です。

## Phase 2B

完了済みです。Design/CAM Inspector tabs、toolごとのContext Bar、空Canvas開始guide、作図中mm寸法HUD、Escape完了、active tool statusを追加しました。UI stateはDocument historyへ入らず、VectorDocument/CAM境界を変更しません。

参考製品から採用した情報設計と判断理由は [`ux.md`](./ux.md) に記録しています。

## 対象外

Brush、Gradient、Image Trace、AI drawing、共同編集、account/cloud sync、mobile full support、nesting、profile/pocket/v-carve/3D CAM、advanced boolean/group、material removal simulationは対象外です。

文字編集、加工幅、追加加工metadataの実装状況と次候補は [`phase2.md`](./phase2.md) に記録しています。未実装項目はUIに表示しません。

## Known limitations

デスクトップ幅1024px以上を対象とします。SVG CSS、`use`/symbol、SVG text要素のimportは保持しません。CutPath内で作成した文字はLine pathと表示線幅をSVG exportします。DXF SPLINEは編集用cubic復元に必要な完全なNURBS情報を既存parserが提供しないケースがあるため、有限なline segment列へ正規化します。CNC実機実行前には材料からビットを離したDry Runが必要です。

内蔵文字は英大文字・数字・一部記号のみで、日本語glyphは未対応です。旧CAMEEのDogbone/T-boneと複数open pathの自動接続UIは、旧ToolPath点列をVectorDocumentへ戻す方式ではBezier情報を失うため新Editorへは移植していません。既存CAM純粋関数は残しています。bit libraryはVersion 2で保存・選択できますが、任意bitの追加・詳細編集UIは次段階です。Operationの一括／個別複数file exportは未対応で、選択中Operationを1ファイルずつ安全検査して出力します。
