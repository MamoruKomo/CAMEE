# CutPath Phase 2

## Phase 2A — 実装済み

Phase 2Aは、Phase 1の`VectorDocument -> CAM Adapter -> ToolPath`境界を維持したまま、再編集可能な文字と加工データの区別を追加した。

### 文字データ

`VectorText`を`VectorDocument`内のsource objectとして保存する。文字列、名前、位置、サイズ、字間、行間、整列、回転、表示線幅、表示・ロック、生成path IDに加え、内蔵フォントID、checksum、outline versionを保持する。

内蔵の`CutPath Simplex`は決定的な14-segment CNC stroke fontである。A–Z、0–9、空白と一部記号をLine segmentへ変換し、DOM text、Canvas raster、OSローカルフォントをCAM Geometryとして使用しない。生成された各strokeは通常のopen `VectorPath`で、CAM計算時だけ既存Adapterを通って`ToolPath`になる。

実装済み操作:

- Text Tool（T）で配置
- 右panelで文字列・複数行・名前を再編集
- font size、letter spacing、line height、left/center/right、X/Y、rotation
- 表示、lock、copy/paste、Cmd/Ctrl+D、arrow move、delete、undo/redo
- IndexedDB / CutPath JSON保存とreload後の再編集
- 明示的なアウトライン化。実行後は通常VectorPathとしてnode編集可能
- SVG export時のBezier/Lineと表示線幅保持
- 文字strokeからCenterline CAM、3D Preview、安全なG-codeへの接続

font ID、checksum、outline versionが一致しないProjectは読込またはoutline生成を拒否する。未対応glyphはEditorで`?` previewと警告を表示するが、CAM計算とG-code生成はhard blockする。

### 「太さ」の分離

| 項目 | 意味 | 保存先 | Centerline CAMへの影響 |
| --- | --- | --- | --- |
| 表示線幅 | Editor/SVG上の見た目 | `VectorPath.style` / `VectorText.strokeWidthMm` | 影響しない |
| 工具径 | 使用bitの径 | Tool / `CamSettings.bitDiameter` | 加工結果の基準 |
| 目標加工幅 | 作りたい溝の幅 | 未実装 | 複数offsetが必要なためUIに出さない |
| 切削深さ | Z方向の加工量 | `CamSettings.finalDepth` | pass depthとG-codeへ反映 |

Centerline panelは工具径を独立表示し、工具形状・切込み・runoutで実際の溝幅が変わることを案内する。表示線幅を工具径や加工幅へ変換しない。

### 加工データ

Projectは材料width/height/thicknessとXY origin、VectorDocument revision、source path ID、open/closed Geometry、bit library、tool diameter/type/name、depth/step-down、feed/plunge/rapid、safe Z、ramp、参考spindle RPM、flute count、through-cut許可を保持する。

参考回転数と刃数はpanelで編集でき、回転数はG-code header commentに記録する。現在のGORDIX6出力は主軸自動起動命令を出さないため、UIにもその旨を明示する。これらの数値は有限な正値でなければexportを拒否する。

## Phase 2B — 次候補

- 使用許諾を確認したOpenType font asset、source、checksum管理
- 日本語glyph outlineとfont embedding/export policy
- Canvas上のダブルクリックinline text editing
- 文字列全体のWidth/Height数値編集
- 任意bit追加・tool number・machine/postprocessor profile
- chip load計算と材料別の推奨値（自動決定ではなく案内）
- VectorPathを正にしたDogbone/T-boneとpath join/close UI

`目標加工幅 > 工具径`、Profile、Pocket、V-Carveはoffset/inside-outside判定と追加の安全検証が必要であり、実装完了まで有効なUIを表示しない。

## Known limitations

- 内蔵stroke fontは英大文字、数字、一部記号のみ。小文字は大文字化される。
- 日本語と未対応glyphはCAMへ出力できない。
- 文字の再編集は右panelで行い、Canvas上のinline caret編集は未対応。
- 文字をアウトライン化すると通常pathになり、文字列としての再編集はできない（直後のUndoは可能）。
- 表示線幅は加工幅ではない。Centerlineは単一中心線のみで、目標幅のoffset加工は未実装。
