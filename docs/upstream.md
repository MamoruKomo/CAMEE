# Upstream

- Original Repository: CAMEE
- Original URL: https://github.com/Isshin-dev/CAMEE
- Reference Commit SHA: `7ea70e27556fd5acc4ab0534d5d69715b68af16c`
- Reference Branch: `main`
- Investigated: 2026-08-20 JST

## Inherited files and behavior

`lib/cam.ts` のcenterline計算補助、DXF parser、材料原点、corner relief、path join/close、多段加工、ramp、G-code、時間見積もりを監査して継承します。`app/ToolpathPreview.tsx` のThree.js表示、既存ビット定義とGORDIX6前提、Vinext/Vite/Cloudflare設定も可能な限り維持します。

## Major changed areas

`app/page.tsx` のVersion 1/ToolPath中心stateをProject V2/VectorDocument中心へ置き換え、2D editorを `VectorEditor2D` と分割します。`lib/vector/`、`lib/project/`、`lib/cam/`、editor/toolbar/panels/hooks component群、unit/golden testsを追加します。安全Zに関する既存G-code差分はlegacy/new goldenと理由を記録します。

## License status

参照commitに `LICENSE`、`LICENSE.md`、`COPYING` は存在しません。READMEにも明示的なlicense記載はありません。ライセンスは不明として扱い、MIT等を推測して追加しません。
