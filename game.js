window.PORTRAIT_ATLAS = {"cols": 6, "rows": 3, "ext": "webp?v=94998291-001311", "index": {"d_newbie": 0, "d_arrow": 1, "d_run": 2, "d_human": 3, "d_selfquest": 4, "d_screenshot": 5, "d_tank": 6, "d_science": 7, "d_bro": 8, "d_landlord": 9, "d_kindness": 10, "d_guard": 11, "d_glowup": 12, "d_cold": 13, "d_starve": 14, "d_scare": 15, "d_honeytrap": 16, "g_alone": 17}};
// 哥布林桌寵——遊戲邏輯
(function () {
  const S = window.SCENARIO;
  const SAVE_KEY = 'goblin-pet-v1';
  const STAT_MAX = { str: 10, int: 10, cha: 10, gold: 300, food: 10, energy: 10, glam: 10 };
  const ENERGY_REGEN_MS = 3 * 60 * 1000;   // 每 3 分鐘回 1 體力
  const desktop = window.goblinDesktop || null;

  const $ = (id) => document.getElementById(id);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // ---------- 存檔 ----------
  function freshGoblin(gender, keep) {
    // 作者血脈：只有哥布林（男）抽得到，解鎖化妝與偽娘結局
    const blood = gender === 'm' && Math.random() < (S.meta.bloodlineChance || 0);
    return {
      gender,
      dead: false,            // 這一世是否已經結束（死了就不再跑 tick）
      stats: { str: 0, int: 0, cha: 0, gold: 10, food: 8, energy: 10, glam: 0 },
      blood,
      // 偽娘結局要化妝練滿（10 次 × 8 金），抽到血汗薪資（平均 5 金）等於要工作 16 次，
      // 一輩子平均只活 8.5 封訊息，根本做不完。有血脈就跳過最低那一檔。
      wage: rollWage(blood),  // 出生時抽到的薪資 { amount, label }
      job: 'goblin',
      graveyard: keep ? (keep.graveyard || []) : [],   // 遺照牆：每一隻死掉的哥布林
      lastFoodTick: Date.now(),
      starvedAt: null,
      fateDone: false,        // 這一世是否已經遇過月老
      fateFullUsed: false,    // 三圍全滿的那條觸發，每一世只給一次（拒絕後也不會再給）
      seen: {},               // 這一世已經出現過的 thread id；thread 的 requires 會看這個
      milestoneDone: {},      // 已經觸發過的里程碑結局
      survived: 0,
      generation: keep ? keep.generation + 1 : 1,
      unlocked: keep ? keep.unlocked : {},
      pending: null,          // 等待回覆的來訊 { threadId, node, log:[...] }
      nextMsgAt: null,
      lastTick: Date.now(),
      opts: keep ? keep.opts : { notify: true, fast: false },
    };
  }
  function rollWage(blood) {
    const table = S.economy.wageTable.filter((w) => !(blood && w.poor));
    const total = table.reduce((n, w) => n + w.p, 0);          // 少一檔之後把機率重新歸一
    const r = Math.random() * total; let acc = 0;
    for (const w of table) { acc += w.p; if (r <= acc) return { amount: Math.round(rand(w.range[0], w.range[1])), label: w.label }; }
    const w = table[0]; return { amount: Math.round(rand(w.range[0], w.range[1])), label: w.label };
  }
  let state = null;
  function load() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { return null; } }
  function save() { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); }

  // ---------- 文字在地化（哥布美） ----------
  // 一次掃過、長詞優先，避免替換結果又被下一條替換（例：抱得美人歸→嫁給帥哥，不能再被 帥哥→美女 吃掉）
  // ---------- 語言 ----------
  const I18N = window.I18N;
  const LANG_KEY = 'goblin-pet-lang';
  let LANG = 'zh';
  try { const v = localStorage.getItem(LANG_KEY); if (v && I18N.LANGS.includes(v)) LANG = v; } catch {}
  function setLang(l) {
    if (!I18N.LANGS.includes(l) || l === LANG) return;
    try { localStorage.setItem(LANG_KEY, l); } catch {}
    location.reload();           // 結果都已經寫進存檔，重載是安全的
  }
  // 性別替換表（每種語言一份）；英文用詞界，免得 her 吃掉 here
  const SWAPS = Object.fromEntries(I18N.LANGS.map((l) => {
    const pairs = l === 'zh' ? S.femaleSwap : (I18N.SWAP[l] || []);
    const esc = (a) => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const src = pairs.map(([a]) => a).sort((x, y) => y.length - x.length)
      .map((a) => (/^[A-Za-z]/.test(a) ? '\\b' + esc(a) + '\\b' : esc(a))).join('|');
    return [l, { map: Object.fromEntries(pairs), re: new RegExp(src, 'g') }];
  }));
  // 劇本字串：中文原文當 key 查英文，查不到就留中文（看得出哪裡還沒翻）
  function L(text) {
    let t = text;
    if (LANG !== 'zh') { const e = I18N.TXT[text]; if (e != null) t = e[LANG] != null ? e[LANG] : (typeof e === 'string' ? e : text); }
    if (!state || state.gender !== 'f') return t;
    const sw = SWAPS[LANG];
    return t.replace(sw.re, (m) => sw.map[m]);
  }
  // 介面字串：key + {變數}
  function T(key, vars) {
    const tbl = I18N.UI[LANG] || I18N.UI.zh;
    let out = tbl[key] != null ? tbl[key] : I18N.UI.zh[key];
    if (out == null) return key;
    if (vars) for (const [k, v] of Object.entries(vars)) out = out.split('{' + k + '}').join(v);
    return out;
  }
  // index.html 裡標了 data-i18n / data-i18n-html / data-i18n-title 的靜態文字
  function applyStaticI18n() {
    document.documentElement.lang = LANG === 'en' ? 'en' : 'zh-Hant';
    for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = T(el.dataset.i18n);
    for (const el of document.querySelectorAll('[data-i18n-html]')) el.innerHTML = T(el.dataset.i18nHtml);
    for (const el of document.querySelectorAll('[data-i18n-title]')) el.title = T(el.dataset.i18nTitle);
    for (const el of document.querySelectorAll('[data-i18n-ph]')) el.placeholder = T(el.dataset.i18nPh);
    document.title = T('title');
  }

  // ---------- 職業 ----------
  function meets(req) { return Object.entries(req).every(([k, v]) => state.stats[k] >= v); }
  // 路線制：只看目前職業的 next 清單，先達標的先轉；成金往王走用 kingReq（金幣）而不是三圍
  function nextJob() {
    const by = Object.fromEntries(S.jobs.map((j) => [j.id, j]));
    const cur = by[state.job] || by.goblin;
    for (const id of cur.next || []) {
      const req = (id === 'king' && cur.kingReq) ? cur.kingReq : by[id].req;
      if (meets(req)) return id;
    }
    return null;
  }
  function jobName(id) { return L(S.jobs.find((j) => j.id === id).name); }
  function checkJobChange() {
    const nj = nextJob();
    if (nj && nj !== state.job) {
      state.job = nj;
      const j = S.jobs.find((x) => x.id === nj);
      say(T('job_change', { name: L(j.name), desc: L(j.desc) }), 5000);
      renderPet();
      setTimeout(() => face('confident', 3000), 300);
    }
  }

  // ---------- 畫面 ----------
  let bubbleTimer = null;
  function say(text, ms = 3000) {
    const b = $('bubble');
    b.textContent = text; b.classList.remove('hidden');
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => b.classList.add('hidden'), ms);
  }
  // 遺照：依「結局 × 性別 × 職業」找圖，一層層退回：
  //   assets/portrait_<結局>_<性別>_<職業>.png → portrait_<結局>_<性別>.png → portrait_<結局>.png → 角色圖的頭部
  // 黑白＋黑框；非死亡結局維持彩色
  function renderPortrait(box, gender, jobId, bw, endId) {
    box.innerHTML = '';
    const inner = document.createElement('div'); inner.className = 'portrait' + (bw ? ' bw' : ' color');
    box.appendChild(inner);
    // 網頁版把 252 張遺照打包成每個「性別＋職業」一張圖集（PORTRAIT_ATLAS），省掉幾百個請求
    const atlas = window.PORTRAIT_ATLAS;
    if (atlas && endId && atlas.index[endId] != null) {
      const i = atlas.index[endId], col = i % atlas.cols, row = (i / atlas.cols) | 0;
      const cell = document.createElement('div'); cell.className = 'atlasPortrait';
      cell.style.backgroundImage = `url(assets/atlas_${gender}_${jobId}.${atlas.ext})`;
      cell.style.backgroundSize = `${atlas.cols * 100}% ${atlas.rows * 100}%`;
      cell.style.backgroundPosition = `${(col / (atlas.cols - 1)) * 100}% ${(row / (atlas.rows - 1)) * 100}%`;
      inner.appendChild(cell); inner.classList.add('hasPortrait');
      return;
    }
    const cands = endId ? [`assets/portrait_${endId}_${gender}_${jobId}.webp?v=94998291-001311`, `assets/portrait_${endId}_${gender}.webp?v=94998291-001311`, `assets/portrait_${endId}.webp?v=94998291-001311`] : [];
    const tryNext = () => {
      if (!cands.length) { window.renderPortraitImg(inner, jobId, gender); return; }
      const img = new Image(); img.alt = '';
      img.onload = () => { inner.innerHTML = ''; inner.appendChild(img); inner.classList.add('hasPortrait'); };
      img.onerror = tryNext;
      img.src = cands.shift();
    };
    tryNext();
  }
  function renderPet() { window.renderGoblin($('pet'), state.job, state.gender); }
  function face(expr, ms) { return window.setFace($('pet'), expr, ms); }
  // 依序播放幾個表情：[[expr, ms], ...]
  function faceSeq(seq) {
    let t = 0;
    for (const [e, ms] of seq) { setTimeout(() => face(e, ms), t); t += ms; }
  }
  function renderStats() {
    for (const el of document.querySelectorAll('.stat')) {
      const k = el.dataset.stat;
      if (k === 'glam') {
        el.classList.toggle('hidden', !state.blood);
        el.parentElement.classList.toggle('hasGlam', !!state.blood);
      }
      const v = state.stats[k];
      el.querySelector('i').style.width = Math.min(100, (v / STAT_MAX[k]) * 100) + '%';
      el.querySelector('b').textContent = v;
    }
    $('jobName').textContent = jobName(state.job);
    $('dayCount').textContent = T('day_count', { gen: state.generation, wage: state.wage.amount, label: L(state.wage.label), n: state.survived });
    for (const btn of document.querySelectorAll('#actions button')) {
      const a = S.actions.find((x) => x.id === btn.dataset.action);
      btn.disabled = (a.energy < 0 && state.stats.energy < -a.energy) || (a.cost && state.stats.gold < a.cost);
    }
    const hasMsg = !!state.pending;
    $('badge').classList.toggle('hidden', !hasMsg);
    $('btnInbox').classList.toggle('alert', hasMsg);
  }
  function renderActions() {
    const box = $('actions'); box.innerHTML = '';
    const setCols = () => box.classList.toggle('n7', box.children.length === 7);
    for (const a of S.actions) {
      if (a.blood && !(state && state.blood)) continue;     // 沒有作者血脈就沒有化妝
      const b = document.createElement('button');
      b.dataset.action = a.id;
      b.innerHTML = `<span class="ic">${a.icon}</span>${L(a.name)}<small>${a.cost ? T('act_cost', { n: a.cost }) : a.stat === 'gold' ? T('act_wage') : a.energy > 0 ? T('act_energy') : T('act_free')}</small>`;
      useIcon(b, a.id);
      b.onclick = () => doAction(a);
      box.appendChild(b);
    }
    setCols();
  }
  // 有畫好的圖示就換掉 emoji；沒有就維持 emoji，兩種都不會壞
  function useIcon(btn, name) {
    const span = btn.querySelector('.ic');
    if (!span) return;
    const im = new Image();
    im.onload = () => { span.innerHTML = ''; span.appendChild(im); span.classList.add('hasIcon'); };
    im.alt = '';
    im.src = `assets/icon_${name}.webp?v=94998291-001311`;
  }

  function showOverlay(id) {
    for (const o of document.querySelectorAll('.overlay')) o.classList.add('hidden');
    if (id) $(id).classList.remove('hidden');
  }

  // ---------- 動作 ----------
  let busy = false;
  function doAction(a) {
    if (busy) return;
    if (a.energy < 0 && state.stats.energy < -a.energy) { say(T('too_tired')); return; }
    if (a.cost && state.stats.gold < a.cost) { say(T('no_money', { name: L(a.name), cost: a.cost })); return; }
    busy = true;
    if (!state.seen) state.seen = {};
    state.seen['act:' + a.id] = true;      // thread 的 requires 可以指定 'act:gym'
    if (a.cost) state.stats.gold -= a.cost;
    state.stats.energy = Math.max(0, Math.min(STAT_MAX.energy, state.stats.energy + a.energy));
    let line = L(pick(a.lines));
    if (a.stat === 'gold') {
      const s = state.stats;
      let g = state.wage.amount + Math.round(rand(-2, 3)) + Math.floor(s.int / 3);
      if (state.job === 'king') g *= 2; else if (state.job === 'tycoon') g = Math.round(g * 1.5);
      g = Math.max(1, g);
      s.gold = Math.min(STAT_MAX.gold, s.gold + g);
      line += T('gain_gold', { n: g });
    } else if (a.stat === 'food') {
      state.stats.food = Math.min(STAT_MAX.food, state.stats.food + S.economy.mealFood);
    } else if (a.stat) {
      const gained = Math.random() < 0.75 ? 1 : 0;
      state.stats[a.stat] = Math.min(STAT_MAX[a.stat], state.stats[a.stat] + gained);
      if (!gained) line += T('no_progress');
    }
    if (a.id !== 'eat' && a.id !== 'sleep') state.stats.food = Math.max(0, state.stats.food - 1);
    const app = $('app');
    app.classList.remove('idle'); app.classList.add('act-' + a.id);
    $('zzz').classList.toggle('hidden', a.id !== 'sleep');
    say(L(line), 2600);
    const FACE_SEQ = {
      gym: [['angry', 1200], ['serious', 700]],
      read: [['think', 1200], ['serious', 700]],
      dress: [['confident', 1200], ['shy', 700]],
      work: [['serious', 1200], ['happy', 700]],
      eat: [['happy', 1900]],
      sleep: [['sleep', 3100]],
      makeup: [['shy', 1100], ['confident', 900]],
    };
    if (FACE_SEQ[a.id]) faceSeq(FACE_SEQ[a.id]);
    setTimeout(() => {
      app.classList.remove('act-' + a.id); app.classList.add('idle');
      $('zzz').classList.add('hidden');
      busy = false;
      checkJobChange(); renderStats(); save();
    }, a.id === 'sleep' ? 3200 : 1900);
  }

  // ---------- 來訊排程 ----------
  function interval() {
    const r = state.opts.fast ? S.meta.fastIntervalMs : S.meta.messageIntervalMs;
    return rand(r[0], r[1]);
  }
  function scheduleNext() { state.nextMsgAt = Date.now() + interval(); save(); }
  // thread 可以宣告 requires: ['merchant'] 或 requires: ['act:gym']——
  // 前者是「那個 thread 這一世出現過」，後者是「玩家這一世做過那個動作」，
  // 都滿足了這個 thread 才會被抽到。用在有前後關係的對話
  // （老皮的「二代人類套裝」要先買過初代；教練的「你上次來做了三下」要先去過健身房）。
  function gated(t) { return !!(t.requires || t.minSurvived || t.maxStats || t.jobIs || t.afterSeen); }
  function ready(t) {
    if (!state) return !gated(t);
    // minSurvived：活過幾封訊息才會出現，用在需要鋪陳的後期事件（魔王戰）
    if (t.minSurvived && state.survived < t.minSurvived) return false;
    // jobIs：限定還沒轉職的那一隻（魔王戰的主角是弱小的普通哥布林）
    if (t.jobIs && state.job !== t.jobIs) return false;
    // maxStats：嚴格小於。{ str: 2 } = 力量必須小於 2
    if (t.maxStats) for (const [k, v] of Object.entries(t.maxStats)) if (state.stats[k] >= v) return false;
    // afterSeen：某條支線出現過，而且之後又活了幾則才輪到這條
    if (t.afterSeen) {
      const at = state.seenAt && state.seenAt[t.afterSeen.id];
      if (at == null || state.survived < at + t.afterSeen.gap) return false;
    }
    if (!t.requires || !t.requires.length) return true;
    const seen = state.seen || {};
    return t.requires.every((id) => seen[id]);
  }
  function pickThread() {
    const rare = S.threads.filter((t) => t.rare && ready(t));
    let normal = S.threads.filter((t) => !t.rare && !t.fate && ready(t));
    const fate = S.threads.find((t) => t.fate);
    if (fate && !state.fateDone && Math.random() < (S.meta.fateChance || 0)) return fate;
    if (rare.length && Math.random() < S.meta.rareChance) return pick(rare);
    if (!normal.length) normal = S.threads.filter((t) => !t.rare && !t.fate && !gated(t));
    const total = normal.reduce((n, t) => n + t.weight, 0);
    let r = Math.random() * total;
    for (const t of normal) { r -= t.weight; if (r <= 0) return t; }
    return normal[normal.length - 1];
  }
  function newMessage(forced) {
    const t = forced || pickThread();
    if (t.fate) state.fateDone = true;   // 拒絕後會被 closeThread 放回 false，但 fateFullUsed 不會，所以月老只能靠隨機那條回來
    if (!state.seen) state.seen = {};        // 舊存檔沒有這個欄位
    if (!state.seenAt) state.seenAt = {};
    state.seen[t.id] = true;
    if (state.seenAt[t.id] == null) state.seenAt[t.id] = state.survived;   // 第一次遇到是第幾則，afterSeen 用
    state.pending = { threadId: t.id, node: 'start', log: [], shown: false };
    save(); renderStats();
    const first = L(t.nodes.start.text[0]);
    const name = L(t.sender.name);
    say(T('new_msg', { name }), 4000);
    face('surprised', 4000);
    if (window.GoblinAudio) window.GoblinAudio.ding();     // 叮咚
    if (state.opts.notify) notify(name, first);
  }
  function notify(title, body) {
    if (desktop) { desktop.notify(title, body); return; }
    if ('Notification' in window && Notification.permission === 'granted') {
      const n = new Notification(title, { body });
      n.onclick = () => { window.focus(); openChat(); };
    }
  }
  function tick() {
    if (!state || state.dead) return;   // 已經結束的一世不再推進，否則會一直重複觸發同一個結局
    const now = Date.now();
    // 離線／閒置回體力
    const elapsed = now - state.lastTick;
    if (elapsed >= ENERGY_REGEN_MS) {
      const n = Math.floor(elapsed / ENERGY_REGEN_MS);
      state.stats.energy = Math.min(STAT_MAX.energy, state.stats.energy + n);
      state.lastTick = now - (elapsed % ENERGY_REGEN_MS);
      renderStats(); save();
    }
    // 飽食隨時間下降；歸零撐一段時間就餓死
    const fe = now - (state.lastFoodTick || now);
    if (fe >= S.economy.foodDecayMs) {
      const n = Math.floor(fe / S.economy.foodDecayMs);
      state.stats.food = Math.max(0, state.stats.food - n);
      state.lastFoodTick = now - (fe % S.economy.foodDecayMs);
      renderStats(); save();
    }
    if (state.stats.food <= 0) {
      if (!state.starvedAt) { state.starvedAt = now; say(T('hungry'), 5000); face('angry', 5000); save(); }
      else if (now - state.starvedAt >= S.economy.starveGraceMs) { state.pending = null; finish('d_starve'); return; }
    } else if (state.starvedAt) { state.starvedAt = null; save(); }
    // 里程碑結局（程式觸發，不走對話支線）
    if (!state.pending && $('endScreen').classList.contains('hidden')) {
      const md = state.milestoneDone || (state.milestoneDone = {});
      // 妝練滿 → 偽娘哥布林（只有抽到作者血脈的哥布林走得到）
      if (state.blood && !md.g_idol && state.stats.glam >= STAT_MAX.glam) { md.g_idol = true; save(); finish('g_idol'); return; }
      // 活過 30 封訊息沒死 → 大魔法師哥布林
      if (!md.g_archmage && state.survived >= (S.meta.archmageAt || 30)) { md.g_archmage = true; save(); finish('g_archmage'); return; }
    }

    // 三圍全滿：月老直接來（每世一次）
    const fateT = S.threads.find((t) => t.fate);
    if (!state.pending && fateT && !state.fateDone && !state.fateFullUsed && (S.meta.fateFullStats || []).every((k) => state.stats[k] >= STAT_MAX[k])) { state.fateFullUsed = true; newMessage(fateT); return; }
    if (!state.pending && now >= state.nextMsgAt) newMessage();
    else if (!state.pending && Math.random() < 0.08 && $('bubble').classList.contains('hidden') && !busy) { say(L(pick(S.idleLines)), 2500); face(pick(['happy', 'wink', 'think']), 2500); }
    else if (!busy && Math.random() < 0.04) face('happy', 1200);
  }

  // ---------- 聊天 ----------
  function thread() { return S.threads.find((t) => t.id === state.pending.threadId); }
  function addMsg(cls, text) {
    const d = document.createElement('div');
    d.className = 'msg ' + cls; d.textContent = text;
    $('chatLog').appendChild(d);
    $('chatLog').scrollTop = 1e6;
  }
  function openChat() {
    if (!state.pending) { say(T('no_msg')); return; }
    const t = thread();
    // NPC 頭像：assets/npc_<thread id>_<玩家性別>.png → npc_<thread id>.png → emoji（精靈會依玩家性別換人）
    const av = $('chatAvatar'); av.textContent = t.sender.avatar;
    const avc = [`assets/npc_${t.id}_${state.gender}.webp?v=94998291-001311`, `assets/npc_${t.id}.webp?v=94998291-001311`];
    const im = new Image(); im.onload = () => { av.textContent = ''; im.className = 'npcImg'; av.appendChild(im); };
    im.onerror = () => { if (avc.length) im.src = avc.shift(); }; im.src = avc.shift();
    $('chatName').textContent = L(t.sender.name);
    $('chatKind').textContent = { adventurer: T('kind_adventurer'), elf: L(T('kind_elf')), goblin: L(T('kind_goblin')), monster: T('kind_monster'), god: T('kind_god') }[t.sender.kind] || '';
    $('chatLog').innerHTML = ''; $('chatChoices').innerHTML = '';
    for (const m of state.pending.log) addMsg(m.cls, m.text);
    if (state.pending.node === '__end') { finish(state.pending.end); return; }   // 結果已經定了
    if (state.pending.node === '__done') { closeThread(state.pending.again); return; }   // 中途重開：這段已經結束，回遊戲
    if (state.pending.node === '__jiao') { openJiao(); return; }
    if (window.GoblinAudio) window.GoblinAudio.setMood('chat');
    showOverlay('chatScreen');
    playNode(state.pending.node, state.pending.shown);
  }
  function playNode(nodeId, alreadyShown) {
    const t = thread(); const node = t.nodes[nodeId];
    const elfCls = t.sender.kind === 'elf' ? ' elf' : '';
    const lines = alreadyShown ? [] : node.text.map(L);
    let i = 0;
    const typing = document.createElement('div'); typing.className = 'typing'; typing.textContent = T('typing');
    const step = () => {
      typing.remove();
      if (i < lines.length) {
        const text = lines[i++];
        addMsg('them' + elfCls, text); state.pending.log.push({ cls: 'them' + elfCls, text });
        if (i < lines.length) { $('chatLog').appendChild(typing); $('chatLog').scrollTop = 1e6; setTimeout(step, 700 + text.length * 25); }
        else { state.pending.shown = true; save(); renderChoices(node); }
      } else renderChoices(node);
    };
    if (lines.length) { $('chatLog').appendChild(typing); setTimeout(step, 500); } else step();
  }
  function renderChoices(node) {
    const box = $('chatChoices'); box.innerHTML = '';
    node.choices.forEach((c, idx) => {
      const b = document.createElement('button');
      b.textContent = L(c.label);
      b.onclick = () => choose(node, idx);
      box.appendChild(b);
    });
  }
  function condOk(cond) {
    if (!cond) return true;
    if (cond.job) return state.job === cond.job;
    if (cond.stat) return state.stats[cond.stat] >= cond.min;
    return true;
  }
  function choose(node, idx) {
    const c = node.choices[idx];
    $('chatChoices').innerHTML = '';
    addMsg('me', L(c.label)); state.pending.log.push({ cls: 'me', text: L(c.label) });
    let r = null;
    for (const cand of c.results) {
      if (cand.cond && !condOk(cand.cond)) continue;
      if (cand.prob != null && Math.random() >= cand.prob) continue;
      r = cand; break;
    }
    if (!r) r = c.results[c.results.length - 1];
    if (r.gain) for (const [k, v] of Object.entries(r.gain)) state.stats[k] = Math.max(0, Math.min(STAT_MAX[k], state.stats[k] + v));
    if (r.next === '__jiao') {
      state.pending.node = '__jiao'; state.pending.shown = true;
      // 劇本可以指定這次丟幾次、以及聖筊數對應到哪
      state.pending.jiao = { throws: [], n: (r.jiao && r.jiao.n) || JIAO_DEFAULT_N, map: r.jiao && r.jiao.map };
      save(); setTimeout(openJiao, 400);
    }
    else if (r.next) { state.pending.node = r.next; state.pending.shown = false; save(); setTimeout(() => playNode(r.next, false), 400); }
    else if (r.done) { state.pending.node = '__done'; state.pending.again = !!r.fateAgain; save(); setTimeout(() => closeThread(r.fateAgain), 500); }   // 不是結局：關掉對話回遊戲
    else { state.pending.node = '__end'; state.pending.end = r.end; save(); setTimeout(() => finish(r.end), 500); }   // 先存結果，中途重開不能重骰
  }

  // ---------- 擲筊小遊戲：擲五次，數聖筊 ----------
  // 每擲：聖筊 1/2、笑筊 1/4、陰筊 1/4（跟真的筊一樣）
  const JIAO_DEFAULT_N = 5;
  // 這一次擲筊要丟幾次：由劇本的 { next: '__jiao', jiao: { n, map } } 決定
  function jiaoN() { return (state.pending && state.pending.jiao && state.pending.jiao.n) || JIAO_DEFAULT_N; }
  function jiaoRoll() {
    const a = Math.random() < 0.5, b = Math.random() < 0.5;   // true=平面朝上
    return a !== b ? 'sheng' : (a ? 'xiao' : 'yin');
  }
  // ---- 畫面 ----
  // 背景（月老反應）：assets/jiao_<offer|spin|sheng|xiao|yin|win>.png
  // 筊本體是 sprite：assets/jiaoP_flat.png / jiaoP_round.png / jiaoP_spin.png，會飛會落地
  function jiaoArt(key) {
    const im = $('jiaoArt'); const src = `assets/jiao_${key}.webp?v=94998291-001311`;
    if (im.getAttribute('src') === src) return;
    im.setAttribute('src', src); im.classList.remove('swap'); void im.offsetWidth; im.classList.add('swap');
  }
  // 依結果擺好兩個筊：聖＝一平一凸、笑＝兩平、陰＝兩凸
  function jiaoFaces(r) {
    const f = 'assets/jiaoP_flat.webp?v=94998291-001311', o = 'assets/jiaoP_round.webp?v=94998291-001311';
    return r === 'sheng' ? [f, o] : r === 'xiao' ? [f, f] : [o, o];
  }
  function jiaoSetPieces(r, spin) {
    const [a, b] = spin ? ['assets/jiaoP_spin.webp?v=94998291-001311', 'assets/jiaoP_spin.webp?v=94998291-001311'] : jiaoFaces(r);
    $('jiaoP1').src = a; $('jiaoP2').src = b;
  }

  function openJiao() {
    const j = state.pending.jiao || (state.pending.jiao = { throws: [] });
    const dots = $('jiaoDots'); dots.innerHTML = '';
    for (let i = 0; i < jiaoN(); i++) { const d = document.createElement('span'); d.className = 'dot ' + (j.throws[i] || ''); dots.appendChild(d); }
    const n = j.throws.filter((x) => x === 'sheng').length;
    $('jiaoCount').textContent = T('jiao_count', { n, N: jiaoN() });
    const done = j.throws.length >= jiaoN();
    $('jiaoHint').textContent = done ? '' : T('jiao_h' + Math.min(4, j.throws.length));
    const btn = $('jiaoBtn');
    const isFate = thread() && thread().fate;          // 只有月老用他專屬的文案
    btn.textContent = done ? T(isFate ? 'jiao_btn_done' : 'jiao_btn_done_x') : T('jiao_btn');
    const head = document.querySelector('#jiaoScreen .chatHead div div');
    if (head) head.textContent = T(isFate ? 'jiao_head' : 'jiao_head_x');
    btn.disabled = false;
    btn.onclick = done ? jiaoFinish : jiaoThrow;
    const last = j.throws[j.throws.length - 1];
    jiaoArt(j.throws.length === 0 ? 'offer' : (done && n >= jiaoN()) ? 'win' : last);
    jiaoSetPieces(last || 'sheng', false);
    $('jiaoStage').className = 'jiaoStage';
    jiaoReset();
    jiaoBindGestures();
    showOverlay('jiaoScreen');
  }

  // ---- 手勢：往上滑丟出去，或搖裝置 ----
  let jiaoBound = false, jiaoDrag = null, jiaoBusy = false, shakeLast = 0;
  function jiaoReset() {
    for (const id of ['jiaoP1', 'jiaoP2']) { const e = $(id); e.style.transform = ''; e.style.opacity = ''; }
  }
  function jiaoNudge(dx, dy) {
    const p = Math.max(-60, Math.min(0, dy));              // 只吃往上拉
    for (const [id, s] of [['jiaoP1', -1], ['jiaoP2', 1]]) {
      $(id).style.transform = `translate(${dx * .25 * s}px, ${p * .5}px) rotate(${p * .3 * s}deg)`;
    }
  }
  function jiaoBindGestures() {
    if (jiaoBound) return; jiaoBound = true;
    const st = $('jiaoStage');
    st.addEventListener('pointerdown', (e) => {
      if (jiaoBusy || state.pending.jiao.throws.length >= jiaoN()) return;
      jiaoDrag = { x: e.clientX, y: e.clientY, t: Date.now() };
      st.classList.add('dragging'); st.setPointerCapture(e.pointerId);
    });
    st.addEventListener('pointermove', (e) => {
      if (!jiaoDrag) return;
      jiaoNudge(e.clientX - jiaoDrag.x, e.clientY - jiaoDrag.y);
    });
    const up = (e) => {
      if (!jiaoDrag) return;
      const dy = e.clientY - jiaoDrag.y, dt = Date.now() - jiaoDrag.t;
      st.classList.remove('dragging'); jiaoDrag = null;
      // 往上滑超過 24px、而且夠快，就算擲出去
      if (dy < -24 && dt < 700) jiaoThrow(); else { jiaoReset(); }
    };
    st.addEventListener('pointerup', up);
    st.addEventListener('pointercancel', () => { jiaoDrag = null; st.classList.remove('dragging'); jiaoReset(); });
    // 搖一搖（手機／筆電有加速度計時）
    window.addEventListener('devicemotion', (e) => {
      const a = e.accelerationIncludingGravity; if (!a) return;
      const m = Math.abs(a.x || 0) + Math.abs(a.y || 0) + Math.abs(a.z || 0);
      if (m > 34 && Date.now() - shakeLast > 1200) {
        shakeLast = Date.now();
        if (!jiaoBusy && !$('jiaoScreen').classList.contains('hidden') && state.pending && state.pending.jiao
            && state.pending.jiao.throws.length < jiaoN()) jiaoThrow();
      }
    });
  }

  function jiaoThrow() {
    const j = state.pending.jiao; if (!j || j.throws.length >= jiaoN() || jiaoBusy) return;
    jiaoBusy = true;
    const btn = $('jiaoBtn'); btn.disabled = true;
    const st = $('jiaoStage'); st.classList.remove('landed'); st.classList.add('flying');
    const r = jiaoRoll();
    j.throws.push(r); save();                   // 先存這一擲，動畫中途重開不能重骰
    jiaoArt('spin'); jiaoSetPieces(r, true);
    face('think', 1400);
    // 兩個筊各自拋出去：飛高 → 轉 → 落地
    const anims = [['jiaoP1', -1], ['jiaoP2', 1]].map(([id, s], i) => $(id).animate([
      { transform: 'translate(0,0) rotate(0) scale(1)' },
      { transform: `translate(${s * 26}px, -104px) rotate(${s * 420}deg) scale(1.16)`, offset: .45 },
      { transform: `translate(${s * 18}px, 2px) rotate(${s * 760 + (i ? 8 : -8)}deg) scale(1)` },
    ], { duration: 1050, easing: 'cubic-bezier(.33,.1,.55,1)', fill: 'forwards' }));
    setTimeout(() => {
      jiaoSetPieces(r, false);                    // 空中是旋轉圖，落地換成正／反面
      anims.forEach((a) => { try { a.commitStyles(); a.cancel(); } catch (_) {} });
      st.classList.remove('flying'); st.classList.add('landed');
      const allSheng = j.throws.length >= jiaoN() && j.throws.every((x) => x === 'sheng');
      jiaoArt(allSheng ? 'win' : r);
      if (allSheng) { const ry = $('jiaoRays'); ry.classList.remove('hidden', 'show'); void ry.offsetWidth; ry.classList.add('show'); }
      const dots = $('jiaoDots').children; dots[j.throws.length - 1].className = 'dot ' + r;
      const n = j.throws.filter((x) => x === 'sheng').length;
      $('jiaoCount').textContent = T('jiao_count', { n, N: jiaoN() });
      $('jiaoHint').textContent = { sheng: T('jiao_sheng'), xiao: T('jiao_xiao'), yin: T('jiao_yin') }[r];
      face(r === 'sheng' ? 'happy' : r === 'xiao' ? 'surprised' : 'angry', 1500);
      const done = j.throws.length >= jiaoN();
      const isFate = thread() && thread().fate;          // 只有月老用他專屬的文案
    btn.textContent = done ? T(isFate ? 'jiao_btn_done' : 'jiao_btn_done_x') : T('jiao_btn');
    const head = document.querySelector('#jiaoScreen .chatHead div div');
    if (head) head.textContent = T(isFate ? 'jiao_head' : 'jiao_head_x');
      btn.onclick = done ? jiaoFinish : jiaoThrow;
      btn.disabled = false; jiaoBusy = false;
      if (!done) setTimeout(() => { jiaoReset(); st.classList.remove('landed'); }, 900);
    }, 1050);
  }
  // map 是「聖筊數 → 去哪」：{ '5': 'jiao5', '4': 'jiao4', '0': 'jiao3' }
  // 查的時候從實際聖筊數往下找最接近的一階，所以不用把每個數字都列出來。
  // 值可以是節點名，或 { end: 'xxx' } 直接結束。
  function jiaoPick(map, n) {
    const keys = Object.keys(map).map(Number).sort((a, b) => b - a);
    for (const k of keys) if (n >= k) return map[k];
    return map[keys[keys.length - 1]];
  }
  function jiaoFinish() {
    const j = state.pending.jiao;
    const n = j.throws.filter((x) => x === 'sheng').length;
    const map = j.map || { 5: 'jiao5', 4: 'jiao4', 0: 'jiao3' };   // 沒指定就是月老那一套
    const to = jiaoPick(map, n);
    if (to && to.end) { state.pending.node = '__end'; state.pending.end = to.end; save(); finish(to.end); return; }
    state.pending.node = to; state.pending.shown = false; save();
    openChat();
  }
  // 這段對話結束，但這一世沒有結束：不跳結局畫面，直接回遊戲等下一則訊息
  function closeThread(fateAgain) {
    state.pending = null;
    state.survived += 1;
    if (fateAgain) state.fateDone = false;   // 月老說「哪天想通了自己來找我」，所以還能再遇到
    const b = document.createElement('button'); b.textContent = T('back_to_cave'); b.className = 'primary';
    b.onclick = () => { showOverlay(null); };
    $('chatChoices').innerHTML = ''; $('chatChoices').appendChild(b);
    checkJobChange(); scheduleNext(); renderStats(); save();
  }

  function finish(endId) {
    const e = S.endings[endId];
    const text = L(e.text);
    state.pending = null;
    if (e.type === 'alive') {
      state.survived += 1;
      addMsg('sys', '— ' + L(e.name) + ' —'); addMsg('sys', text);
      const b = document.createElement('button'); b.textContent = T('back_to_cave'); b.className = 'primary';
      b.onclick = () => { showOverlay(null); };
      $('chatChoices').appendChild(b);
      checkJobChange(); scheduleNext(); renderStats(); save();
      return;
    }
    // 死亡／好結局／真結局 → 進圖鑑
    const prev = state.unlocked[endId];
    const isNew = !prev;
    const prevCount = typeof prev === 'number' ? prev : (prev ? prev.n : 0);
    state.unlocked[endId] = { n: prevCount + 1, gender: (prev && prev.gender) || state.gender, job: (prev && prev.job) || state.job };
    const scr = $('endScreen');
    scr.className = 'overlay ' + e.type;
    $('endType').textContent = { death: T('end_death'), good: T('end_good'), true: T('end_true') }[e.type];
    $('endName').textContent = L(e.name);
    $('endText').textContent = text;
    // 進到這裡的都是結局（死亡／好／真）＝這一世就到此為止，差別只在有沒有遺照
    const tomb = e.type === 'death' || e.dies;     // 有屍體的才進遺照牆
    // 死亡結局看遺照；好／真結局看那一幕的場景圖（沒有圖才退回角色圖）
    if (e.type === 'death') renderPortrait($('endPortrait'), state.gender, state.job, true, endId);
    else {
      const box = $('endPortrait'); box.innerHTML = '';
      const inner = document.createElement('div'); inner.className = 'portrait color'; box.appendChild(inner);
      const im = new Image(); im.alt = '';
      im.onload = () => { if (inner.dataset.anim) return; inner.innerHTML = ''; inner.appendChild(im); inner.classList.add('hasPortrait'); };
      im.onerror = () => { if (!inner.dataset.anim) renderPortrait(box, state.gender, state.job, tomb, endId); };
      im.src = `assets/ending_${endId}.webp?v=94998291-001311`;
      endingAnim(inner, endId, state.gender);              // 有動畫就播動畫
      inner.classList.add('hasPortrait');
    }
    $('endNew').classList.toggle('hidden', !isNew);
    $('endNew').textContent = isNew ? T('end_new') : '';
    face(e.type === 'death' ? 'surprised' : e.dies ? 'sleep' : 'happy', 0);
    state.dead = true;
    if (tomb) {
      const ep = epitaph(state.stats, state.wage, state.job, state.survived, e);
      state.graveyard = state.graveyard || [];
      if (!state.graveyard.some((x) => x.gen === state.generation)) state.graveyard.push({ gen: state.generation, gender: state.gender, job: state.job, endId, stats: { ...state.stats }, wage: state.wage, survived: state.survived, cause: L(e.name), epitaph: ep, at: Date.now() });
      $('endText').textContent = ep + '\n\n' + text;
    }
    if (e.type === 'death') { $('app').classList.add('hit'); setTimeout(() => $('app').classList.remove('hit'), 900); }
    const btn = $('endBtn');
    btn.textContent = T('rebirth');
    btn.onclick = () => { if (window.GoblinAudio) window.GoblinAudio.setMood('idle'); showOverlay('startScreen'); };   // 每一世重新選性別
    if (window.GoblinAudio) window.GoblinAudio.setMood(e.type === 'good' || e.type === 'true' ? 'good' : 'end');
    save(); showOverlay('endScreen');
  }

  // ---------- 遺照：這是一隻怎樣的哥布林 ----------
  function epitaph(st, wage, job, survived, ending) {
    const s = st; const parts = [];
    const jobName2 = L(S.jobs.find((j) => j.id === job).name);
    if (ending && ending.type !== 'death') return T('ep_old', { job: jobName2 });
    const top = ['str', 'int', 'cha'].sort((a, b) => s[b] - s[a])[0];
    const total = s.str + s.int + s.cha;
    if (total === 0) parts.push(T('ep_none'));
    else if (s[top] >= 7 && s.str + s.int + s.cha - s[top] <= 2) parts.push(T({ str: 'ep_only_str', int: 'ep_only_int', cha: 'ep_only_cha' }[top]));
    else if (s.str >= 4 && s.int >= 4 && s.cha >= 4) parts.push(T('ep_all'));
    else parts.push(T({ str: 'ep_most_str', int: 'ep_most_int', cha: 'ep_most_cha' }[top]));
    if (wage.label === '含金湯匙') parts.push(T('ep_rich'));
    else if (wage.label === '血汗') parts.push(T('ep_wage', { n: wage.amount }));
    if (s.gold >= 150) parts.push(T('ep_saved', { n: s.gold }));
    else if (s.gold === 0) parts.push(T('ep_broke'));
    const life = survived === 0 ? T('ep_life0') : survived >= 10 ? T('ep_life_long', { n: survived }) : T('ep_life', { n: survived });
    return T('ep_line', { parts: parts.join(T('ep_join')), job: jobName2, life });
  }

  // ---------- 遺照牆 ----------
  function openCollection() {
    const list = $('collList'); list.innerHTML = '';
    const g = state.graveyard || [];
    if (!g.length) list.innerHTML = `<p class="hint" style="grid-column:1/-1;text-align:center;padding:30px 0">${T('graves_empty')}</p>`;
    for (const e of [...g].reverse()) {
      const d = document.createElement('div'); d.className = 'coll death';
      const frame = document.createElement('div'); frame.className = 'frame';
      renderPortrait(frame, e.gender, e.job, true, e.endId);
      d.appendChild(frame);
      const cap = document.createElement('div'); cap.className = 'cap';
      cap.innerHTML = `<span class="tag">${T('grave_gen', { gen: e.gen })}</span><span class="nm">${e.epitaph}</span><span class="cnt">${T('grave_cause', { cause: e.cause })}</span>`;
      d.appendChild(cap);
      d.onclick = () => openPortrait(e);          // 點一下看大圖
      list.appendChild(d);
    }
    $('collCount').textContent = T('graves_count', { n: g.length });
    showOverlay('collectionScreen');
  }
  // 遺照放大：點遺照牆上的任何一隻
  function openPortrait(e) {
    const job = S.jobs.find((j) => j.id === e.job);
    $('pvTitle').textContent = T('pv_title', { gen: e.gen, job: job ? (e.gender === 'f' ? L(job.name) : L(job.name)) : '' });
    $('pvSub').textContent = T('grave_cause', { cause: e.cause });
    renderPortrait($('pvArt'), e.gender, e.job, true, e.endId);
    $('pvText').textContent = e.epitaph;
    const st = e.stats || {};
    const wage = e.wage ? T('pv_wage', { n: e.wage.amount, label: L(e.wage.label) }) : '';
    $('pvStats').textContent = `💪${st.str || 0} 📖${st.int || 0} 👔${st.cha || 0} · 💰${st.gold || 0}` +
      (wage ? ` · ${wage}` : '') + T('pv_stats_tail', { n: e.survived || 0 });
    showOverlay('portraitView');
  }

  // ---------- 結局圖鑑：每種結局一張圖（assets/ending_<id>.png），1 次黑白、5 次彩色 ----------
  // 規格書 7.1：死亡結局滿 3 次才上色（並解鎖漫畫，漫畫未到就只上色）；
  // 好結局／真結局第一次達成就彩色（動畫未到先放靜態彩圖）
  const COLOR_AT_DEATH = 3, COLOR_AT_GOOD = 1;
  function colorAt(id) { return S.endings[id] && S.endings[id].type === 'death' ? COLOR_AT_DEATH : COLOR_AT_GOOD; }
  function endingCount(id) { const u = state.unlocked[id]; return typeof u === 'number' ? u : (u ? u.n : 0); }
  // 結局圖：assets/ending_<id>_<性別>.png → ending_<id>.png（性別用第一次解開時的那隻）
  function endingArt(box, id, bw) {
    box.innerHTML = ''; delete box.dataset.anim;
    const u = state.unlocked[id]; const g = (u && u.gender) || state.gender;
    const cands = [`assets/ending_${id}_${g}.webp?v=94998291-001311`, `assets/ending_${id}.webp?v=94998291-001311`];
    const img = new Image(); img.alt = '';
    img.onload = () => { if (box.dataset.anim) return; box.innerHTML = ''; box.appendChild(img); };
    img.onerror = () => { if (box.dataset.anim) return; if (cands.length) img.src = cands.shift(); else box.innerHTML = `<div class="noart">${L(S.endings[id].name)}</div>`; };
    img.src = cands.shift();
    box.classList.toggle('bw', !!bw);
  }
  // 好結局／真結局動畫：assets/anim_<id>_<性別>.mp4 → anim_<id>.mp4；沒有影片就維持靜態圖
  // 無聲、循環、在框內播放；載得到才把框裡的圖換掉
  function endingAnim(box, id, gender) {
    const cands = [`assets/anim_${id}_${gender}.mp4?v=94998291-001311`, `assets/anim_${id}.mp4?v=94998291-001311`];
    const v = document.createElement('video');
    v.muted = true; v.loop = true; v.autoplay = true; v.playsInline = true;
    v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
    v.preload = 'auto';
    v.addEventListener('loadeddata', () => {
      box.dataset.anim = '1'; box.innerHTML = ''; box.appendChild(v);
      const p = v.play(); if (p && p.catch) p.catch(() => {});
    }, { once: true });
    v.addEventListener('error', () => { if (cands.length) v.src = cands.shift(); });
    v.src = cands.shift();
  }
  function openEndings() {
    const grid = $('endingsGrid'); grid.innerHTML = '';
    const entries = Object.entries(S.endings).filter(([, e]) => e.type !== 'alive');
    const order = { true: 0, good: 1, death: 2 };
    entries.sort((a, b) => order[a[1].type] - order[b[1].type]);
    let got = 0;
    for (const [id, e] of entries) {
      const n = endingCount(id); if (n) got++;
      const cell = document.createElement('div');
      cell.className = 'cell ' + e.type + (n ? '' : ' locked');
      const th = document.createElement('div'); th.className = 'thumb';
      if (n) { endingArt(th, id, n < colorAt(id)); const b = document.createElement('span'); b.className = 'n'; b.textContent = '×' + n; th.appendChild(b); }
      else th.innerHTML = '<span class="q">?</span>';
      cell.appendChild(th);
      const nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = n ? L(e.name) : T('locked');
      cell.appendChild(nm);
      if (n) cell.onclick = () => openEndingView(id);
      grid.appendChild(cell);
    }
    $('endingsCount').textContent = `${got} / ${entries.length}`;
    showOverlay('endingsScreen');
  }
  function openEndingView(id) {
    const e = S.endings[id]; const n = endingCount(id);
    $('evName').textContent = L(e.name);
    const at = colorAt(id);
    $('evCount').textContent = T('ev_count', { type: { death: T('end_death'), good: T('end_good'), true: T('end_true') }[e.type], n }) + (n < at ? T('ev_more', { k: at - n }) : '');
    endingArt($('evArt'), id, n < at);
    if (e.type !== 'death' && n >= at) { const u = state.unlocked[id]; endingAnim($('evArt'), id, (u && u.gender) || state.gender); }
    $('evText').textContent = L(e.text);
    // 有漫畫才顯示按鈕；用載入圖片來判斷有沒有這張
    // 漫畫要跟結局圖同一個門檻：死亡結局 3 次、好／真結局 1 次，上色之後才解鎖
    const cb = $('evComic'); cb.classList.add('hidden');
    if (n >= at) {
      const probe = new Image();
      probe.onload = () => { cb.classList.remove('hidden'); cb.onclick = () => openComic(id, probe.src); };
      probe.src = `assets/comic_${id}.webp?v=94998291-001311`;
    }
    showOverlay('endingView');
  }
  // 條漫很長（一整集），單張圖會超過 WebP 的 16383px 上限，所以切成
  // comic_<id>.png、comic_<id>_2.png、_3…… 依序往下接。載到 404 就停。
  function openComic(id, src) {
    $('cvName').textContent = L(S.endings[id].name);
    const sc = $('cvScroll');
    // 先把浮層顯示出來再捲動：display:none 的元素設 scrollTop 無效，
    // 會沿用上一則漫畫的位置，等於一打開就看到別人的最後一格。
    showOverlay('comicView');
    sc.innerHTML = '';
    sc.scrollTop = 0;
    const ext = src.slice(src.lastIndexOf('.'));
    const stem = src.slice(0, src.lastIndexOf('.'));
    const token = (openComic._token = (openComic._token || 0) + 1);
    const addPart = (n) => {
      const img = document.createElement('img');
      img.alt = '';
      img.onload = () => {
        if (token !== openComic._token) return;   // 中途換了一則漫畫
        if (n === 1) sc.scrollTop = 0;
        if (n >= 2) addPart(n + 1);               // 第三段以後才接力，沒有就 onerror 停
      };
      img.onerror = () => { if (n > 1) img.remove(); };
      img.src = n === 1 ? src : stem + '_' + n + ext;
      sc.appendChild(img);                        // 先排好位置，載完才會撐開高度
    };
    // 前兩段同時發請求：第二段不必等第一段（約 2MB）載完才開始，
    // 不然網路慢的時候中間會有幾秒看起來像漫畫就到此為止了。
    addPart(1);
    addPart(2);
  }
  function openCollectionOld() {
    const list = $('collList'); list.innerHTML = '';
    const entries = Object.entries(S.endings).filter(([, e]) => e.type !== 'alive');
    const order = { true: 0, good: 1, death: 2 };
    entries.sort((a, b) => order[a[1].type] - order[b[1].type]);
    let got = 0;
    for (const [id, e] of entries) {
      const u = state.unlocked[id];
      const n = typeof u === 'number' ? u : (u ? u.n : 0); if (n) got++;
      const d = document.createElement('div');
      d.className = 'coll ' + e.type + (n ? '' : ' locked');
      const tag = { death: T('end_death'), good: T('end_good'), true: T('end_true') }[e.type];
      const frame = document.createElement('div'); frame.className = 'frame';
      if (n) renderPortrait(frame, (u && u.gender) || state.gender, (u && u.job) || 'goblin', e.type === 'death');
      else frame.innerHTML = '<span class="q">?</span>';
      d.appendChild(frame);
      const cap = document.createElement('div'); cap.className = 'cap';
      cap.innerHTML = `<span class="tag">${tag}</span><span class="nm">${n ? L(e.name) : T('locked')}</span><span class="cnt">${n ? '×' + n : ''}</span>`;
      d.appendChild(cap);
      if (n) d.title = L(e.text);
      list.appendChild(d);
    }
    $('collCount').textContent = `${got} / ${entries.length}`;
    showOverlay('collectionScreen');
  }


  // ---------- 留話給作者 ----------
  // 網頁版（artifact）用 db 直接寄給作者；桌面版 / 沒登入就退回「複製文字」。
  let FBdb = null, FBuid = null, FBpromise = null;
  function fbInit() { return FBpromise || (FBpromise = fbLookup()); }
  async function fbLookup() {
    try {
      if (!window.claude || typeof claude.use !== 'function') return;
      const [db, user] = await Promise.all([claude.use('db'), claude.use('user')]);
      if (!db || !user) return;
      const id = await user.id();
      if (!id) return;
      FBdb = db; FBuid = id;
    } catch { FBdb = null; }
  }
  function fbMeta() {
    return {
      ver: '0.1',
      gen: state ? state.generation : 0,
      survived: state ? state.survived : 0,
      gender: state ? state.gender : '',
      job: state ? state.job : '',
      endings: state ? Object.keys(state.unlocked || {}).length : 0,
      graves: state && state.graveyard ? state.graveyard.length : 0,
      ua: navigator.userAgent.slice(0, 120),
    };
  }
  function fbPlain() {
    const m = fbMeta();
    return $('fbText').value.trim() + '\n\n---\n' + T('fb_meta', { ver: m.ver, gen: m.gen, n: m.survived, e: m.endings, g: m.graves });
  }
  function openFeedback() {
    showOverlay('feedbackScreen');
    $('fbStat').textContent = '';
    $('fbSend').classList.add('hidden'); $('fbCopy').classList.add('hidden');
    $('fbWhere').textContent = T('fb_checking');
    fbInit().then(() => {
      const ok = !!FBdb;
      $('fbSend').classList.toggle('hidden', !ok);
      $('fbCopy').classList.toggle('hidden', ok);
      $('fbWhere').textContent = ok
        ? T('fb_ok')
        : T('fb_no');
    });
    setTimeout(() => $('fbText').focus(), 50);
  }
  async function fbSend() {
    const t = $('fbText').value.trim();
    if (t.length < 2) { $('fbStat').textContent = T('fb_short'); return; }
    const btn = $('fbSend'); btn.disabled = true; $('fbStat').textContent = T('fb_sending');
    try {
      const ref = FBdb.doc('feedback/' + FBuid);
      let notes = [];
      try { const snap = await ref.get(); if (snap.exists) notes = snap.data().notes || []; } catch {}
      notes.push({ at: new Date().toISOString(), text: t.slice(0, 1500), meta: fbMeta() });
      await ref.set({ notes: notes.slice(-20), updatedAt: Date.now() });
      $('fbText').value = '';
      $('fbStat').textContent = T('fb_sent');
    } catch (e) {
      const code = (e && e.code) || 'error';
      $('fbStat').textContent = code === 'quota_exceeded'
        ? T('fb_full')
        : T('fb_fail', { code });
      $('fbCopy').classList.remove('hidden');
    }
    btn.disabled = false;
  }
  async function fbCopy() {
    const txt = fbPlain();
    try { await navigator.clipboard.writeText(txt); $('fbStat').textContent = T('fb_copied'); }
    catch {
      const ta = $('fbText'); ta.select(); ta.setSelectionRange(0, ta.value.length);
      $('fbStat').textContent = T('fb_copyfail');
    }
  }

  // ---------- 啟動 ----------
  function boot() {
    if (!S.jobs.some((j) => j.id === state.job)) state.job = 'goblin';
    renderActions(); renderPet(); renderStats();
    if (state.nextMsgAt == null) scheduleNext();
    $('app').classList.add('idle');
    say(T('boot_say', { job: L(S.jobs[0].name) }), 2500);
    save();
  }
  function init() {
    applyStaticI18n();
    for (const b of document.querySelectorAll('.toolbar button[data-icon]')) useIcon(b, b.dataset.icon);
    for (const d of document.querySelectorAll('.stats .stat[data-icon]')) useIcon(d, d.dataset.icon);
    renderActions();
    const saved = load();
    if (saved && saved.gender) {
      state = saved; state.lastTick = state.lastTick || Date.now();
      // 舊存檔：同一世被重複寫進遺照牆的，只留第一張
      if (Array.isArray(state.graveyard)) {
        const seen = new Set();
        state.graveyard = state.graveyard.filter((x) => (seen.has(x.gen) ? false : (seen.add(x.gen), true)));
      }
      // 舊存檔相容
      if (state.stats.food == null) state.stats.food = 8;
      if (!state.wage) state.wage = rollWage();
      if (!state.graveyard) state.graveyard = [];
      if (!state.lastFoodTick) state.lastFoodTick = Date.now();
      // 舊存檔沒有 dead 旗標：飽食歸零又過了寬限期的，視同已經死了
      if (state.dead == null) {
        state.dead = state.stats.food <= 0 && !!state.starvedAt
          && Date.now() - state.starvedAt >= S.economy.starveGraceMs;
      }
      if (state.dead) { save(); showOverlay('startScreen'); }
      else boot();
    }
    else showOverlay('startScreen');
    // 開局／投胎都從這裡選性別；遺照牆、圖鑑、設定跟著帶過去
    for (const b of document.querySelectorAll('.pickBtn')) b.onclick = () => {
      if (window.GoblinAudio && !state?.opts?.mute) window.GoblinAudio.start();   // 第一次點擊才能發聲
      state = freshGoblin(b.dataset.gender, state); showOverlay(null); boot();
    };
    if (!desktop && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    if (desktop) {
      desktop.isFast().then((f) => { if (f) { state && (state.opts.fast = true); } });
      desktop.onNotificationClicked(() => openChat());
    }
    $('pet').onclick = () => { if (state.pending) openChat(); else { say(L(pick(S.idleLines)), 2000); face(pick(['happy', 'surprised', 'shy', 'wink']), 2000); } };
    $('badge').onclick = openChat;
    $('btnInbox').onclick = openChat;
    $('chatClose').onclick = () => { if (window.GoblinAudio) window.GoblinAudio.setMood('idle'); showOverlay(null); };
    // 擲筊原本沒有關閉鍵，一遇到月老就被鎖在這一頁出不去。
    // 關掉只是先退出去，進度（已經丟過幾筊）存在 state.pending.jiao，
    // 從收件匣點回來會接著丟。
    $('jiaoClose').onclick = () => { save(); showOverlay(null); };
    $('btnCollection').onclick = openCollection;
    $('btnEndings').onclick = openEndings;
    $('endingsClose').onclick = () => showOverlay(null);
    $('evClose').onclick = openEndings;
    $('btnRules').onclick = () => {
      const ol = $('rulesList'); ol.innerHTML = '';
      $('rulesTitle').textContent = L(T('rules_title'));
      for (const r of S.rules) { const li = document.createElement('li'); li.textContent = L(r); ol.appendChild(li); }
      showOverlay('rulesScreen');
    };
    $('rulesClose').onclick = () => showOverlay(null);
    $('collClose').onclick = () => showOverlay(null);
    $('pvClose').onclick = () => openCollection();   // 返回遺照牆
    $('btnSettings').onclick = () => { $('optNotify').checked = state.opts.notify; $('optMusic').checked = !state.opts.mute; $('optFast').checked = state.opts.fast; showOverlay('settingsScreen'); };
    $('setClose').onclick = () => showOverlay(null);
    for (const b of document.querySelectorAll('.langBtns button')) {
      b.classList.toggle('on', b.dataset.lang === LANG);
      b.onclick = () => setLang(b.dataset.lang);
    }
    $('cvClose').onclick = () => showOverlay('endingView');
    $('btnFeedback').onclick = openFeedback;
    $('fbClose').onclick = () => showOverlay(null);
    $('fbSend').onclick = fbSend;
    $('fbCopy').onclick = fbCopy;
    fbInit();
    $('optNotify').onchange = (e) => { state.opts.notify = e.target.checked; save(); };
    $('optMusic').onchange = (e) => {
      state.opts.mute = !e.target.checked; save();
      if (window.GoblinAudio) { if (e.target.checked) { window.GoblinAudio.start(); window.GoblinAudio.setMuted(false); } else window.GoblinAudio.setMuted(true); }
    };
    $('optFast').onchange = (e) => { state.opts.fast = e.target.checked; scheduleNext(); };
    $('btnReset').onclick = () => { if (confirm(T('confirm_reset'))) showOverlay('startScreen'); };
    $('btnWipe').onclick = () => { if (confirm(T('confirm_wipe'))) { localStorage.removeItem(SAVE_KEY); location.reload(); } };
    if ($('btnQuit')) $('btnQuit').onclick = () => { if (desktop) desktop.quit(); else window.close(); };
    setInterval(() => { if (state) tick(); }, 2000);
  }
  document.addEventListener('DOMContentLoaded', init);
})();
