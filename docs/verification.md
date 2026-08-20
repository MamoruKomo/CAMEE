# Phase 1A / 1B Verification Record

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
- `npm run test`: success（7 files / 38 tests）
- `npm run build`: success
- `npm run check`: success

Buildには500kB超chunkのwarningがあるがerrorはない。依存auditの20件は変更前と同数で、破壊的な`npm audit fix --force`は実行していない。
