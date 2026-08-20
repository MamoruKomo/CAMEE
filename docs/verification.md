# Phase 1A / 1B / 2A / 2B Verification Record

## Before implementation

Reference: upstream `7ea70e27556fd5acc4ab0534d5d69715b68af16c`, Node v24.19.0.

- `npm ci`: sandbox内はregistry DNS制限で失敗。許可済みネットワークでは成功。
- `npm run lint`: success
- `npm run typecheck`: success
- `npm test`: success（変更前はtypecheck + buildのみ）
- `npm run build`: success
- LICENSE: missing
- npm audit during install: 20 upstream dependency findings (1 low / 4 moderate / 15 high)

## Browser End-to-End — 2026-08-20

In-app browser、`http://localhost:3000/`、300 × 200 × 18mm、lower-left originで確認した。

1. 新規Projectを起動し、IndexedDB statusが「保存済み」になることを確認。
2. Rectangleをdrag作成。Revision 1、1 path。
3. Penで3 anchorのopen Bézierを作成しEnter確定。Revision 2。
4. Penで3 anchorのclosed Bézierを作成し始点clickで閉合。Revision 3。
5. Direct SelectionでanchorをdragしRevision 4、handleをdragしRevision 5。選択anchorにhandle 2本を確認。
6. UndoでRevision 4、RedoでRevision 5へ戻ることを確認。
7. 明示保存後reload。3 path、Revision 5、anchor 3点とhandle 2本が再表示され、Bezierが編集可能な状態で復元。
8. closed Bézierを選択し、ストレート3mm、final depth 3mm、step down 1mm、feed 1000、plunge 300でCenterline CAMを計算。
9. 3D Preview表示、Operation計算済み、Dry Run警告、G-code export enabled、console errorなしを確認。
10. G-code export完了通知を確認。出力文字列はsafe golden testで別途完全一致を検証。
11. その後anchorを変更しRevision 6。「図形が変更されています」「再計算必要」、G-code export disabledを確認。
12. LineとEllipseをdrag作成して計5 path、Revision 8を確認。
13. Path ListとCanvas選択の連動、Shift複数選択（2 path）、数値X変更（Revision 9）を確認。
14. ToolPath cache非永続化後に2回reloadし、VectorDocument 5 pathは復元、保存Operationは「再計算必要」、G-code export disabled、console errorなしを確認。

Browser console errorは0件だった。Copy/Pasteは純粋複製test（Bezier handle保持、新ID、5mm offset）で検証し、実ブラウザではBrowser automationのvirtual clipboard制約によりOS shortcutのpaste eventを完走できなかった。

## Phase 1B Browser Verification — 2026-08-20

- ToolbarにH Hand / Z Zoomが表示され、Z clickでzoom表示が255%から319%へ変化した。
- Cmd+DでPath Listが1件から2件になり、新IDを持つ複製が1 revisionで追加された。
- 選択時に8 resize handles、1 rotation handle、enabledなFit Selectionを確認した。
- Path List各行にdrag handleがあり、並べ替え可能な状態を確認した。
- Direct Selectionのanchor/handle UI、数値handle欄、segment double click経路をUnit Testと実画面で確認した。
- Browser consoleはVite接続とReact DevTools案内のみで、errorは0件だった。
- SVG S/Q/T/A、arc cubic化、nested transformはUnit Testで数値検証した。

## Final automated verification

- `npm ci`: success（508 packages、lockfile再現）
- `npm run lint`: success
- `npm run typecheck`: success
- `npm run test`: success（8 files / 47 tests、Phase 2A時点）
- `npm run build`: success
- `npm run check`: success

Buildには500kB超chunkのwarningがあるがerrorはない。依存auditの20件は変更前と同数で、破壊的な`npm audit fix --force`は実行していない。

## Phase 2A Verification — 2026-08-20

- Text sourceから有限なLine `VectorPath`が決定的に生成されることをUnit Testで確認。
- 文字列、位置、サイズ、表示線幅、font ID/checksum/outline version、生成path対応がVectorDocumentとProject V2でroundtripすることを確認。
- 文字更新時に生成pathが一括置換され、outline化後は通常pathになることを確認。
- 表示線幅を変更してもCAM AdapterのToolPathが変わらないことを確認。
- 文字strokeから既存Centerline Operationを生成できることを確認。
- 未対応glyphとfont checksum不一致をCAM前に拒否することを確認。
- spindle RPM / flute countの非有限値・0をexport safety errorにすることを確認。
- SVG exportが表示線幅を保持することを確認。
- `npm run check`: success（8 files / 47 tests / production build）。

ローカル開発serverは`http://localhost:3000/`で起動した。Phase 2Aのin-app browser自動操作はBrowser URL policyがlocalhost reloadを拒否したため実施できず、Unit/integration testとproduction buildで代替した。Phase 1A/1Bの既存Browser検証結果は上記の通りである。

## Phase 2B Verification — 2026-08-20

- 9 toolすべてに日本語label、shortcut、操作hintがあることをUnit Testで確認。
- anchor、text、single/multi pathのselection summary優先順位をUnit Testで確認。
- Lineの長さ・角度、Rectangle/EllipseのW/Hがmmで算出されることをUnit Testで確認。
- server-rendered HTMLでContext Bar、Design/CAM Inspector tabs、active tool statusを確認。開始guideはIndexedDB restore完了後の空Projectだけに表示する条件をcode reviewで確認。
- Inspector mode、Context Bar、dimension HUDがVectorDocument/Project persistenceへ入らないことをcode reviewで確認。
- production buildと`npm run check`で既存Vector/CAM integrationの回帰がないことを確認。
- `npm run check`: success（9 files / 50 tests / production build）。

Phase 2Bのin-app browser自動visual verificationは、Phase 2Aと同じlocalhost URL policy制限により未実施。開発serverのHTTP 200とrendered HTML、Unit/integration tests、production buildで代替した。
