// 背景音樂：整首用 Web Audio 即時合成——有旋律、和弦、低音、節奏，不是單純的環境音。
// 沒有任何取樣或外部音檔，所以沒有版權問題（實況主可以直接開台玩，不會被消音）。
// 曲子：A 小調、72 BPM、8 小節循環，和弦走 Am–F–C–G ／ Am–F–C–E。
// 音色走洞窟：長殘響、木質的打點、低頻嗡鳴墊底，偶爾一聲滴水。
// 用法：GoblinAudio.start()（要等使用者第一次點擊）、.setMood('idle'|'chat'|'end'|'good')、.ding()、.setMuted(v)
(function (root) {
  const ROOT = 55;                 // A1
  const BPM = 72, BEAT = 60 / BPM, BAR = BEAT * 4;
  const n = (semi, oct) => ROOT * Math.pow(2, oct + semi / 12);

  // 和弦（相對 A 的半音）與每小節的低音根音
  const CHORDS = [
    { ch: [0, 3, 7],   bass: 0 },   // Am
    { ch: [8, 12, 15], bass: 8 },   // F
    { ch: [3, 7, 10],  bass: 3 },   // C
    { ch: [10, 14, 17],bass: 10 },  // G
    { ch: [0, 3, 7],   bass: 0 },   // Am
    { ch: [8, 12, 15], bass: 8 },   // F
    { ch: [3, 7, 10],  bass: 3 },   // C
    { ch: [7, 11, 14], bass: 7 },   // E（大三和弦，回到 Am 比較有力）
  ];

  // 主旋律：[第幾拍, 半音, 八度, 幾拍長]
  const MELODY = [
    [[0,7,2,1],[1,0,3,1],[2,3,3,1],[3,2,3,1]],
    [[0,0,3,1],[1,3,3,1],[2,0,3,1],[3,10,2,1]],
    [[0,10,2,1],[1,7,2,1],[2,10,2,1],[3,0,3,1]],
    [[0,2,3,1],[1,0,3,1],[2,10,2,1],[3,7,2,1]],
    [[0,7,2,1],[1,0,3,1],[2,3,3,1],[3,7,3,1]],
    [[0,5,3,1],[1,3,3,1],[2,0,3,1],[3,10,2,1]],
    [[0,7,3,1],[1,5,3,1],[2,3,3,1],[3,2,3,1]],
    [[0,2,3,1],[1,11,2,1],[2,0,3,2]],
  ];

  const MOODS = {
    //        旋律  和弦  低音  打點  滴水  嗡鳴  旋律八度位移
    idle: { mel: 0.085, pad: 0.05, bass: 0.10, perc: 0.05, drip: 1, drone: 0.05, shift: 0, tilt: 2200 },
    chat: { mel: 0.040, pad: 0.07, bass: 0.12, perc: 0.07, drip: 0, drone: 0.08, shift: -1, tilt: 1300 },
    end:  { mel: 0.055, pad: 0.06, bass: 0.09, perc: 0.00, drip: 1, drone: 0.09, shift: -1, tilt: 900 },
    good: { mel: 0.100, pad: 0.06, bass: 0.10, perc: 0.06, drip: 1, drone: 0.04, shift: 1, tilt: 3200 },
  };

  let ctx, master, wet, tone, mood = MOODS.idle, bar = 0, nextBarTime = 0, timer = null, muted = false, drone;
  const rnd = (a, b) => a + Math.random() * (b - a);

  // 洞窟殘響：拿雜訊自己做一條脈衝響應，不需要音檔
  function reverb(sec, decay) {
    const len = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const pre = i < ctx.sampleRate * 0.02 ? 0 : 1;
        d[i] = pre * (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    const cv = ctx.createConvolver(); cv.buffer = b; return cv;
  }
  function noiseBuf(sec) {
    const len = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + (Math.random() * 2 - 1) * 0.12) * 0.96; d[i] = last; }
    return b;
  }
  function out(node, send) { node.connect(master); const g = ctx.createGain(); g.gain.value = send; node.connect(g); g.connect(wet); }

  // ---- 樂器 ----
  function playPluck(freq, t, dur, vol) {           // 主旋律：撥弦
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = freq;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = freq * 2; o2.detune.value = 4;
    const o2g = ctx.createGain(); o2g.gain.value = 0.25;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(mood.tilt, t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(300, mood.tilt * 0.25), t + dur * 0.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.5);
    o.connect(lp); o2.connect(o2g); o2g.connect(lp); lp.connect(g);
    out(g, 0.5);
    o.start(t); o.stop(t + dur * 1.6); o2.start(t); o2.stop(t + dur * 1.6);
  }
  function playPad(semis, t, dur, vol) {            // 和弦：慢起慢落的墊音
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.35);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    for (const s of semis) {
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator(); o.type = 'triangle';
        o.frequency.value = n(s, 2); o.detune.value = det;
        o.connect(lp); o.start(t); o.stop(t + dur + 0.1);
      }
    }
    lp.connect(g); out(g, 0.6);
  }
  function playBass(semi, t, dur, vol) {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = n(semi, 1);
    const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = n(semi, 1); o2.detune.value = -8;
    const o2g = ctx.createGain(); o2g.gain.value = 0.3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); o2.connect(o2g); o2g.connect(g); out(g, 0.25);
    o.start(t); o.stop(t + dur + 0.05); o2.start(t); o2.stop(t + dur + 0.05);
  }
  function playPerc(t, vol) {                        // 木頭敲擊，當拍子
    const s = ctx.createBufferSource(); s.buffer = noiseBuf(0.2);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = rnd(1100, 1500); bp.Q.value = 7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    s.connect(bp); bp.connect(g); out(g, 0.5);
    s.start(t); s.stop(t + 0.15);
  }
  function playDrip(t) {                             // 洞窟滴水，偶爾一聲
    const o = ctx.createOscillator(); o.type = 'sine';
    const f = rnd(1100, 2100);
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.45, t + 0.11);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.055, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    o.connect(g); out(g, 0.9);
    o.start(t); o.stop(t + 0.3);
  }

  // ---- 排程：每次排一整個小節，提前 0.4 秒 ----
  function scheduleBar(i, t) {
    const c = CHORDS[i % 8], m = MELODY[i % 8];
    playPad(c.ch, t, BAR * 0.95, mood.pad);
    playBass(c.bass, t, BEAT * 1.6, mood.bass);
    playBass(c.bass, t + BEAT * 2, BEAT * 1.3, mood.bass * 0.75);
    if (mood.perc) { playPerc(t + BEAT, mood.perc); playPerc(t + BEAT * 3, mood.perc * 0.8); }
    for (const [beat, semi, oct, dur] of m) {
      if (mood.mel <= 0.001) break;
      playPluck(n(semi, oct + mood.shift), t + beat * BEAT, dur * BEAT, mood.mel * rnd(0.85, 1.1));
    }
    if (mood.drip && Math.random() < 0.45) playDrip(t + rnd(0.2, BAR - 0.4));
  }
  function pump() {
    if (!ctx) return;
    while (nextBarTime < ctx.currentTime + 0.4) {
      scheduleBar(bar++, nextBarTime);
      nextBarTime += BAR;
    }
  }

  root.GoblinAudio = {
    start() {
      if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = muted ? 0 : 0.42;
      master.connect(ctx.destination);
      const rv = reverb(3.2, 2.6);
      wet = ctx.createGain(); wet.gain.value = 0.38;
      wet.connect(rv); rv.connect(master);
      // 低頻嗡鳴：洞窟本身
      const dg = ctx.createGain(); dg.gain.value = mood.drone;
      const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 300; dlp.Q.value = 4;
      for (const [s, det] of [[0, -5], [7, 4]]) {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = n(s, 0); o.detune.value = det;
        const og = ctx.createGain(); og.gain.value = s ? 0.4 : 1;
        o.connect(og); og.connect(dlp); o.start();
      }
      dlp.connect(dg); dg.connect(master);
      drone = dg;
      nextBarTime = ctx.currentTime + 0.15; bar = 0;
      pump(); timer = setInterval(pump, 120);
    },
    setMood(name) {
      const m = MOODS[name]; if (!m) return;
      mood = m;
      if (drone && ctx) drone.gain.linearRampToValueAtTime(m.drone, ctx.currentTime + 1.2);
    },
    ding() {                                    // 來訊提示：兩顆音的小鈴鐺
      if (!ctx || muted) return;
      const t = ctx.currentTime;
      [[1318.5, 0], [1975.5, 0.12]].forEach(([f, d]) => {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t + d);
        g.gain.exponentialRampToValueAtTime(0.14, t + d + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.7);
        o.connect(g); out(g, 0.6);
        o.start(t + d); o.stop(t + d + 0.8);
      });
    },
    setMuted(v) {
      muted = !!v;
      if (master && ctx) master.gain.linearRampToValueAtTime(muted ? 0 : 0.42, ctx.currentTime + 0.3);
    },
    isMuted() { return muted; },
    // 離線算整首（給預覽／匯出用；遊戲本身用不到）
    _pumpTo(t) { while (nextBarTime < t) { scheduleBar(bar++, nextBarTime); nextBarTime += BAR; } },
    _moods: MOODS, _setMoodRaw(m) { mood = MOODS[m] || mood; },
  };
})(window);
