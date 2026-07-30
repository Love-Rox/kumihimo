import { KumihimoEditor } from '@love-rox/kumihimo-editor';
import '@love-rox/kumihimo-editor/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './main.css';

const SAMPLE = `diagram "配信スタジオ 系統図" {
  direction: LR
}

group stage "ステージ" {
  device cam1 "SONY FX3"  as camera     { out SDI : sdi }
  device cam2 "SONY FX30" as camera     { out SDI : sdi }
  device mic1 "SM58"      as microphone { out OUT : xlr }
}

group rack "メインラック" {
  device sw "ATEM Mini Extreme" as switcher {
    in  1..8             : sdi
    in  AUDIO_L, AUDIO_R : trs
    out PGM              : sdi
    out STREAM           : lan
  }
  device mixer "Yamaha DM3" as mixer {
    in  CH[1..16] : xlr
    out L, R      : xlr
  }
  device rec "HyperDeck" as recorder { in SDI : sdi }
  device pc  "配信PC"    as computer { in LAN : lan }
}

# 映像
cam1.SDI -> sw.1 : sdi 30m "V-01" [color=青]
cam2.SDI -> sw.2 : sdi 30m "V-02" [color=赤]
sw.PGM   -> rec.SDI : sdi 2m "V-10"

# 音響
mic1.OUT -> mixer.CH1 : xlr 20m "A-01"
mixer.(L, R) -> sw.(AUDIO_L, AUDIO_R) : trs 3m

# 配信
sw.STREAM -> pc.LAN : lan 5m "N-01"
`;

createRoot(document.querySelector('#root')!).render(
  <StrictMode>
    <main>
      <h1>kumihimo playground</h1>
      <p>
        <code>@love-rox/kumihimo-editor</code> の開発用ハーネス。
      </p>
      <KumihimoEditor initialSource={SAMPLE} />
    </main>
  </StrictMode>,
);
