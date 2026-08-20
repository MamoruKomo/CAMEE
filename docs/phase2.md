# CutPath Phase 2 Requirements

## Goal

Phase 2は、Phase 1の`VectorDocument -> CAM Adapter -> ToolPath`境界とCNC安全性を維持しながら、文字の入力・再編集と、加工結果としての幅を明確に扱う。UIに未実装機能を表示しないため、この文書の項目は実装済みではない。

## 文字の入力と編集

文字は単なるSVG/DOM textとして保存せず、`VectorDocument`内の編集可能なsource objectとして保持する。CAMへ渡すGeometryは必ずfont outlineをLine/Cubic Bézierへ正規化したVectorPathにする。

提案モデル:

```ts
type VectorText = {
  id: string;
  name: string;
  text: string;
  font: {
    family: string;
    style: string;
    weight: number;
    sourceId: string;
    checksum: string;
  };
  fontSizeMm: number;
  letterSpacingMm: number;
  lineHeightMm: number;
  align: "left" | "center" | "right";
  position: Vec2;
  rotationDegrees: number;
  visible: boolean;
  locked: boolean;
};
```

必要な操作:

- Text Toolで入力し、ダブルクリックで再編集
- font、size、weight、letter spacing、line height、alignment変更
- mm単位のX/Y、Width/Height、rotation
- 複数行と改行
- Undo/Redo、copy/paste、保存/reload
- 「アウトライン化」を明示操作として提供し、Undoで文字へ戻せる
- CAM作成時はoutline生成結果を使い、DOM描画結果やCanvas rasterを使わない
- font未取得、checksum不一致、glyph欠落時はCAM/G-codeを禁止する

フォントは名前だけでは別PCで形が変わる。再現性のため、利用許諾を確認できるfont assetの参照とchecksumをProjectへ保存する。OSローカルフォントを無断で埋め込まない。

## 「太さ」の定義

同じ「太さ」というラベルで異なる値を兼用しない。

| 項目 | 意味 | 保存先 | Centerline CAMへの影響 |
| --- | --- | --- | --- |
| 表示線幅 | Editor/SVG上の見た目 | style metadata | 影響させない |
| 工具径 | 使用するbitの実径 | Tool / CamSettings | 実加工幅の基準 |
| 目標加工幅 | 作りたい溝・文字線の幅 | CamOperation settings | 工具径より広い場合は複数offsetが必要 |
| 切削深さ | Z方向の加工量 | CamSettings | pass depthとG-codeへ反映 |
| 輪郭代 | 仕上げ用allowance | 将来のProfile/Pocket operation | Centerlineでは使用しない |

Phase 2で線幅UIを追加する場合も、表示線幅をそのまま工具径や加工幅に変換しない。`目標加工幅 > 工具径`は複数offsetまたはPocket相当の新Operationが必要なため、対応実装と安全検証が完了するまで設定を有効に見せない。

## 加工データに必要な情報

### Project / Material

- unitsはmm固定
- 材料のwidth、height、thickness
- XY originとmachine zeroの説明
- material種類と推奨値（任意metadata）
- stock外path警告

### Geometry source

- source object/path ID
- open/closed
- Line/Cubic Bézier nodesと有限座標
- path order、visibility、lock
- document revision
- 文字の場合はfont checksumとoutline生成version

### Tool

- tool ID、名称、type
- diameter
- V-bit angle、tip diameter（該当時）
- flute count、cutting length（将来の推奨値計算用）
- tool number（tool change対応時）

### CamOperation

- operation ID、type、name
- source IDs、source revision
- tool IDとbit geometry snapshot
- final depth、step down
- feed rate、plunge rate、rapid feed
- spindle speed（Phase 2候補。postprocessorが対応する場合のみ出力）
- retract/safe Z
- ramp enabled/lengthとclosed path制約
- tolerance、max segments
- target width、offset strategy（実装されたOperationだけ）
- through cut許可
- warning acknowledgement

### Output / Safety

- postprocessor IDとversion
- machine/profile名
- generated timestampとdocument/operation revision
- toolpath bounds、estimated minutes、pass depths
- 最初のXY rapidより前のsafe Z
- NaN/Infinity、empty/zero length、材料外、厚さ超過検査
- stale operationのhard block
- Export前warning一覧とDry Run案内

## 推奨実装順序

1. Font loader、license/source/checksum管理
2. `VectorText`とProject migration
3. Text Tool、再編集、properties、history、persistence
4. OpenType glyph outlineをLine/Cubicへ正規化する純粋関数とgolden tests
5. 明示的なアウトライン化とUndo
6. 文字outlineから既存Centerline CAMまでのE2E
7. 表示線幅style（CAM非連動）
8. 目標加工幅Operationの仕様、安全検証、preview、G-code tests
9. spindle/tool number/postprocessor metadata

## Completion criteria

- 入力した文字を保存・reload後に文字として再編集できる
- 同じfont checksumから同じBezier outlineが得られる
- アウトライン化後もLine/Cubic以外をCAMへ渡さない
- 見た目の線幅変更だけでG-codeが変化しない
- 工具径・目標加工幅・深さが別フィールドで明示される
- font不明またはstaleな文字OperationからG-codeを出せない
- 文字→outline→Centerline CAM→3D→安全なG-codeが完走する
- migration、roundtrip、outline、CAM、golden testを追加し`npm run check`が成功する
