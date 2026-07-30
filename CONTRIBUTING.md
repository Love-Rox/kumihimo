# Contributing

kumihimo への貢献を歓迎します。このドキュメントでは開発の進め方をまとめています。

## 開発環境

- Node.js 22 以降（CI は 24）
- pnpm 10.x
- Oxc（`oxlint` / `oxfmt`）を lint/format に使用

```bash
pnpm install
```

## よく使うコマンド

```bash
pnpm build        # 全パッケージを tsc でビルド
pnpm test         # Vitest を全ワークスペースで実行
pnpm typecheck    # 型チェック
pnpm check:tsdoc  # typedoc による TSDoc 検証
pnpm lint         # oxlint
pnpm lint:fix     # oxlint --fix
pnpm format       # oxfmt で整形
pnpm format:check # 整形差分を検出

pnpm --filter @love-rox/kumihimo-core test          # 単一パッケージ
pnpm --filter kumihimo-playground dev               # エディタを単体で起動
```

CI は `lint` → `format:check` → `build` → `check:tsdoc` → `typecheck` → `test` の順で
実行されます。**`format:check` は changeset や README を追加したときに引っかかりがち**なので、
コミット前に `pnpm format` を流してください。

## パッケージ構成

| パッケージ                  | 役割                                                |
| --------------------------- | --------------------------------------------------- |
| `@love-rox/kumihimo-core`   | パーサ・検証・レイアウト・SVG・資材表・エクスポート |
| `@love-rox/kumihimo-cli`    | コマンドライン                                      |
| `@love-rox/kumihimo-rehype` | Markdown 組み込み                                   |
| `@love-rox/kumihimo-react`  | React コンポーネント／フック                        |
| `@love-rox/kumihimo-vue`    | Vue 3 コンポーネント／コンポーザブル                |
| `@love-rox/kumihimo-astro`  | Astro 統合                                          |
| `@love-rox/kumihimo-editor` | ライブエディタ                                      |

ロジックは可能な限り `core` に置いてください。資材表の導出が core にあるのは、それが UI では
なくモデルの性質だからで、おかげで CLI からも同じ関数が使えます。

## 設計上の約束（壊さないでください）

- **例外を投げない。** 字句解析・構文解析・検証・描画のどの段でも、診断を集めて最善努力の
  結果を返します。壊れた入力でも図が出ることが、ライブエディタの前提です。
- **`core` は I/O に触れない。** ファイル読み込みは resolver として注入します。同じコードが
  ブラウザ・Markdown パイプライン・CLI で動く必要があります。
- **ポートの順序は意味を持つ。** `IN 1` は必ず `IN 2` の上に来ます。レイアウトエンジンに
  委ねているのは経路探索だけで、ポート位置は自前で計算しています。
- **属性に出る値は必ず検証かエスケープを通す。** `.khm` は信頼できない入力です。
  詳細は [SECURITY.md](SECURITY.md) を参照してください。
- **内部 import には `.js` 拡張子を付ける。** `moduleResolution: "Bundler"` と `tsc` の
  emit がそれを要求します。
- **公開 API には TSDoc を書く。** `check:tsdoc` が `notDocumented` を強制しています。

## TypeScript の規約

- ESM のみ（`"type": "module"`、`"sideEffects": false`）
- `noUncheckedIndexedAccess` と `exactOptionalPropertyTypes` が有効です。
  省略可能プロパティと `| undefined` は別物として扱われます。
- 各パッケージが `tsconfig.build.json` を持ち、`dist/` に出力します。

## 言語を変更するとき

DSL の文法を変える場合は [docs/SPEC.ja.md](docs/SPEC.ja.md) も同じコミットで更新してください。
仕様書に書かれた例は実際にパースできる必要があります（実例は `examples/` にあります）。

信号種別・互換性ルール・変換部材の表を編集する場合は、**なぜそうなのかをコメントに残して
ください**。「HDBaseT は RJ45 だが Ethernet ではない」といった事実は、後から読む人が
再発見するには高くつきます。

## リリース

changesets を使っています。全パッケージは同一バージョンで固定されています。

```bash
pnpm changeset   # 変更内容を記録
pnpm format      # changeset ファイルも整形対象です
```

`main` への push で Release PR が作られ、マージすると npm へ publish されます。

## ライセンス

貢献されたコードは MIT ライセンスで公開されます。
