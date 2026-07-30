# kumihimo

[English](README.md) | **日本語**

映像・音響の **系統図** をテキストで書くための言語とツール群。Mermaid がフローチャートに対してやっていることを系統図に対してやりますが、決定的に違う点が2つあります — 接続の単位が「ノード」ではなく **ポート（端子）** であること、そしてケーブルに載る **信号種別** がツールの理解する情報であって飾りではないことです。

```khm
device cam "SONY FX3"  as camera   { out SDI : sdi }
device sw  "ATEM Mini" as switcher { in 1..8 : sdi  out PGM : sdi }
device rec "HyperDeck" as recorder { in SDI : sdi }

cam.SDI -> sw.1     : sdi 30m "V-01" [color=青]
sw.PGM  -> rec.SDI  : sdi 2m  "V-10"
```

- **`@love-rox/kumihimo-core`** — パーサ・検証・レイアウト・SVG 描画
- **`@love-rox/kumihimo-cli`** — `kumihimo build` / `check` / `export` / `--watch`
- **`@love-rox/kumihimo-rehype`** — Markdown のコードフェンスを図にする
- **`@love-rox/kumihimo-react`** — React 用 `<Kumihimo>` とフック
- **`@love-rox/kumihimo-vue`** — Vue 3 用 `<Kumihimo>` とコンポーザブル
- **`@love-rox/kumihimo-astro`** — Astro 用 integration とコンポーネント
- **`@love-rox/kumihimo-editor`** — 埋め込み可能なライブエディタ

## なぜ作るのか

Mermaid が描くのは「ノードを線でつないだ図」です。AV システムはそうではありません。ミキサーの `IN 12` と `IN 13` は別物ですし、SDI 出力は HDMI 入力に入りませんし、ケーブルの長さと外被色は現場で必要になる事実です。フローチャートのツールでも絵は描けますが、**その絵が間違っていることは教えてくれません**。

kumihimo は教えられます。モデルがポートというものを知っているからです。

|                | Mermaid flowchart | kumihimo                                 |
| -------------- | ----------------- | ---------------------------------------- |
| 接続の単位     | ノード → ノード   | **ポート → ポート**                      |
| 線の意味       | 任意              | **信号種別**（SDI / XLR / Dante …）      |
| 検証           | なし              | 種別不整合・方向・入力の過剰結線を検出   |
| ノード内の位置 | 無意味            | **意味を持つ** — `IN 1` と `IN 2` は別物 |

### 何を検出するのか

検出する価値があるのは、**ケーブルが気持ちよく挿さって、そして何も通らない**組み合わせです。

```
[warning] ext.CAT → netsw.1  HDBaseT は Cat ケーブルと RJ45 を使うが Ethernet ではない。
                             スイッチには挿せない
[warning] cam.SDI → sync.REF BNC を共有するだけ。同期基準入力に映像を入れてもロックしない
[warning] cdp.OUT → dac.IN   RCA を共有するだけ。アナログ音声を S/PDIF 入力に入れても
                             何も出ない
[warning] pc.HDMI → mon.DVI  HDMI-DVI 変換ケーブルが必要。via で明示すると資材表に載る
[warning] desk.OUT → amp.IN  バランス→アンバランス。レベルが下がりハムループに晒される
```

判定には必ず理由が付き、その理由はケーブル表にも引き継がれます。

## インストール

```bash
# コマンドライン
pnpm add -D @love-rox/kumihimo-cli

# React / Vue
pnpm add @love-rox/kumihimo-react
pnpm add @love-rox/kumihimo-vue

# Markdown（unified / rehype）
pnpm add @love-rox/kumihimo-rehype

# Astro
pnpm add @love-rox/kumihimo-astro

# ライブエディタ
pnpm add @love-rox/kumihimo-editor

# 独自に組み込む場合の core 単体
pnpm add @love-rox/kumihimo-core
```

## 使い方

### コマンドライン

```bash
kumihimo build studio.khm -o studio.svg   # 描く
kumihimo check studio.khm                 # 検証のみ
kumihimo build studio.khm --watch         # 保存のたびに再描画
kumihimo build studio.khm --theme mono    # 白黒印刷向け

kumihimo export studio.khm drawio         # draw.io で編集できる形式
kumihimo export studio.khm cable --stdout # ケーブル表を TSV で
```

診断は原因となった行に対して表示されます。

```
studio.khm:24:1 warning[signal-mismatch]
  ext.CAT → netsw.1: HDBaseT は Cat ケーブルと RJ45 を使うが Ethernet ではない
   |
24 | ext.CAT -> netsw.1 : hdbaset 20m "N-90"
   | ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
```

既定では警告でビルドは失敗しません。配線の警告は、作者が既に検討した上での選択であることが多いためです。CI で止めたい場合は `--strict` を使います。

### Markdown

````md
```kumihimo
cam.SDI -> sw.1 : sdi 30m "V-01"
```
````

```js
import rehypeKumihimo from '@love-rox/kumihimo-rehype';

unified().use(remarkParse).use(remarkRehype).use(rehypeKumihimo, { theme: 'dark' });
```

### React

```tsx
import { Kumihimo, useKumihimo } from '@love-rox/kumihimo-react';

<Kumihimo source={src} theme="dark" onDiagnostics={console.warn} />;

// 自分で制御する場合
const { svg, diagram, diagnostics, pending } = useKumihimo(src);
```

### Vue 3

```vue
<script setup>
import { Kumihimo } from '@love-rox/kumihimo-vue';
</script>

<template>
  <Kumihimo :source="src" theme="dark" @diagnostics="onDiagnostics" />
</template>
```

### Astro

```js
import kumihimo from '@love-rox/kumihimo-astro';

export default defineConfig({ integrations: [kumihimo({ theme: 'dark' })] });
```

すべてビルド時に処理されるので、ページには静的な SVG だけが載り JavaScript は不要です。

### ライブエディタ

```tsx
import { KumihimoEditor } from '@love-rox/kumihimo-editor';
import '@love-rox/kumihimo-editor/styles.css';

<KumihimoEditor initialSource={src} onChange={setSrc} />;
```

左にソース、右に図。診断をクリックすると該当行にカーソルが飛び、ケーブル表・機器表がタブで並び、SVG / PNG を書き出せます。URL 共有はソースをフラグメントに入れるので、**サーバには一切送信されません**。

## 言語

仕様の全文: [docs/SPEC.ja.md](docs/SPEC.ja.md)

```khm
diagram "スタジオA" { direction: LR, theme: light }

use "./lib/blackmagic.khm"          # 機材ライブラリの取り込み

group rack "メインラック" {
  device sw from atem_mini_extreme  # ポート定義はモデルから引く
  device mixer "Yamaha DM3" as mixer {
    in  CH[1..16] : xlr             # 範囲は展開される
    out L, R      : xlr
    io  DANTE     : dante
    @vendor "Yamaha"                # メタ情報は機器表に載る
  }
}

cam.SDI  -> sw.1        : sdi 30m "V-01" [color=青]    # ケーブルの外被色
pc.HDMI  -> mon.DVI     : hdmi via "HDMI-DVI 変換"     # 変換部材は資材表に出る
mic.RF   -> rx.RF1      : uhf [ch=38]                  # 無線は周波数を持つ
mixer.(L, R) -> sw.(AUDIO_L, AUDIO_R) : trs            # 並列結線

compat aes -> xlr : ok "社内標準: 10m 以下は許容"       # 理由付きで規則を上書き
```

映像・音響・制御・ネットワーク・電源・同期・無線にわたる 38 種の信号種別を内蔵しています。

### テーマ

`light` / `dark` / `blueprint` / `mono` の4種。`mono` は色を捨てて**線種で信号を区別**します。系統図は白黒でコピーして現場に貼るものだからです。

## 例

[`examples/`](examples/) に、正常な配信系統図、無線構成、機材ライブラリだけで組んだラック、そして**全て挿さるのに何も通らない**誤配線の例を置いています。

## 開発

```bash
pnpm install
pnpm build
pnpm test
pnpm lint && pnpm format:check && pnpm typecheck && pnpm check:tsdoc
pnpm --filter kumihimo-playground dev   # エディタ単体を動かす
```

## ライセンス

MIT © SASAGAWA Kiyoshi
