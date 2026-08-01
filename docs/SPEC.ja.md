# kumihimo DSL 仕様 (v0.1)

[English](SPEC.md) | **日本語**

映像・音響・制御・電源の **系統図 / 配線図** をテキストで書くための言語。

> 正となるのは英語版 [`SPEC.md`](SPEC.md) です。仕様を変更するときは両方を同じコミットで
> 更新してください。

---

## 1. 設計の前提

Mermaid のフローチャートは「ノードとエッジ」を扱う。AV の系統図が扱うのは
**ポート（端子）とポート**の接続であり、ここが決定的に違う。

|                | Mermaid flowchart | kumihimo                                    |
| -------------- | ----------------- | ------------------------------------------- |
| 接続の単位     | ノード → ノード   | **ポート → ポート**                         |
| 線の意味       | 任意              | **信号種別**（SDI / XLR / Dante …）が第一級 |
| 検証           | なし              | 種別不整合・ポート重複・未結線を検出できる  |
| ノード内の位置 | 無意味            | **意味を持つ**（IN 1 と IN 2 は別物）       |

この3点が kumihimo の存在理由であり、データモデルを Mermaid に寄せてはならない理由でもある。

---

## 2. ファイル形式

- 拡張子: `.khm`
- エンコーディング: UTF-8
- 改行: LF / CRLF どちらも受理
- 空白・インデントに意味はない（自由整形）
- 文の区切りは **改行** または `;`

### コメント

```khm
# 行コメント（行末まで）
```

---

## 3. 全体構造

```khm
diagram "配信スタジオ 系統図" {
  direction: LR
}

signal madi : audio { color: "#f59e0b" }

device cam1 "SONY FX3" as camera {
  out SDI : sdi
}

group stage "ステージ" {
  device mic1 "SM58" as microphone { out OUT : xlr }
}

cam1.SDI -> sw.1 : sdi 10m "V-01"
```

トップレベルに書けるのは `diagram` / `signal` / `device` / `group` / 結線 の5種。
順序は任意で、**前方参照が可能**（結線を機器宣言より先に書いてよい）。

---

## 4. `diagram` — 図全体の設定

```khm
diagram "配信スタジオ 系統図" {
  direction: LR      # LR（左→右, 既定） | TB（上→下）
  theme: light       # light（既定） | dark | mono | blueprint
  spacing: 60        # ノード間隔 px
}
```

タイトル・ブロックともに省略可。ファイルに1つまで。

### カラーテーマ

| 名前        | 用途                                 |
| ----------- | ------------------------------------ |
| `light`     | 既定。画面・カラー印刷向け           |
| `dark`      | 暗い画面向け                         |
| `mono`      | **白黒印刷・コピー向け**             |
| `blueprint` | 青焼き風。設備図面の慣習に寄せた配色 |

`mono` は色を一切使わない。**信号の区別は線種に切り替わり**、`[color=…]` で指定した
ケーブル色も無視される。白黒のコピーで色が残ったふりをしても意味がないため。

テーマは CLI の `-t/--theme` でも指定できるが、`diagram { theme: … }` を書いた図は
そちらが優先される。図面は自分の見た目を知っており、呼び出し側は既定値しか知らないため。

---

## 5. `device` — 機器

```text
device <id> "<ラベル>" as <種別> {
  <ポート宣言>*
  <メタ情報>*
}
```

- `<id>` … 結線から参照する識別子。図中では既定で非表示。
- `"<ラベル>"` … 図に描かれる名前。省略時は `<id>` を使う。
- `as <種別>` … 形状・アイコンを決める。省略時は `generic`。

### 機器種別

`camera` `switcher` `mixer` `recorder` `player` `display` `projector` `speaker`
`microphone` `amplifier` `computer` `converter` `transmitter` `receiver` `matrix`
`patchbay` `router` `interface` `generic`

### ポート宣言

```text
in   <ポート指定> : <信号種別>          # 入力
out  <ポート指定> : <信号種別>          # 出力
io   <ポート指定> : <信号種別>          # 双方向（Dante / LAN など）
```

`io` は「どちらにもなれる」であって「どちらである」ではない。どちらなのかは、その口に触れる
結線から読む。**受けるだけの口は、能力が何であれ受け側の面に描かれる。**両方向に使われている口と、
何も繋がっていない口は送り側の面に描かれる。そちらは本当に両義なので、既定が安定している方がよい。

#### 箱に付いているコネクタ

信号種別が複数のコネクタを持つとき、口はどれが付いているかを書ける。

```khm
device dk "卓" as mixer   { out CH[1..16] : xlr [connector=XLR-M] }
device sp "SP" as speaker { in  IN        : xlr [connector=XLR-F] }
```

**ケーブルの端は導かれる。** プラグは逆の性別と噛み合うので、オスの出力にはメスの端が来る。
口に書けば**口1つにつき1回**書けばよく、そこに届くすべてのケーブルが自動的に一致する。結線に
書く方式だと、同じ口について2本の結線が食い違いうる。

`xlr` は組み込みの中で唯一、コネクタ欄が**対**である型である。他はすべて「どれか」の意味で、
`usb` は A か B か C である。対でない型では、ケーブル端は逆ではなく同じ名前になる。

型が持たないコネクタは指摘される。`connector` 以外の属性も指摘される。結線の `[…]` は
「追加の属性」としてモデルに保存されるので未知のキーも生き残るが、口の方は保存されないためである。

`<ポート指定>` は4つの書き方を受理する。

| 書き方         | 例          | 展開結果           |
| -------------- | ----------- | ------------------ |
| 単一           | `SDI`       | `SDI`              |
| 列挙           | `L, R`      | `L`, `R`           |
| 数値範囲       | `1..4`      | `1`, `2`, `3`, `4` |
| 接頭辞付き範囲 | `CH[1..16]` | `CH1` … `CH16`     |

```khm
device sw "ATEM Mini Pro" as switcher {
  in  1..4     : hdmi
  out PGM      : hdmi
  out STREAM   : lan
}

device mixer "Yamaha DM3" as mixer {
  in  CH[1..16] : xlr
  out L, R      : xlr
  io  DANTE     : dante
}
```

### 1つの端子が複数を受ける場合

端子によっては、複数の種類のプラグを受ける。コンボジャックは XLR と 1/4" の両方が挿さる。`|` で並べて書く。

```khm
device desk "Yamaha DM3" as mixer {
  in CH[1..8]  : xlr | trs   # コンボジャック
  in CH[9..16] : xlr
}

mic.OUT -> desk.CH1 : xlr   # ok
di.OUT  -> desk.CH2 : trs   # ok
```

- **最初に書いた型**が、図に描かれ一覧表に載る型になる。1つの端子は図の上で1色、表の上で1行でなければならず、書いた順がそれを決める。
- 結線に書いた信号種別は、**そのケーブルがどちらを使っているか**を表すので、判定はそちらで行う。結線が種別を書いていなければ最初の型が使われる。
- すべての名前を検査するので、2つ目の綴り間違いも報告される。正しく書けた方だけが残ることはない。

これは「1つの穴が2種類を受ける」という話であって、「2つが同等である」という話ではない。`xlr` と `trs` は既に互換（§9）だが、`xlr | trs` はそれとは別のことを言っている — **この穴には物理的にどちらのプラグも挿さる**、ということである。

### ジャックの太さ

ジャック系の型は太さを持つ。挿さるかどうかを決めているのが太さだからである。規則は一様で、**無印が 1/4″、`35` が付けば 3.5mm**。

| 型       | コネクタ   |
| -------- | ---------- |
| `trs`    | TRS 1/4″   |
| `trs35`  | TRS 3.5mm  |
| `trrs`   | TRRS 1/4″  |
| `trrs35` | TRRS 3.5mm |

TRRS は 3.5mm で見ることが圧倒的に多いので、`trrs` が 1/4″ を指すのは直感に反する読み方ではある。ただし例外のある規則より、どこでも成り立つ規則の方が覚えやすい。

**同じ信号で太さが違う場合はアダプタ**（§9）。3.5mm-6.3mm 変換プラグが要り、`via` で宣言すれば資材表に載る。**同じ太さで極数が違う場合は損失**。プラグは嵌まり、導体が1本ずれた接点に当たる。4極を3極ジャックに挿せば音声は通り、マイクが落ちる。

### `gap` — 端子の塊のあいだの余白

`gap` の行を置くと、その次に宣言されるものの上に余白が入ります。端子の羅列が、実際にそうであるとおりの塊として読めるようになります。

```khm
device sw "ATEM Mini Extreme" as switcher {
  in  1..4 : hdmi
  gap
  in  5..8 : sdi
  gap 2
  in  AUDIO_L, AUDIO_R : trs
  out PGM    : sdi
  gap
  out STREAM : lan
}
```

- `gap` ひとつが1ステップ、つまりポート間隔の半分です。`gap <n>` で n ステップ、`gap` を続けて書けば加算されます。
- 余白は**後に続く宣言の上**に入ります。前の宣言の下ではありません。書いたとおりに読めるようにするためです。
- 複数のポートに展開される宣言でも、余白が入るのは**最初の1つの前だけ**です。`in CH[1..16]` の上の `gap` は `CH1` の前の1箇所であって、16箇所ではありません。
- 後に何も続かない `gap` は捨てられます。`model` では、`device … from` がポートを足した時点で「最後」でなくなりうるからです。
- `gap 0` と負の数は拒否されます。図が実行できない意図として読めるためです。

これは見た目だけの指定です。ポートも結線も一覧表も変わりません。**すべての `gap` を消した図は、同じ系統を表します。**

### メタ情報

```khm
device rec "HyperDeck" as recorder {
  in  SDI : sdi
  @model  "HyperDeck Studio HD Mini"
  @serial "ABC12345"
  @note   "収録は ProRes 422 固定"
}
```

`@` で始まる任意のキーを持てる。描画には出ないが、エクスポートや機器表に載る。

---

## 6. `group` — まとまり

```khm
group stage "ステージ" {
  device cam1 "SONY FX3" as camera { out SDI : sdi }
  device mic1 "SM58" as microphone { out OUT : xlr }
}
```

設置場所・ラック・系統などのまとまりを表す。図では枠で囲まれる。
ネストは v0.1 では **1階層まで**。

---

## 7. 結線

```text
<機器>.<ポート> <矢印> <機器>.<ポート> : <信号種別> <修飾子>*
```

`group` は `group` を入れられる。会場の中にステージとラックがあり、ステージの中にカメラがある。
現場を歩く人にとってはどちらの階層も実在し、**箱が実際に置かれている場所を指すのは一番内側**である。

```khm
group venue "3ホール" {
  group stage "ステージ" { device cam "FX3" as camera { out SDI : sdi } }
  group rack  "ラック"   { device sw "ATEM" as switcher { in 1 : sdi } }
}
```

機材が属するのは、それが書かれた `group` であって親ではない。機材表に出るのは一番内側の名前で
ある。人が歩いていく先がそこだからである。

### 矢印

| 記法  | 意味                             |
| ----- | -------------------------------- |
| `->`  | 単方向（信号の流れ）             |
| `<->` | 双方向（Dante / LAN / 制御など） |
| `--`  | 方向を持たない（電源など）       |

### 修飾子

修飾子は順不同で、いくつでも省略できる。

| 記法           | 意味                   | 例                            |
| -------------- | ---------------------- | ----------------------------- |
| `<長さ>`       | ケーブル長             | `10m` `30cm` `2.5m` `3ft`     |
| `"<ラベル>"`   | ケーブル番号・名称     | `"V-01"`                      |
| `via "<部材>"` | 変換ケーブル・アダプタ | `via "HDMI-DVI 変換ケーブル"` |
| `[k=v, …]`     | 任意の属性             | `[connector=BNC, color=blue]` |

ケーブル長は**数値に単位を続けた裸のトークン**で書く。単位は `mm` `cm` `m` `in` `ft`。
`#` は行コメント専用なので、長さの前には付けない。

```khm
cam1.SDI    -> sw.1        : sdi   10m "V-01"
mic1.OUT    -> mixer.CH1   : xlr   5m  "A-01" [connector=XLR]
mixer.DANTE <-> netsw.1    : dante
pdu.1       -- rack1.AC    : ac
pc.HDMI     -> mon.DVI     : hdmi  via "HDMI-DVI 変換ケーブル"
```

### `over` — 何が何に乗っているか

ポートは物理である。RJ45 の口であり、無線機である。そこを何が通るかは結線ごとの選択で、
今日は NDI、明日は Dante かもしれない。`over` はその両方を書く。

```khm
device cam "PTZ" as camera   { out WIFI : wifi }
device ap  "AP"  as router   { io WIFI : wifi  out LAN : lan }
device pc  "PC"  as computer { in LAN : lan }
device dsk "卓"  as mixer    { in DANTE : lan }

cam.WIFI -> ap.WIFI   : ndi   over wifi [ch=36]
ap.LAN   -> pc.LAN    : ndi   over lan 10m "N-01"
ap.LAN   -> dsk.DANTE : dante over lan 15m "N-02"
```

**物理は搬送が決める。** コネクタ、巻くケーブルがあるのか選ぶチャンネルがあるのか、
そして両端が繋がるかどうか。**積荷は図が語る対象**であり、凡例に出るのはこちらである。

同じ NDI が2度、それぞれ正しい姿で現れる。

| 番号 | 送出 | 受け | 信号  | 長さ  | コネクタ |
| ---- | ---- | ---- | ----- | ----- | -------- |
| —    | PTZ  | AP   | NDI   | ch 36 | —        |
| N-01 | AP   | PC   | NDI   | 10m   | RJ45     |
| N-02 | AP   | 卓   | Dante | 15m   | RJ45     |

`over` を書かなければ、信号は自分自身の搬送であり、これまでどおりに振る舞う。
`: sdi 30m` は変わらないし、これからも変わらない。

無線区間に長さを書けば指摘され、有線区間にチャンネルを書いても指摘される。
どちらも同じ誤りで、別種の行から写してきたものである。

---

### ケーブルの色

`[color=…]` でケーブルの外被色を指定できる。指定した線はその色で描かれ、
**信号種別ごとの既定色より優先される**。

```khm
cam1.SDI -> sw.1 : sdi 30m "V-01" [color=青]
cam2.SDI -> sw.2 : sdi 30m "V-02" [color=赤]
mic1.OUT -> mixer.CH1 : xlr [color="#0af"]
```

これは見た目の好みではなく、**現場で線を識別するための実体情報**である。同じ SDI でも
「青の1番」「赤の2番」で呼び分けるため、指定した色は資材表にも残る。

色名は日英どちらでも書ける。

| 日本語 | 英語     | 日本語 | 英語     |
| ------ | -------- | ------ | -------- |
| 赤     | `red`    | 紫     | `purple` |
| 青     | `blue`   | 黒     | `black`  |
| 緑     | `green`  | 白     | `white`  |
| 黄     | `yellow` | 灰     | `gray`   |
| 橙     | `orange` | 茶     | `brown`  |
| 桃     | `pink`   |        |          |

`#0af` `#00aaff` のような16進表記も使える。解釈できない値は診断（`invalid-value`）になり、
そのまま描画に流し込まれることはない。

なお凡例は**信号種別**の既定色を示し続ける。個々のケーブルの色は別の情報なので混ぜない。

### `adapter` — ケーブルではなく分岐点

`adapter` は**節点**である。図がそこで一度止まり、複数の結線が集まる場所を作る。
分岐がまさにそれで、だから節点が要る。

```khm
adapter split "TRRS 分岐ケーブル" {
  io  HS  : trrs35
  out HP  : trs35
  in  MIC : trs35
}

phone.HS -> split.HS  : trrs35
split.HP -> hp.IN     : trs35
mic.OUT  -> split.MIC : trs35
```

機器表ではなく変換部材表に載る。ヘッドセット分岐をラックに積む人はいない。
触れている結線はプラグの抜き差しであって持っていくケーブルではないので、ケーブル表には出ない。
長さかケーブル番号を書けばケーブルになる。

```khm
split.HP -> hp.IN : trs35            # 直挿し
split.HP -> hp.IN : trs35 5m "A-02"  # 5m のケーブル。表に載る
split.HP -> hp.IN : trs35 "A-02"     # 長さは未計測だがケーブル
```

**端が2つのものは分岐点ではない。** 変換ケーブルは切れ目のない1本であり、`adapter` で
書くと存在しない停留点を途中に作る。1個の物が3つに割れる。端が2つなら指摘が出るので、
結線側に書く。

```khm
# 誤り: 1本のケーブルの途中に節点を作ってしまう
adapter hd "HDMI-DVI 変換ケーブル" { in IN : hdmi  out OUT : dvi }
pc.HDMI -> hd.IN   : hdmi
hd.OUT  -> mon.DVI : dvi

# 正しい
pc.HDMI -> mon.DVI : hdmi 2m "V-02" via "HDMI-DVI 変換ケーブル"
```

---

#### どの端が差し込み口か

端の数ではない。USB-HDMI 変換は端が2つで、これは分岐点である。USB 側は生えていて、
HDMI 側はソケットで、そこに届くケーブルは誰かが持っていく1本である。HDMI-DVI ケーブルも
端は2つで、こちらは切れ目のない1本である。

> **adapter に触れる結線は、長さかケーブル番号が書かれていなければ一体である。**

この1つの規則が表を決め、以下のすべてを決める。

```khm
adapter dg "USB-HDMI 変換アダプタ" {
  in  USB  : usb
  out HDMI : hdmi
}

pc.USB  -> dg.USB   : usb              # 一体。ケーブル表に出ない
dg.HDMI -> mon.HDMI : hdmi 2m "V-01"   # ソケット。持っていくケーブル1本
```

端がいくつでも同じである。4分岐の XLR ケーブルで尻尾がすべて成型なら、ケーブル表は0行。
4口の分配パネルなら4行になる。

すべての端が一体な adapter は、それ自体が結線である。端が2つならそれはケーブルなので
指摘が出て `via` に導かれる。端が3つ以上なら導く先が無い（1本の結線に3つの端は持てない）
ので、そのままでよい。

#### まだ測っていない長さ

```khm
a.L -> b.L : xlr 10m "A-01"   # 計測済み
a.R -> b.R : xlr ?m  "A-02"   # ケーブルはある。長さはこれから
a.C -> b.C : xlr     "A-03"   # 長さについて何も言っていない
```

長さを省くことは元からできたが、その空欄は2つの意味を同時に持っていた。「まだ測っていない」と
「誰も考えていない」である。van に積む人が見る表では、片方だけが残っている仕事である。

単位は書く。どの単位で測るかは未定の対象ではないからである。`?m`、`?ft`、その他この言語が
知っている単位すべてが使える。

長さであることに変わりはないので、無線区間では拒否され、adapter の端はソケットになる。

---

### `via` — 結線の中に挟まる部材

```khm
pc.HDMI -> mon.DVI : hdmi 2m  "V-02" via "HDMI-DVI 変換ケーブル"
cam.SDI -> mon.SDI : sdi  30m "V-01" via "BNC-RCA 変換"
```

この2つは似ているが同じではない。**前者が指すのは1個の物で、そのケーブルが結線そのもの**である。
後者は2個で、30m の SDI ケーブルと、その端に付ける変換アダプタである。

区別のために何かを書く必要はない。互換判定が既に知っている。判定は「この組み合わせに要る
変換ケーブル」を名指しするからである。両端が食い違う結線では、その部材はケーブル自身なので
ケーブル表の変換部材欄にだけ出る。両端が一致する結線では別の物なので、部材表にも載る。

|                                              | ケーブル表            | 変換部材表  |
| -------------------------------------------- | --------------------- | ----------- |
| `hdmi` → `dvi` `via "HDMI-DVI 変換ケーブル"` | 結線1行。部材名を併記 | —           |
| `sdi` → `sdi` `via "BNC-RCA 変換"`           | 結線1行。部材名を併記 | アダプタ1行 |

`via` は警告を黙らせるための道具ではなく、**部材を資材表に載せるための宣言**である。

- **パッシブで成立する組み合わせ**（HDMI↔DVI、DP→HDMI など）… `via` を書けば診断は消える。
  書かなくても警告し、必要な部材名を結線に併記する。
- **パッシブでは成立しない組み合わせ**（SDI→HDMI など）… `via` を書いても診断は消えない。
  変換器は電源の要る箱なので、図には**機器**として置く。

### 複数結線の一括記述

左右のポート数が一致する場合、対応する順に結線される。

```khm
mixer.(L, R) -> amp.(IN_L, IN_R) : trs
```

上は次と等価。

```khm
mixer.L -> amp.IN_L : trs
mixer.R -> amp.IN_R : trs
```

---

## 8. 信号種別

結線に書く `: <信号種別>` は **ケーブルの種類**を表す。互換性の判定（§9）は、これではなく
**両端のポート宣言の型**に対して行われる。リンクに書いた型は、型を宣言していない側の
穴埋めにのみ使われる。

```khm
device ext   as converter { out CAT : hdbaset }
device netsw as router    { io  1..8 : lan }

# `: hdbaset` と書いても判定は hdbaset(出力) 対 lan(入力) で行われ、警告が出る
ext.CAT -> netsw.1 : hdbaset
```

この優先順位が逆だと、リンクの型が両端を代弁してしまい、常に自分自身との比較になって
**どんな不一致も検出できなくなる**。両端とも型を宣言していない場合にのみ、リンクの型が
両端に適用される。

組み込みの `generic` は「未指定」を表し、何とでも互換とみなされる。走り書き段階の図が
警告だらけになるのを避けるため。

### 組み込み信号種別

#### 映像 (`video`)

`sdi` `hdmi` `dp` `dvi` `vga` `composite` `component` `hdbaset` `ndi` `st2110` `fiber`

#### 音響 (`audio`)

`xlr` `trs` `trs35` `trrs` `trrs35` `rca` `speakon` `aes` `dante` `madi` `adat` `spdif` `optical`

#### 制御 (`control`)

`rs232` `rs422` `rs485` `dmx` `midi` `gpio` `ir`

#### ネットワーク (`network`)

`lan` `usb`

#### 電源 (`power`)

`ac` `dc` `poe` `usbpd`

#### 同期 (`sync`)

`genlock` `wordclock` `timecode`

#### 無線

`wifi` `bluetooth` `uhf`（ワイヤレスマイク） `iem` `wireless-video` `wireless-dmx` `ir`

無線は独立したカテゴリではない。**中身の分類はそのまま**で、伝送媒体だけが違う。
`wireless-video` は映像カテゴリ、`uhf` は音響カテゴリに属し、色もその family のものを使う。
変わるのは描き方と検証だけ。

### 独自の信号種別

```khm
signal madi64 : audio {
  color: "#f59e0b"
  style: solid        # solid | dashed | dotted
  width: 2
  label: "MADI 64ch"
}
```

`: <カテゴリ>` は既存カテゴリのいずれか。省略時は `generic`。

---

## 9. 接続の互換性

kumihimo は結線ごとに、その組み合わせが物理的に成立するかを判定する。
判定は3値で、**理由が必ず付いて回る**。

| 判定           | 意味                               | 扱い     |
| -------------- | ---------------------------------- | -------- |
| `ok`           | 正常な結線                         | 診断なし |
| `lossy`        | 繋がるが何かを失う／変換部材が要る | warning  |
| `incompatible` | 変換器なしでは成立しない           | 診断あり |

判定は次の順で決まる。上にあるものが優先される。

1. **`compat` 宣言**（作者による上書き）
2. **同一の信号種別** → `ok`
3. **コネクタ誤接続表** → `incompatible`
4. **パッシブ変換表** → `via` 有りなら `ok`、無しなら `lossy`
5. **劣化接続表** → `lossy`
6. **相互接続可能グループ** → `ok`
7. どの表にも無い → `incompatible`

3 を 4 より先に見るのが要点である。コネクタが同じというだけの組み合わせを
「変換ケーブルで何とかなる」と誤解させないため。

### コネクタ誤接続

**挿さるのに通らない**組み合わせ。ケーブルは気持ちよく嵌まり、見た目には何も
おかしくなく、そして何も出ない。kumihimo が最も検出したいのはこれである。

| 組み合わせ                | 共有コネクタ | 何が起きるか                           |
| ------------------------- | ------------ | -------------------------------------- |
| `hdbaset` ↔ `lan`         | RJ45         | HDBaseT は Ethernet ではない           |
| `dmx` ↔ `xlr`             | XLR          | 調光制御であって音声ではない           |
| `rca` ↔ `spdif`           | RCA          | アナログとデジタル                     |
| `adat` ↔ `spdif`          | TOSLINK      | プロトコルが違う                       |
| `composite` ↔ `component` | BNC / RCA    | 1線と3線                               |
| `genlock` ↔ `sdi`         | BNC          | 同期基準入力は映像でロックしない       |
| `wordclock` ↔ `sdi`       | BNC          | ワードクロック入力は映像を受け付けない |

### `compat` — 互換性の上書き

現場ごとの基準を、**理由付きで**宣言できる。

```khm
compat aes -> xlr : ok      "社内標準: 10m 以下は許容"
compat xlr -> rca : lossy   "レベル差に注意、必ずDIを挟む"
```

`compat` は設定であると同時にドキュメントである。付与した理由は診断メッセージにも
資材表にも載るので、「なぜこの結線を許したのか」が図から失われない。

既定では左右対称に適用される。片方向だけにしたい場合は明示する。

```khm
compat dp -> hdmi : ok "DP++ 対応ソースのみ" [symmetric=false]
```

---

## 10. 暗黙の機器・ポート

宣言されていない機器やポートを結線で参照した場合、kumihimo はそれを
**暗黙に生成**し、診断を出す。

```khm
cam1.SDI -> sw.1 : sdi    # sw を device 宣言していない
```

これは走り書き段階の利便性のためであり、完成した図では全機器を宣言することを推奨する。
厳格さの度合いは設定で変更できる（§10）。

---

## 11. 診断

| コード                 | 内容                                   | 既定    |
| ---------------------- | -------------------------------------- | ------- |
| `implicit-device`      | 未宣言の機器を参照した                 | warning |
| `implicit-port`        | 未宣言のポートを参照した               | warning |
| `signal-mismatch`      | 両端のポートの信号種別が違う           | warning |
| `adapter-required`     | 変換ケーブルが要るが未宣言             | warning |
| `adapter-insufficient` | `via` を書いたがパッシブでは不可       | error   |
| `direction-mismatch`   | 出力→出力 / 入力→入力 を結線した       | error   |
| `duplicate-connection` | 同一ポート対を二重に結線した           | warning |
| `port-overbooked`      | 1つの入力ポートに複数の出力が入った    | error   |
| `unknown-signal`       | 未定義の信号種別を指定した             | error   |
| `unconnected-port`     | どこにも繋がっていないポート           | off     |
| `duplicate-id`         | 機器 id の重複                         | error   |
| `parse-error`          | 構文として読めなかった                 | error   |
| `invalid-port-spec`    | 展開できない範囲指定                   | error   |
| `unknown-device-kind`  | 描けない機器種別                       | warning |
| `invalid-value`        | 形は正しいが値が使えない               | error   |
| `unresolved-import`    | `use` の指すファイルが見つからない     | error   |
| `unknown-model`        | どのライブラリにもないモデル名         | error   |
| `ignored-in-import`    | 取り込んだファイルに機器・結線があった | warning |

**例外は投げません。** 各段階は診断を集めて最善の結果を返すので、不備のある図もそのまま描かれます。
不備を見つけるために必要なのは、まさにその「不備を含んだ絵」だからです。

### 言語

診断は既定で**英語**です。各入口が `locale` を受け取ります。

```ts
compile(source, { locale: 'ja' });
parse(source, { locale: 'ja' });
buildModel(document, { locale: 'ja' });
loadDocument(source, { locale: 'ja' });
```

対応するのは `en` と `ja` で、それ以外は空文字ではなく英語に落ちる。凡例の信号名、
変換部材表の部材名、互換性判定の理由も同じ `locale` に従う。

診断は描画済みの文面に加えて `key` と `params` を持つので、コンパイルし直さずに
別の言語で描き直せる。

```ts
formatMessage(diagnostic.key, diagnostic.params, 'ja');
```

作図者が自分の `compat` 宣言に書いた理由はそのまま通す。他人が書いた文面を翻訳するのは
このライブラリの仕事ではない。

コマンドラインだけは英語既定の例外で、`LC_ALL` → `LC_MESSAGES` → `LANG` の順に環境を見る
（`--lang` で上書き）。もともと日本語で出ていたものが更新で黙って英語になるのは、
機能ではなく後退だからである。

---

## 12. 完全な例

```khm
diagram "配信スタジオ 系統図" {
  direction: LR
}

group stage "ステージ" {
  device cam1 "SONY FX3"   as camera     { out SDI : sdi }
  device cam2 "SONY FX30"  as camera     { out SDI : sdi }
  device mic1 "SM58"       as microphone { out OUT : xlr }
  device mic2 "SM58"       as microphone { out OUT : xlr }
}

group rack "メインラック" {
  device sw "ATEM Mini Extreme" as switcher {
    in  1..8   : sdi
    out PGM    : sdi
    in  AUDIO_L, AUDIO_R : trs
    out STREAM : lan
    io  CTRL   : lan
  }

  device mixer "Yamaha DM3" as mixer {
    in  CH[1..16] : xlr
    out L, R      : xlr
    io  DANTE     : dante
    @model "DM3 Standard"
  }

  device rec "HyperDeck Studio HD Mini" as recorder {
    in  SDI : sdi
  }

  device pc "配信PC" as computer {
    in  LAN : lan
  }
}

# 映像
cam1.SDI -> sw.1 : sdi 30m "V-01"
cam2.SDI -> sw.2 : sdi 30m "V-02"
sw.PGM   -> rec.SDI : sdi 2m "V-10"

# 音響
mic1.OUT -> mixer.CH1 : xlr 20m "A-01"
mic2.OUT -> mixer.CH2 : xlr 20m "A-02"
mixer.(L, R) -> sw.(AUDIO_L, AUDIO_R) : trs 3m

# 配信
sw.STREAM -> pc.LAN : lan 5m "N-01"
```

---

## 整形

```sh
kumihimo fmt studio.khm            # その場で整形する
kumihimo fmt studio.khm --check    # 整形済みでなければ失敗する
kumihimo fmt studio.khm --stdout   # 書き換えず標準出力に出す
```

VS Code ではエディタ標準の「ドキュメントのフォーマット」として動くので、保存時の整形も効く。

整形の内容は、入れ子による字下げ、要素間を1スペース、そして**似た行が続くところで桁を揃える**。
最後が要点である。ラックの一覧は列を目で追って読むもので、名前を1つ直すたびに列は崩れる。

```khm
device sw "ATEM Mini Extreme" as switcher {
  in  1..8             : sdi
  in  AUDIO_L, AUDIO_R : trs
  out PGM              : sdi  # 本線
  out STREAM           : lan
}

cam1.SDI -> sw.1       : sdi 30m "V-01"
mic1.OUT -> sw.AUDIO_L : xlr 20m "A-01"
```

揃える範囲は、空行・単独のコメント行・行の形が変わるところで切れる。読み手が列を追うのを
やめる場所だからである。桁はブロックごとに独立しているので、ある機器の名前を長くしても
別の機器は動かない。

それ以外に行を組み替えることはない。文を繋げも分けもしない。唯一の例外は、`{` と `}` が
行をまたぐブロックで、この場合だけ括弧を独立した行にする。1行に収まっているブロックは
そのまま残る。

```khm
# 行をまたぐので括弧を独立させる
adapter hd "HDMI-DVI 変換ケーブル"{in IN:hdmi
out OUT:dvi}

# 1行に収まっているのでそのまま
device a as mixer { in X : xlr }
```

コメントは書かれた行に残り、文字列の中の `#` は文字列のままである。整形でファイルの意味は
変わらない。テストは文字列ではなく、整形前後のモデルを比べてそれを確かめている。

`--no-align` を付けると要素間が1スペースになる。差分は見やすく、読みにくくなる。

---

## 13. 無線

無線区間はケーブルではない。長さもコネクタも発注する部材も存在しないので、
kumihimo はそれらを要求せず、代わりに**周波数・チャンネル**を持たせる。

```khm
mic.RF   -> rx.RF1 : uhf [ch=38]
iemtx.RF -> iem.RF : iem [freq="470.125MHz"]
cam.RF   -> vrx.RF : wireless-video [freq="5.8GHz"]
mixer.WIFI <-> ap.WIFI : wifi [freq="5GHz"]
```

| 記法       | 意味           |
| ---------- | -------------- |
| `[freq=…]` | 周波数         |
| `[ch=…]`   | チャンネル番号 |

周波数は有線の「ケーブル長」に相当する。**現場でリンクを成立させるために必要な事実**であり、
2系統が同じ値を使えば干渉するという点でも同じ役割を持つ。

### 表

無線区間は**無線表**に出る。ケーブル表には出ない。以前はケーブル表に出ていた。「無線も系統の
一部で、誰かが周波数を確認しなければならない」という理由からで、それ自体は正しい。ただしそれは
「一覧に載せる理由」であって「その表に載せる理由」ではない。ケーブル表は van に積む人が見る紙で
あり、長さもコネクタも巻くものも無い行は、**測り忘れたケーブル**にしか読めない。

2枚の紙は別の人が別のものを探して読む。届く長さがあるか、と、同じチャンネルが2系統で
重なっていないか、である。

```
kumihimo export show.khm cable    --stdout   # 引くもの
kumihimo export show.khm wireless --stdout   # 調整するもの
```

無線表には**乗り物**の列がある。`over` で信号自身とは違う搬送が書かれたときに埋まる。
無線 LAN 経由の NDI は「NDI が WiFi に乗っている」1行で、名前は中身のもの、周波数は乗り物の
ものである。列が分かれているのはそのためである。

### 描画

無線区間には**電波マーク**が描かれ、線は長い破線になる。信号 family が実線でも
（`wireless-video` は映像なので本来は実線）、無線は必ず破線になる。
図の上でケーブルと混同されてはならないため。

### 検証

- **無線と有線を直結できない。** 送受信機が要る。これは電源を要する能動機器なので、
  変換ケーブル（`via`）では解決せず、**機器として図に置く**のが正しい。
- **無線区間にケーブル長を書くと診断が出る。** コピー&ペーストの取りこぼしを拾うため。
- **無線区間に `via` は挟めない。** 電波にアダプタは付かない。

```khm
# 誤り: 受信機を通さず卓に直結している
mic.RF -> mixer.CH1 : uhf

# 正しい: 受信機を機器として置く
device rx "ワイヤレス受信機" as interface {
  in  RF  : uhf
  out CH1 : xlr
}
mic.RF -> rx.RF     : uhf [ch=38]
rx.CH1 -> mixer.CH1 : xlr 3m
```

独自の無線信号は `wireless: true` で宣言できる。

```khm
signal my_radio : audio {
  wireless: true
  label: "自社無線"
}
```

---

## 14. 機材ライブラリ

同じ機材のポート定義を図ごとに書き直すのは現実的でない。`model` で機材を定義し、
`use` で取り込み、`device … from` で実体化する。

### `model` — 機材の定義

```khm
# lib/yamaha.khm
model dm3 "Yamaha DM3" as mixer {
  in  CH[1..16] : xlr
  out L, R      : xlr
  io  DANTE     : dante
  @vendor "Yamaha"
}
```

`model` は「世の中に存在する機材」であって、図の上の1台ではない。
`device … from` で名指しされるまで図には現れない。

### `use` — ライブラリの取り込み

```khm
use "./lib/yamaha.khm"
use "./lib/blackmagic.khm"
```

パスは **`use` を書いたファイルからの相対**で解決される。同じファイルは何度たどっても
1回しか読まれないので、循環参照でも停止する。

`use` が取り込むのは **`model` / `signal` / `compat` のみ**。ライブラリ側に書かれた
`device` や結線は取り込まれず、診断（`ignored-in-import`）が出る。ライブラリは
「存在する機材」を記述するものであって、「この図の配線」ではないため。

### `device … from` — 実体化

```khm
device mixer from dm3                    # そのまま使う
device mixer2 from dm3 "予備卓"          # ラベルだけ差し替え
device mixer3 from dm3 { in AUX : xlr }  # ポートを追加
```

機器側に書いたものが model より優先される。ポートは**置き換えではなく追加**なので、
1台だけ拡張カードが入っている、といった状況をそのまま書ける。

同名の `model` をローカルに宣言すれば、ライブラリを編集せずに上書きできる。

---

## 15. v0.1 の範囲外（将来）

- ラック実装図（`rack R1 42U { 40U: sw 3U }`）と RU 単位のレイアウト
- 1リンクが運ぶチャンネル数の表現（Dante 64ch など）
- 複数ファイルの取り込み（`include`）
- 2階層以上のグループのネスト
- ケーブル自動採番
