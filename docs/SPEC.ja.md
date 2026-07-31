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
`microphone` `amplifier` `computer` `converter` `matrix` `patchbay` `router`
`interface` `generic`

### ポート宣言

```text
in   <ポート指定> : <信号種別>          # 入力
out  <ポート指定> : <信号種別>          # 出力
io   <ポート指定> : <信号種別>          # 双方向（Dante / LAN など）
```

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

### `via` — 変換ケーブル・アダプタ

パッシブな変換ケーブルやアダプタが途中に入ることを宣言する。

```khm
pc.HDMI -> mon.DVI : hdmi via "HDMI-DVI 変換ケーブル"
```

`via` は警告を黙らせるための道具ではなく、**部材を資材表に載せるための宣言**である。
図ではリンク上に変換マークが描かれ、ケーブル表にアダプタが行として出る。

- **パッシブで成立する組み合わせ**（HDMI↔DVI、DP→HDMI など）… `via` を書けば診断は消える。
  書かなくても「変換ケーブルが必要」と警告し、必要な部材名を教える。
- **パッシブでは成立しない組み合わせ**（SDI→HDMI など）… `via` を書いても診断は消えない。
  これは変換器（電源を要する能動機器）が要るケースなので、ケーブルの属性ではなく
  **機器として図に置く**のが正しい。

```khm
# 誤り: 変換ケーブルでは SDI は HDMI にならない
cam.SDI -> mon.HDMI : sdi via "SDI-HDMI 変換"

# 正しい: 変換器を機器として配置する
device conv "BMD Mini Converter SDI-HDMI" as converter {
  in  SDI  : sdi
  out HDMI : hdmi
}
cam.SDI   -> conv.SDI  : sdi
conv.HDMI -> mon.HDMI  : hdmi
```

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

`xlr` `trs` `rca` `speakon` `aes` `dante` `madi` `adat` `spdif` `optical`

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

| コード                 | 内容                                | 既定    |
| ---------------------- | ----------------------------------- | ------- |
| `implicit-device`      | 未宣言の機器を参照した              | warning |
| `implicit-port`        | 未宣言のポートを参照した            | warning |
| `signal-mismatch`      | 両端のポートの信号種別が違う        | warning |
| `adapter-required`     | 変換ケーブルが要るが未宣言          | warning |
| `adapter-insufficient` | `via` を書いたがパッシブでは不可    | error   |
| `direction-mismatch`   | 出力→出力 / 入力→入力 を結線した    | error   |
| `duplicate-connection` | 同一ポート対を二重に結線した        | warning |
| `port-overbooked`      | 1つの入力ポートに複数の出力が入った | error   |
| `unknown-signal`       | 未定義の信号種別を指定した          | error   |
| `unconnected-port`     | どこにも繋がっていないポート        | off     |
| `duplicate-id`         | 機器 id の重複                      | error   |

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
