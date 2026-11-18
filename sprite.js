// 角色顯示：不內建造型，圖放 assets/。
// 身體圖：assets/<gender>_<job>.png（=一般表情）
// 表情圖：assets/<gender>_<job>_<state>.png，state = neutral / happy / angry / surprised / sleep / think
//   表情是「同一張身體只換臉」的整張圖，顯示時整張換掉，結束換回 neutral。
// 沒有某職業的圖時退回：assets/<job>.png → assets/<gender>.png → assets/<gender>_goblin.png → assets/goblin.png
// gender: m=哥布林  f=哥布美   job: goblin / warrior / shaman / dandy / hero / tycoon / king
(function (root) {
  const FALLBACK = {   // 想要的表情沒有時的替代順序
    happy: ['happy', 'neutral'],
    angry: ['angry', 'think', 'neutral'],
    surprised: ['surprised', 'happy', 'neutral'],
    sleep: ['sleep', 'neutral'],
    think: ['think', 'angry', 'neutral'],
    confident: ['happy', 'neutral'],
    serious: ['think', 'angry', 'neutral'],
    shy: ['happy', 'neutral'],
    wink: ['happy', 'neutral'],
    neutral: ['neutral'],
  };
  const known = {};     // 'm_goblin_happy' → true/false（有沒有這張圖）
  let faceTimer = null;

  function probe(src) {
    return new Promise((res) => {
      if (src in known) return res(known[src]);
      const im = new Image();
      im.onload = () => { known[src] = true; res(true); };
      im.onerror = () => { known[src] = false; res(false); };
      im.src = src;
    });
  }

  root.renderGoblin = function (box, jobId, gender) {
    const candidates = [
      [`assets/${gender}_${jobId}.webp?v=94998291-001311`, `${gender}_${jobId}`],
      [`assets/${jobId}.webp?v=94998291-001311`, jobId],
      [`assets/${gender}.webp?v=94998291-001311`, gender],
      [`assets/${gender}_goblin.webp?v=94998291-001311`, `${gender}_goblin`],
      ['assets/goblin.webp?v=94998291-001311', 'goblin'],
    ];
    box.innerHTML = '';
    const img = document.createElement('img');
    img.alt = ''; img.className = 'body';
    let i = 0;
    const tryNext = () => {
      if (i >= candidates.length) { box.innerHTML = '<div class="placeholder"><span>角色圖</span><small>assets/ 裡放 png</small></div>'; return; }
      box._key = candidates[i][1]; box._base = candidates[i][0];
      img.src = candidates[i++][0] + '?v=' + Date.now();
    };
    img.onerror = tryNext;
    img.onload = () => { box.innerHTML = ''; box.appendChild(img); img.onerror = null; };
    tryNext();
    // 預先探測這組有哪些表情圖，之後切換不會閃
    for (const st of ['happy', 'angry', 'surprised', 'sleep', 'think']) probe(`assets/${box._key}_${st}.webp?v=94998291-001311`);
  };

  // 顯示表情 ms 毫秒後換回一般表情；ms=0 表示一直到 clearFace
  root.setFace = async function (box, expr, ms) {
    const img = box.querySelector('img.body'); if (!img || !box._key) return false;
    const chain = FALLBACK[expr] || [expr, 'neutral'];
    let src = null;
    for (const st of chain) {
      if (st === 'neutral') { src = box._base; break; }
      const s = `assets/${box._key}_${st}.webp?v=94998291-001311`;
      if (await probe(s)) { src = s; break; }
    }
    if (!src || src === box._base) return false;
    clearTimeout(faceTimer);
    img.src = src;
    if (ms) faceTimer = setTimeout(() => { img.src = box._base; }, ms);
    return true;
  };
  root.clearFace = function (box) {
    clearTimeout(faceTimer);
    const img = box.querySelector('img.body'); if (img && box._base) img.src = box._base;
  };
})(window);

// 遺照／大頭照：優先用 assets/<gender>_portrait.png，沒有就拿全身圖放大裁頭
(function (root) {
  root.renderPortraitImg = function (box, jobId, gender) {
    const img = document.createElement('img'); img.alt = '';
    img.onload = () => { box.innerHTML = ''; box.appendChild(img); box.classList.add('hasPortrait'); };
    img.onerror = () => root.renderGoblin(box, jobId, gender);
    img.src = `assets/${gender}_portrait.webp?v=94998291-001311`;
  };
})(window);
