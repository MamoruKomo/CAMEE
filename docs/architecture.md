# CutPath Phase 1A / 1B / 2A Architecture

## Current CAMEE analysis

調査対象は `Isshin-dev/CAMEE` の `7ea70e27556fd5acc4ab0534d5d69715b68af16c` です。変更前のCAMEEは `lib/cam.ts` がDXFをサンプリング済み `ToolPath` へ直接変換し、`app/ToolpathEditor2D.tsx` が同じ点列を編集していました。`app/page.tsx`（1,186行）が画面、CAM状態、ビット、IndexedDB Version 1を一括管理していました。

確認済み既存機能はDXF（LINE/LWPOLYLINE/POLYLINE/ARC/CIRCLE/ELLIPSE/SPLINE）、点列の移動・拡縮・回転、端点接続・閉合、Dogbone/T-bone、材料と9点/DXF原点、ビットライブラリ、名前付きセンターラインCAM、多段加工、閉路ランプ、IndexedDB自動保存、Three.jsプレビュー、GORDIX6向けG-codeです。D1の `db/` は雛形で、ブラウザプロジェクト保存には使われていません。

変更前コマンドはNode v24.19.0で `lint`、`typecheck`、`test`、`build` が成功しました。変更前の `test` はtypecheckとbuildのみでした。最初のsandbox内 `npm ci` はregistryへのDNS制限で失敗し、許可済みネットワークで成功しました。20件の依存脆弱性（low 1 / moderate 4 / high 15）はupstreamの依存ツリーとして検出されました。

## VectorDocument and ToolPath separation

`VectorDocument` は編集データの唯一の正で、stable ID、path order、revision、相対Bezier handleを保持します。`ToolPath` はCAM用の一時的／再生成可能なサンプリング点列です。React描画、SVG DOM、3D表示、G-code文字列は状態の正ではありません。

```text
DXF / SVG / drawing tools
          ↓
VectorDocument (mm, Y-up, editable)
          ↓
CAM Adapter (adaptive flattening)
          ↓
ToolPath (sampled polyline)
          ↓
Existing centerline CAM / Three.js / G-code
```

## Coordinate system

永続座標はmm、X右向き正、Y上向き正です。SVGレンダラーだけが `y -> -y` を適用します。移動・拡縮・回転は確定時にanchorと相対handleへ反映し、CSS transformは永続化しません。

## Geometry normalization

隣接node間は、両側handleがnullならline、それ以外はcubic Bézierです。Rectangleはcorner node、Ellipse/CircleとDXF ARC/CIRCLE/ELLIPSEはcubic Bézierへ変換します。SVGはM/L/H/V/C/S/Q/T/A/Zを扱い、quadraticとarcをimport時にcubicへ変換します。DXF SPLINEは既存parserの安全なサンプル結果をcorner nodeへ移す制限があります。

## Editable text and stroke width

Phase 2Aの`VectorText`は`VectorDocument`内の編集可能なsource objectであり、DOM/SVG textは正にしません。内蔵`CutPath Simplex`のfont ID、`cutpath-simplex-14seg-v1` checksum、outline version 1を保存し、純粋関数が決定的なLine `VectorPath`群を生成します。文字編集はsourceを更新して生成pathをatomicに置換し、1 historyになります。outline化するとsourceとの関連を外し、通常pathへ変換します。

`VectorPath.style.strokeWidthMm`と`VectorText.strokeWidthMm`はEditor/SVGの表示metadataだけです。CAM Adapterはstyleを読まず、加工結果は工具径、工具形状、深さ等で決まります。未対応glyphはpreviewで警告し、Centerline Operation作成を拒否します。font checksum/version不一致はserializationまたはoutline生成時に拒否します。

## DXF and SVG data flow

DXFはEditor用importで必ずVectorDocumentへ変換します。LINE/polylineはline node、arc/circle/ellipseはcubic、その他の既存対応curveは有限なcorner nodeへ正規化します。SVG importは要素を直接VectorPathへ正規化します。入れ子のtranslate/scale/rotate/skew/matrixは親子のaffine matrixを合成し、anchorと相対handleへ適用します。SVG exportはDOMではなくVectorDocumentからpath dataをserializeします。

## CAM Adapter

`vectorPathToToolPath` は純粋関数です。lineはそのまま、cubicはchordからの制御点距離に基づく適応的de Casteljau分割を行います。既定誤差0.05mm、深さとsegment数に上限を設け、有限性、重複、極短segment、閉路終点を検査します。入力は変更しません。

## CamOperation and stale state

Phase 1は `centerline` のみです。Operationはsource path ID、計算時revision、settings、runtime限定の再生成可能なToolPath cacheを持ちます。document revisionが異なる場合はstale表示し、previewとG-code書き出しを禁止します。未実装operationはUIへ出しません。

Phase 2Aは参考spindle RPMとflute countをsettingsとして表示・検査します。GORDIX6 postprocessorはRPMをheader commentへ記録しますが、主軸起動命令を生成しません。目標加工幅、Profile、Pocket、V-Carveは未実装で、UIにも出しません。

## State and history

document history、selection、viewport、drawing preview、CAM settingsを分離します。pointer dragは開始時snapshot、移動中preview、pointerupで1回commitします。viewport pan/zoomはdocument historyへ入りません。Undo後の新規commitはredoを破棄します。

Phase 1Bのresize/rotateも同じtransaction方式です。8方向resizeとrotation handleは複数選択boundsを基準にanchor/handleへ確定し、Shiftで比率または15°を固定します。Direct Selectionでsegmentをdouble clickすると最近傍parameterを求め、de Casteljau分割で形状を保持したnodeを追加します。Path reorderは`pathOrder`だけを更新します。

## Persistence and migration

IndexedDB名とstore/keyは互換性のため `camee-projects/projects/current-project` を継承し、保存payloadだけVersion 2へ更新します。Version 1 `displayPaths`（なければdrawing paths）は各pointをcorner nodeへ変換し、元データは変更しません。JSON import/exportも同じmigration/validation経路を使い、Bezier handleを数値のままroundtripします。CAMのサンプリング済みToolPath cacheはJSON/IndexedDBへ永続化せず、保存Operationのrevisionをstaleにしてreload後の再計算を必須にします。

`VectorText` source、font checksum、outline version、生成path対応も同じVectorDocument JSONでroundtripします。古いVersion 2 documentに`texts`がない場合は空配列として読み込みます。文字はsourceだけでなく決定的な生成Line pathも保存し、対応IDをvalidationすることでreload直後の表示とCAM source selectionを安定させます。編集時はsourceから再生成します。

## G-code safety and golden policy

upstream出力は最初の `G0 X... Y...` より前に安全Zへ退避しません。既存文字列をlegacy goldenとして固定し、安全版は `G0 Z<retractHeight>` を最初のXY Rapidより前へ追加します。空／ゼロ長／非有限path、不正settings、open pathへのrampは拒否します。材料外と厚さ超過はUI警告、貫通は明示許可、staleはhard errorです。

## Libraries and license

- React 19.2.6 / React DOM 19.2.6: UI。各ライセンスはupstream package metadataに従います。
- Three.js 0.185.1: 既存3D previewと既存DXF spline補助を継承。
- dxf-parser 1.1.2: 既存DXF構文解析を再利用。
- lucide-react 1.31.0: UI iconを継承。
- Vinext 1.0.0-beta.2 / Vite 8.0.13: 既存build環境を継承。
- Vitest 4.1.11: Node 22+/24およびVite 8対応のunit test runner。Cloudflare pluginとtest環境を混在させないため `vitest.config.ts` を分離した。package-lockへ固定。

upstreamに `LICENSE` ファイルは存在しません。ライセンスは推測せず、新しいLICENSEも追加しません。

## Upstream compatibility decision

旧 `ToolpathEditor2D` はサンプリング点列を編集データにしており、絶対禁止事項と両立しないため `VectorEditor2D` へ置換した。`lib/cam.ts` のDXF、corner relief、path close/join、ramp、pass depth、estimate、G-code関数は残している。Dogbone/T-boneと複数open pathの自動接続UIは、Bezierを点列へ逆変換する危険な近道を避けるため新Editorには表示していない。VectorPathを正にしたまま行う移植はPhase 2候補とする。
