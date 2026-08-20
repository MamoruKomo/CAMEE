# CutPath Workspace UX

## Phase 2B goal

Phase 2Bは機能追加よりも、作図から加工までの判断順序を画面構成へ反映する。初心者が「どこから始めるか」「現在何をしているか」「次に何をすべきか」を見失わず、経験者はshortcutで同じ操作を高速に行えることを目標とする。

## Reference principles

2026-08-20に以下の公式資料を確認した。

- Adobe Illustrator Workspace overview: https://helpx.adobe.com/au/illustrator/desktop/get-started/learn-the-basics/workspace-overview.html
- Adobe Illustrator Contextual Task Bar: https://helpx.adobe.com/uk/illustrator/desktop/get-started/learn-the-basics/contextual-task-bar-overview.html
- Adobe Illustrator keyboard shortcuts: https://helpx.adobe.com/jp/illustrator/using/default-keyboard-shortcuts.html
- Autodesk Fusion interface: https://help.autodesk.com/view/fusion360/ENU/?contextId=LP-STEPS-P13N-SNP-GS-OTH-CRD-1
- Autodesk Fusion keyboard shortcuts: https://help.autodesk.com/cloudhelp/ENU/Fusion-GetStarted/files/GUID-F0491540-0324-470A-B651-2238D0EFAC30.htm

採用した原則:

- 左Toolbarは作成・選択・navigationを分け、shortcutを常時表示する。
- Propertiesは選択object/tool/workflowに応じた内容を出す。
- Canvas上部のContext Barには、現在のtool、操作方法、選択状態、次の主要actionだけを出す。
- DesignとCAMは同じ右panel内でもworkspace tabを分け、情報量を一度に出しすぎない。
- bottom Status Barは座標、Snap、Grid、単位、revision等の継続監視情報へ限定する。
- drawing drag中はCanvas上にmm寸法を表示し、視線を右panelへ移さずに大きさを確認できるようにする。

UIの外観やproprietary assetを複製せず、CutPathのVectorDocument/CAM workflowに必要な情報構造だけを採用した。

## Implemented workspace

```text
Header: Project / Import / Save / Undo / 2D-3D
  ↓
Context Bar: active tool / hint / selection / next action
  ↓
Left Toolbar | Canvas + dimension HUD | Design / CAM Inspector
  ↓
Status Bar: X/Y / Snap / Grid / active tool / units / revision
```

空ProjectではCanvas中央にRectangle、Pen、Textの開始actionと、Draw → Dimension → CAM → 3Dの4-step guideを表示する。Geometryが作成されたらguideは消え、通常の広いCanvasへ戻る。

Design InspectorはText、Properties、Path Listを持つ。CAM InspectorはMaterial、Tool、Depth、Feed、Operation、Safety、G-code exportを持つ。Context Barの「加工設定へ」はCAM計算を勝手に実行せず、Inspectorを切り替えるだけである。

## Interaction decisions

- `Escape`: drawing/toolを終了してSelectionへ戻る。Selection中は選択解除。
- Line/Rectangle/Ellipse drag中: 長さ・角度またはW/Hをmm表示。
- Context Barの操作説明はtoolごとの純粋dataで管理し、React内に分散させない。
- Inspector tab切替、pan、zoomはVectorDocument historyへ入れない。
- CAM tabを開いてもGeometryやOperationを変更しない。
- 3D表示へ切り替えた場合はCAM Inspectorを表示する。

## Remaining UX work

- Canvas上の直接数値入力とTabによるW/H切替
- command search / shortcut cheat sheet
- context menuと複数selection actionの整理
- panel幅変更・workspace preference保存
- keyboard only operationとscreen readerの追加監査
- 1024 / 1280 / 1440 / 1920幅のvisual regression test
