// 哥布林桌寵——劇本資料
// 結構說明：
//   threads[]  一次「來訊」= 一個 thread，從 nodes.start 開始
//   node.text  發訊者的訊息（陣列＝多則氣泡）
//   choice.results[]  依序檢查，第一個符合的生效：
//       { cond:{job:'warrior'} }           職業條件
//       { cond:{stat:'str', min:5} }       數值條件
//       { prob:0.5 }                        機率（擲骰）
//       （無 cond／prob）                   預設
//     每個 result 有 next:'節點' 或 end:'結局 id'，可附 gain:{str:1} 加數值
//   rare:true 的 thread 只在「稀有判定」通過時才會被抽到
(function (root) {
  const SCENARIO = {
    meta: {
      rareChance: 0.12,          // 每次來訊抽到好心 NPC 的機率
      fateChance: 0.03,          // 每次來訊抽到「月老擲筊」事件的機率；三圍全滿也會直接觸發（每世一次）
      fateFullStats: ['str', 'int', 'cha'],
      bloodlineChance: 0.05,     // 出生時 5% 抽到「作者血脈」（只有哥布林會抽到），解鎖化妝
      archmageAt: 12,            // 活過 12 封訊息沒死 → 大魔法師哥布林
      messageIntervalMs: [13000, 18000],    // 約 15 秒來一封，從上一段對話結束起算（規格書 6）
      fastIntervalMs: [4000, 8000],         // GOBLIN_FAST 測試模式
    },

    // 玩家選「哥布美」時，依序套用的文字替換（劇本一律用哥布林／女精靈寫，執行時轉換）
    genders: {
      m: { id: 'm', name: '哥布林', target: '精靈（女）' },
      f: { id: 'f', name: '哥布美', target: '精靈（男）' },
    },
    femaleSwap: [
      ['哥布林', '哥布美'],
      ['席爾薇', '席爾凡'], ['艾琳娜', '艾倫'], ['莉亞', '里奧'], ['伊芙', '伊森'],
      ['教練布魯', '教練布蘭'], ['老薩滿咕嚕', '老薩滿咕嚕'],
      ['抱得美人歸', '嫁給帥哥'], ['艾露', '艾爾'], ['美人', '帥哥'], ['新娘', '新郎'],
      ['帥哥', '美女'], ['兄弟', '姐妹'], ['雌性', '雄性'],
      ['她', '他'],
    ],

    stats: {
      str: { name: '肌肉', icon: '💪' },
      int: { name: '智力', icon: '📖' },
      cha: { name: '穿搭', icon: '👔' },
      gold: { name: '金幣', icon: '💰' },
      food: { name: '飽食', icon: '🍖' },
      energy: { name: '體力', icon: '🔋' },
      glam: { name: '妝', icon: '💄' },      // 只有抽到作者血脈的哥布林看得到
    },

    // 職業是「路線」：只往前、不回頭。next 列出從這個職業可以轉去哪裡（依序檢查，先達標先轉）
    jobs: [
      { id: 'goblin', name: '哥布林', req: {}, next: ['warrior', 'shaman', 'dandy', 'tycoon'], desc: '洞窟裡最普通的那一隻。' },
      { id: 'warrior', name: '哥布林戰士', req: { str: 5 }, next: ['hero'], desc: '練出肌肉了，但在冒險者眼裡還是經驗值。' },
      { id: 'shaman', name: '哥布林薩滿', req: { int: 5 }, next: ['hero'], desc: '會看字了，開始懷疑自己為什麼是哥布林。' },
      { id: 'dandy', name: '哥布林紳士', req: { cha: 5 }, next: ['hero'], desc: '衣服穿對了，遠看幾乎像人。幾乎。' },
      { id: 'hero', name: '哥布林勇者', req: { str: 5, int: 5, cha: 5 }, next: ['king'], desc: '三項都有練。精靈還是不會回你訊息，但至少活比較久。' },
      { id: 'tycoon', name: '成金哥布林', req: { gold: 150 }, next: ['king'], kingReq: { gold: 300 }, desc: '打工打到有錢了。還是哥布林，但是有錢的哥布林。' },
      { id: 'king', name: '哥布林王', req: { str: 8, int: 8, cha: 8 }, next: [], desc: '洞窟之王。依然是哥布林。' },
    ],

    // cost = 每次要花的金幣；薪資在出生時依 wageTable 抽一次
    economy: {
      mealCost: 12, mealFood: 4,
      foodDecayMs: 5 * 60 * 1000,     // 每 5 分鐘飽食 -1
      starveGraceMs: 4 * 60 * 1000,   // 飽食歸零後撐 4 分鐘就餓死
      wageTable: [
        { p: 0.25, range: [3, 7], label: '血汗' },
        { p: 0.45, range: [9, 18], label: '普通' },
        { p: 0.22, range: [22, 40], label: '不錯' },
        { p: 0.08, range: [70, 140], label: '含金湯匙' },
      ],
    },
    actions: [
      { id: 'gym', name: '健身房', icon: '💪', stat: 'str', energy: -2, cost: 10, lines: ['付了入場費，教練看了你一眼沒說話。', '哥布林做了三下伏地挺身，第四下趴著不動了。', '手臂好像粗了一點點。也可能是腫的。', '旁邊的冒險者在練深蹲，你假裝在練同一組。'] },
      { id: 'read', name: '讀書', icon: '📖', stat: 'int', energy: -2, cost: 0, lines: ['哥布林翻開撿來的書，書是倒的。', '讀到「哥布林討伐指南」第三章，覺得受益良多。', '學會了一個新字：「死」。'] },
      { id: 'dress', name: '穿搭', icon: '👔', stat: 'cha', energy: -2, cost: 15, lines: ['跟商隊買了一塊新的布，披在另一邊，感覺煥然一新。', '買了一頂二手的冒險者帽，有點大，但有型。', '花錢請人幫你剪瀏海。剪完才發現你沒有瀏海。', '對著水窪照了十分鐘。水窪沒有意見。'] },
      { id: 'work', name: '工作', icon: '💰', stat: 'gold', energy: -2, cost: 0, lines: ['去幫冒險者公會搬箱子，沒人認出你。可能是因為都沒人看你。', '在城外幫商隊顧馬，賺了一點錢，馬一直盯著你。', '接了一個「清理哥布林洞窟」的案子，打掃自己家還有錢拿。', '幫巫師抄書，抄錯三個字，扣錢。'] },
      { id: 'eat', name: '吃飯', icon: '🍖', stat: 'food', energy: 0, cost: 12, lines: ['在路邊攤買了一串不明肉串。問了是什麼肉，老闆說「肉」。', '吃了一碗熱的，哥布林覺得人生還可以。', '買了冒險者的乾糧，回味無窮。'] },
      { id: 'makeup', name: '化妝', icon: '💄', stat: 'glam', energy: -1, cost: 8, blood: true, lines: ['對著水窪畫了一次眼線，手抖，畫到耳朵。', '跟商隊買了一盒粉，老闆說「這給人用的」，你說「我知道」。', '今天的眉毛是這輩子最對稱的一次。', '嘎嘎走進來，愣了三秒，說「你今天看起來不一樣」。', '你發現自己有顴骨。哥布林居然有顴骨。'] },
      { id: 'sleep', name: '睡覺', icon: '💤', stat: null, energy: 4, cost: 0, lines: ['哥布林縮回洞窟深處，打呼聲傳出三公里。', '夢到精靈回訊息了。醒來發現是通知音。', '睡了一覺，什麼都沒變，這就是哥布林的人生。'] },
    ],

    // 哥布林生存守則（遊戲內可隨時查閱，部分劇情會引用條號）
    rules: [
      '千萬不要走出森林。',
      '你可以信任你的哥布林兄弟。',
      '若 1 和 2 衝突，則遵守 1。',
      '你可以信任的其他種族是地精和巨魔。',
      '如果不幸走出森林，請即時返回；遇到危險時可向其他哥布林幹部求救（如：長老哥布林、哥布林祭司、哥布林統帥／大統帥等）。',
      '身高高於 180 的哥布林將會自動分化成巨魔，他們有著高大的身軀，必要時可以向他們求助。',
      '身高低於 160 的哥布林將會自動分化為地精，他們有著敏捷的思維，必要時也可向他們求助。',
      '如果有其他哥布林勸你走出森林，一定是有勇者用劍抵住他的頭顱；必要時可不顧其安危，直接逃跑並求助。',
      '不要沉溺於夢境；若不慎沉溺其中，哥布林大祭司會嘗試和你的大腦連結並拯救你（注：你必須嘗試清醒，否則我們也無能為力）。',
      '不要嘗試襲擊落單的雌性精靈，你會被其他精靈和勇者圍剿，屆時我們都無能為力。',
    ],

    idleLines: [
      '嘎嘎。', '今天也沒有精靈。', '（挖鼻孔）', '洞窟濕濕的。', '聽說城裡在找哥布林……找來幹嘛？',
      '（盯著手機，沒有通知）', '守則第 1 條：不要走出森林。', '守則第 10 條……我知道，我知道。', '我一直覺得我快 180 了。', '我覺得我其實滿帥的。', '（撿到一枚銅幣，吃掉了）', '精靈都在哪裡啊。',
    ],

    endings: {
      // ===== 死亡 =====
      d_newbie: { type: 'death', name: '新手村經驗值', text: '新手劍士砍了你三刀，第三刀才砍到。他升到 2 級了，謝謝你。' },
      d_arrow: { type: 'death', name: '一箭穿心（字面上的）', text: '你揮手的那一刻，精靈的箭已經在路上。你想這也算一種回應。' },
      d_run: { type: 'death', name: '跑步太慢', text: '你轉身就跑，跑了八步。哥布林的腿就是這麼短。' },
      d_human: { type: 'death', name: '以人類身分死去', text: '你穿著「人類套裝」走進城門，衛兵看了你一秒，說：「哥布林。」至少你死的時候穿得很體面。' },
      d_selfquest: { type: 'death', name: '自己討伐自己', text: '你帶著討伐隊來到洞窟，指著裡面說「哥布林在那」。他們看了看洞窟，又看了看你。任務完成，報酬 50 金，由隊長代領。' },
      d_screenshot: { type: 'death', name: '被公審至死', text: '你的回覆被截圖轉發了四百次。隔天早上洞口排了一整隊冒險者，每個人都想當正義的一方。' },
      d_tank: { type: 'death', name: '功成身退', text: '你幫勇者團扛下了魔王的大招。慶功宴上有人問「欸等一下，他是不是哥布林」，於是慶功宴多了一道節目。' },
      d_science: { type: 'death', name: '對學術的貢獻', text: '巫師說只是「稍微觀察一下」。你現在被收錄在《哥布林構造圖鑑》第 12 頁，畫得還滿像的。' },
      d_bro: { type: 'death', name: '兄弟情', text: '你和嘎嘎一起走進城裡，一起對精靈說「嗨」，一起被砍。至少不孤單。' },
      d_landlord: { type: 'death', name: '被房東趕走（物理）', text: '龍說洞窟是牠的。你說你住很久了。龍表示理解，然後噴火。' },
      d_kindness: { type: 'death', name: '好心沒好報', text: '你指錯了路，想讓她多待一會兒。她走了兩步、轉頭看你，眼神從「謝謝」變成「哥布林」。' },
      d_guard: { type: 'death', name: '被衛兵帶走', text: '精靈說她要找人護送，你舉手說「我」。她找來的人是衛兵。衛兵護送的是她，處理的是你。' },
      d_glowup: { type: 'death', name: '帥到被誤認', text: '你今天穿得太好了，精靈遠遠看以為是帥哥冒險者，走近才發現是哥布林。落差感讓她比平常更用力。' },
      d_cold: { type: 'death', name: '被狼吃掉的不是她', text: '你裝作沒看見受傷的精靈，轉身回洞窟。狼來了，狼也覺得哥布林比較好吃。' },
      d_starve: { type: 'death', system: true, name: '餓死在洞窟裡', text: '你把最後一枚金幣拿去買了帽子。帽子很好看。三天後冒險者發現你時，帽子還在頭上。' },
      d_scare: { type: 'death', name: '嚇到自己', text: '你想嚇她一跳當開場白。她受傷了還是比你強。' },

      // ===== 活著但沒追到 =====
      a_rock: { type: 'alive', name: '當一顆石頭', text: '你一動也不動，精靈看了一眼就走了。你又活過一天，像石頭一樣。' },
      a_escape: { type: 'alive', name: '逃過一劫', text: '你跑進洞窟深處，他懶得追。今天的命是撿回來的。' },
      a_ghost: { type: 'alive', name: '已讀不回之神', text: '你什麼都沒回。有時候不回才是最好的回覆。' },
      a_broke: { type: 'alive', name: '窮到沒被騙', text: '老皮看了看你的口袋，裡面有一顆石頭。他嘆了口氣，收起套裝走了。沒錢也是一種防禦力。' },
      a_bribe: { type: 'alive', name: '用錢解決', text: '你匿名捐了一筆錢給「精靈森林保育基金」，附註「請刪文」。文刪了。你的錢也沒了。' },
      a_rich_tenant: { type: 'alive', name: '買下洞窟', text: '你問龍開價多少。龍沒想過哥布林會有錢，愣了一下，隨便說了一個數字。你付了。洞窟現在是你的，龍是房客。' },
      a_scam: { type: 'alive', name: '花錢買教訓', text: '你花了全部的金幣買到一件「人類套裝」，其實是麻布袋挖三個洞。你沒有去城裡，所以活下來了。' },
      a_small: { type: 'alive', name: '太小隻', text: '勇者團看了你一眼說「你太小隻了」。你被拒絕了，也因此活著。' },
      a_consult: { type: 'alive', name: '哥布林語顧問', text: '巫師發現你會看字，決定不解剖你，改請你當顧問。時薪三顆銅幣。' },
      a_brotherless: { type: 'alive', name: '少了一個兄弟', text: '你勸嘎嘎別去。他還是去了。隔天公會公告：「哥布林討伐 +1」。' },
      a_rule8: { type: 'alive', name: '守則第 8 條', text: '嘎嘎沉默了五秒，然後回了一句「……嘎」。你把洞口的石頭推上，從後面的通道溜走。隔天你在森林邊看到一把劍插在地上，旁邊沒有嘎嘎。你遵守了守則，守則救了你。' },
      a_laughed: { type: 'alive', name: '被同族嘲笑', text: '嘎嘎笑了三分鐘：「哥布林健什麼身？」你沒有回答，繼續舉石頭。' },
      a_tenant: { type: 'alive', name: '跟龍談成分租', text: '你跟龍談了一個小時，最後龍同意你住洞口，牠住裡面，月租兩隻羊。你沒有羊，但先活著再說。' },
      a_guide: { type: 'alive', name: '好好指了一次路', text: '你認真指了路，她說謝謝。她走了，但沒有射你。對哥布林來說這已經是戀愛了。' },
      a_walk: { type: 'alive', name: '一起走了一段', text: '你陪她走到森林邊，她沒有回頭，但也沒有拔劍。你站在原地看了很久。' },
      a_talk: { type: 'alive', name: '聊了幾句', text: '精靈停下來看你的衣服，問你在哪買的。你說是撿的。她笑了一下，然後走了。' },
      a_nodate: { type: 'alive', name: '暫時不想談戀愛', text: '你跟月老說你現在不想談戀愛。他愣了一下，說這句話他三千年來聽過很多次，但從哥布林嘴裡聽到是第一次。他把姻緣簿闔上，在你那一頁折了個角。你回洞窟，繼續回訊息。' },
      a_missed: { type: 'alive', name: '錯過了', text: '她醒來，看著你，像是想說什麼。你太緊張，說了「嘎嘎」。她點點頭，起身離開。你知道這次是真的錯過了。' },
      a_friend: { type: 'good', name: '第一個把你當朋友的人類', text: '老兵沒有砍你。他坐在洞口跟你喝了一杯，說他年輕時也被當成怪物過。他走之前說：「活久一點。」你把這句話記在洞窟牆上。' },

      // ===== 月老擲筊（五擲） =====
      d_honeytrap: { type: 'death', name: '仙人跳', text: '你們真的交往了。第三天晚上她說「我爸媽想見你」。門打開，裡面是六個精靈弓箭手跟一個冒險者公會的公證人。他們說：「賠償金，或者你。」你沒有錢。' },
      g_alone: { type: 'good', dies: true, name: '孑然一身，怡然自得', text: '月老說差一點。你說沒關係。\n\n你回到洞窟，把石頭排好、把帽子掛好，之後的日子沒有精靈也沒有冒險者，只有你跟洞窟。你活到很老很老，老到連新手劍士都懶得來。最後一天你坐在洞口曬太陽，閉上眼睛，像一顆滿意的石頭。' },
      t_marry: { type: 'true', name: '抱得美人歸', text: '五個聖筊。月老自己都愣住了。\n\n艾露說她不在乎你是哥布林，她在乎的是你每次都有回訊息。婚禮在洞口辦，來的人不多：嘎嘎、老兵哈克、還有一隻沒被邀請的龍。守則第 10 條沒有說不能結婚。\n\n你是全世界第一隻抱得美人歸的哥布林。' },

      // ===== 隱藏結局 =====
      g_idol: { type: 'good', system: true, name: '偽娘哥布林', text: '你把最後一枚金幣投進罐子，倒過來搖了搖，換回一支口紅。\n\n接下來那陣子你一直在練。跳繩跳到腿軟，對著水窪唱到隔壁的哥布林摀起耳朵。沒有人教你，也沒有人問你在練什麼。\n\n那天晚上，舞台全暗。\n\n一道光從上面打下來，光圈裡是空的。\n\n你走進去，站定，抬頭。\n\n台下滿滿都是哥布林，一路排到看不見盡頭。他們沒有在笑，他們在歡呼。\n\n守則第 10 條說不要太顯眼。這一條你徹底違反了，而且你活得很好。' },
      g_archmage: { type: 'good', system: true, name: '大魔法師哥布林', text: '第 30 封訊息之後，你發現自己的腳沒有碰到地面。\n\n沒有人教過你，你也沒有拜師。你只是活得夠久——久到看過三十次有人想殺你、久到把每一句話都想過一遍。那好像就夠了。\n\n你飄在洞窟中央，手心浮著一顆橘紅色的火球。它很燙，但不燙你。\n\n外面的冒險者公會把你的洞窟從「新手區」移到了「禁止接近」。' },

      // ===== 真結局 =====
      t_elf: { type: 'true', name: '與精靈在一起', text: '她在洞口住了三天養傷。第四天她沒有走，說洞窟裡比森林安靜。你還是哥布林，她還是精靈，但晚上她會把弓放在你這邊。\n\n這就是全世界哥布林都在找的那條路。你找到了。' },
    },

    threads: [
      // ---------- F 月老擲筊（fate:true，不在一般抽選池；1% 或三圍全滿觸發） ----------
      // next:'__jiao' 會開啟擲筊小遊戲，擲五次後依聖筊數接到 jiao5 / jiao4 / jiao3
      {
        id: 'fate', weight: 0, fate: true,
        sender: { name: '月老', kind: 'god', avatar: '🧧' },
        nodes: {
          start: {
            text: ['哥布林。', '我翻了姻緣簿，你這一頁不是空白的。', '很少見。哥布林那一區通常是空白的。', '來，擲筊。五次。能擲幾個聖筊，就看你的命。'],
            choices: [
              { label: '（跪下，拿起筊）', results: [{ next: '__jiao' }] },
              { label: '月老，我現在不想談戀愛', results: [{ next: 'decline' }] },
            ],
          },
          decline: {
            text: ['……你知道有多少人求我翻到這一頁嗎。', '（他把姻緣簿闔上）', '算了。你這個年紀的，說不想就是不想。', '（他把筊收回袖子裡）', '我把你這一頁折個角。哪天想通了，自己來找我。'],
            choices: [
              { label: '（道謝，回洞窟）', results: [{ end: 'a_nodate' }] },
              { label: '（等一下）我還是擲', results: [{ next: '__jiao' }] },
            ],
          },
          jiao5: {
            text: ['……五個。', '我做月老三千年，哥布林五個聖筊是第一次。', '（叮咚，一則新訊息）', '【艾露】嗨，我是在森林邊常看到你的那個精靈。月老說我應該傳訊息給你。', '【艾露】其實我注意你很久了。你每次都有回訊息。', '【艾露】你……要不要出來走走？'],
            choices: [
              { label: '好。', results: [{ end: 't_marry' }] },
            ],
          },
          jiao4: {
            text: ['四個。', '差一點。真的只差一點。', '不過我老實跟你說，四個聖筊的哥布林，命比五個的還長。', '姻緣這條線我幫你剪了。剩下的日子是你自己的。', '回去吧。好好活。'],
            choices: [
              { label: '（點頭，回洞窟）', results: [{ end: 'g_alone' }] },
            ],
          },
          jiao3: {
            text: ['嗯……有緣，但是不深。', '我幫你牽一條試試看。', '（叮咚，一則新訊息）', '【艾露】嗨～月老介紹的。你是哥布林對吧？沒關係，我不介意', '【艾露】我們交往看看吧', '【艾露】對了，我爸媽這週末想見你'],
            choices: [
              { label: '好啊！（人生第一次有人說要交往）', results: [{ end: 'd_honeytrap' }] },
            ],
          },
        },
      },

      // ---------- 1 新手劍士 ----------
      {
        id: 'newbie', weight: 5,
        sender: { name: '小劍士阿凱', kind: 'adventurer', avatar: '🗡️' },
        nodes: {
          start: {
            text: ['哈囉？這是哥布林洞窟嗎？', '我是新手，公會說這裡練等很安全'],
            choices: [
              { label: '嘎嘎！（用哥布林語打招呼）', results: [{ end: 'd_newbie' }] },
              { label: '我是人類，你走錯了', results: [{ next: 'deny' }] },
              { label: '（轉身就跑）', results: [{ cond: { stat: 'str', min: 1 }, end: 'a_escape' }, { prob: 0.4, end: 'a_escape' }, { end: 'd_run' }] },
            ],
          },
          deny: {
            text: ['人類？', '那你講一句人類才會講的話'],
            choices: [
              { label: '房價太高了', results: [{ cond: { stat: 'int', min: 1 }, end: 'a_ghost', gain: { int: 1 } }, { prob: 0.5, end: 'a_ghost' }, { end: 'd_newbie' }] },
              { label: '嘎……嘎嘎', results: [{ end: 'd_newbie' }] },
              { label: '（露出肌肉）', results: [{ cond: { stat: 'str', min: 3 }, end: 'a_escape' }, { end: 'd_newbie' }] },
            ],
          },
        },
      },

      // ---------- 2 精靈弓箭手路過 ----------
      {
        id: 'archer', weight: 8,
        sender: { name: '席爾薇', kind: 'elf', avatar: '🏹' },
        nodes: {
          start: {
            text: ['（訊息來自洞口外）', '裡面有東西嗎？我聽到聲音'],
            choices: [
              { label: '（探頭出去揮手）', results: [{ cond: { stat: 'cha', min: 5 }, end: 'd_glowup' }, { end: 'd_arrow' }] },
              { label: '（裝成一顆石頭）', results: [{ end: 'a_rock' }] },
              { label: '（整理一下衣服再出去）', results: [{ cond: { stat: 'cha', min: 3 }, end: 'a_talk', gain: { cha: 1 } }, { next: 'spotted' }] },
            ],
          },
          spotted: {
            text: ['（她看到你了。弓已經拉開一半）', '……你不是冒險者'],
            choices: [
              { label: '（慢慢把兩隻手舉起來）', results: [{ cond: { stat: 'cha', min: 1 }, end: 'a_talk', gain: { cha: 1 } }, { prob: 0.5, end: 'a_rock' }, { end: 'd_arrow' }] },
              { label: '（一動也不動，裝成石頭）', results: [{ end: 'a_rock' }] },
              { label: '嘎！', results: [{ end: 'd_arrow' }] },
            ],
          },
        },
      },

      // ---------- 3 商人 ----------
      {
        id: 'merchant', weight: 7,
        sender: { name: '旅行商人老皮', kind: 'adventurer', avatar: '🧳' },
        nodes: {
          start: {
            text: ['嘿～哥布林朋友', '想不想變成人類？我這有一套「人類套裝」，穿上去城裡沒人看得出來', '只要你全部的銅幣'],
            choices: [
              { label: '買！', results: [{ cond: { stat: 'gold', min: 20 }, next: 'bought', gain: { gold: -9999 } }, { end: 'a_broke' }] },
              { label: '這是騙局吧', results: [{ cond: { stat: 'int', min: 2 }, end: 'a_ghost', gain: { int: 1 } }, { cond: { stat: 'gold', min: 20 }, next: 'bought', gain: { gold: -9999 } }, { end: 'a_broke' }] },
              { label: '不要，我喜歡當哥布林', results: [{ end: 'a_ghost' }] },
            ],
          },
          bought: {
            text: ['成交！穿起來很合身', '你現在要去城裡試試看嗎？'],
            choices: [
              { label: '去城裡', results: [{ end: 'd_human' }] },
              { label: '先在洞窟穿就好', results: [{ end: 'a_scam' }] },
            ],
          },
        },
      },

      // ---------- 4 公會群組傳錯人 ----------
      {
        id: 'guild', weight: 8,
        sender: { name: '冒險者公會（群組）', kind: 'adventurer', avatar: '📜' },
        nodes: {
          start: {
            text: ['【任務公告】西邊洞窟出現哥布林，討伐報酬 50 金幣', '集合地點：洞窟門口，有人要組隊嗎？'],
            choices: [
              { label: '+1 我也要報名', results: [{ end: 'd_selfquest' }] },
              { label: '（已讀不回）', results: [{ end: 'a_ghost' }] },
              { label: '這裡沒有哥布林，是假消息', results: [{ next: 'verify' }] },
            ],
          },
          verify: {
            text: ['？', '你是誰？為什麼在這個群組', '我們派個人去看一下'],
            choices: [
              { label: '（躲到洞窟深處）', results: [{ cond: { stat: 'int', min: 3 }, end: 'a_escape' }, { prob: 0.4, end: 'a_escape' }, { end: 'd_newbie' }] },
              { label: '（站在洞口等）', results: [{ cond: { job: 'warrior' }, end: 'a_escape', gain: { str: 1 } }, { cond: { job: 'king' }, end: 'a_escape' }, { prob: 0.45, end: 'a_escape' }, { end: 'd_newbie' }] },
            ],
          },
        },
      },

      // ---------- 5 精靈的群發抱怨 ----------
      {
        id: 'rant', weight: 9,
        sender: { name: '艾琳娜（動態）', kind: 'elf', avatar: '🧝' },
        nodes: {
          start: {
            text: ['今天在森林又被哥布林搭訕了，真的很累', '可以不要再靠近精靈了嗎？', '#哥布林退散'],
            choices: [
              { label: '不是所有哥布林都這樣', results: [{ end: 'd_screenshot' }] },
              { label: '（不理）', results: [{ end: 'a_ghost' }] },
              { label: '對啊我也覺得哥布林很煩', results: [{ next: 'caught' }] },
            ],
          },
          caught: {
            text: ['謝謝你的支持', '等等……你的帳號頭像是不是綠色的', '你是哥布林吧？'],
            choices: [
              { label: '不是，我是曬太久', results: [{ cond: { stat: 'cha', min: 4 }, end: 'a_ghost', gain: { cha: 1 } }, { end: 'd_screenshot' }] },
              { label: '對，但我在健身', results: [{ cond: { stat: 'str', min: 4 }, end: 'a_ghost' }, { end: 'd_screenshot' }] },
              { label: '我可以贊助你刪文', results: [{ cond: { stat: 'gold', min: 80 }, end: 'a_bribe', gain: { gold: -80 } }, { end: 'd_screenshot' }] },
              { label: '（刪帳號）', results: [{ end: 'a_ghost' }] },
            ],
          },
        },
      },

      // ---------- 6 勇者團招募 ----------
      {
        id: 'party', weight: 6,
        sender: { name: '勇者團「曙光」', kind: 'adventurer', avatar: '⚔️' },
        nodes: {
          start: {
            text: ['徵肉盾一名，今晚打魔王', '要夠壯，站得住就好', '不問出身'],
            choices: [
              { label: '我來', results: [{ cond: { stat: 'str', min: 4 }, next: 'join' }, { end: 'a_small' }] },
              { label: '我比較適合當軍師', results: [{ cond: { stat: 'int', min: 4 }, end: 'a_ghost', gain: { int: 1 } }, { end: 'a_small' }] },
              { label: '（不理）', results: [{ end: 'a_ghost' }] },
            ],
          },
          join: {
            text: ['好，你來。穿好裝備', '打完請你喝酒'],
            choices: [
              { label: '去打魔王', results: [{ cond: { job: 'king' }, end: 'a_escape', gain: { str: 1 } }, { end: 'd_tank' }] },
              { label: '打完直接回洞窟不參加慶功宴', results: [{ cond: { stat: 'int', min: 2 }, end: 'a_escape', gain: { str: 1 } }, { end: 'd_tank' }] },
            ],
          },
        },
      },

      // ---------- 7 巫師研究 ----------
      {
        id: 'wizard', weight: 6,
        sender: { name: '巫師波波', kind: 'adventurer', avatar: '🔮' },
        nodes: {
          start: {
            text: ['你好，我在研究哥布林語', '可以請你來我的塔「稍微觀察一下」嗎？', '有點心'],
            choices: [
              { label: '有點心就去', results: [{ cond: { stat: 'int', min: 3 }, end: 'a_consult', gain: { int: 1 } }, { next: 'tower' }] },
              { label: '我可以在這裡教你', results: [{ cond: { stat: 'int', min: 1 }, end: 'a_consult' }, { next: 'tower' }] },
              { label: '（不理）', results: [{ end: 'a_ghost' }] },
            ],
          },
          tower: {
            text: ['（塔裡擺滿了瓶瓶罐罐，牆上掛著一張解剖圖）', '放輕鬆，我只是量一下', '（他翻開一本空白的筆記）'],
            choices: [
              { label: '（指著他的書，念出上面一個字）', results: [{ cond: { stat: 'int', min: 1 }, end: 'a_consult', gain: { int: 1 } }, { prob: 0.5, end: 'a_consult' }, { end: 'd_science' }] },
              { label: '（先吃點心，邊吃邊看他在寫什麼）', results: [{ cond: { stat: 'int', min: 2 }, end: 'a_consult' }, { prob: 0.4, end: 'a_ghost' }, { end: 'd_science' }] },
              { label: '（趁他轉身，從窗戶跳下去）', results: [{ cond: { stat: 'str', min: 1 }, end: 'a_escape' }, { prob: 0.35, end: 'a_escape' }, { end: 'd_science' }] },
            ],
          },
        },
      },

      // ---------- 8 同族兄弟 ----------
      {
        id: 'bro', weight: 7,
        sender: { name: '嘎嘎（隔壁洞的）', kind: 'goblin', avatar: '👺' },
        nodes: {
          start: {
            text: ['兄弟', '走，去城裡搭訕精靈', '今天感覺運氣很好'],
            choices: [
              { label: '走！', results: [{ end: 'd_bro' }] },
              { label: '守則第 8 條。你後面是不是有勇者？', results: [{ cond: { stat: 'int', min: 1 }, end: 'a_rule8' }, { end: 'a_brotherless' }] },
              { label: '別去，會死', results: [{ end: 'a_brotherless' }] },
              { label: '我在健身，下次', results: [{ end: 'a_laughed' }] },
            ],
          },
        },
      },

      // ---------- 9 龍 ----------
      {
        id: 'dragon', weight: 4,
        sender: { name: '龍', kind: 'monster', avatar: '🐉' },
        nodes: {
          start: {
            text: ['這個洞窟我要了', '你有十分鐘'],
            choices: [
              { label: '我住很久了，有先來後到', results: [{ next: 'argue' }] },
              { label: '我們來談條件', results: [{ cond: { stat: 'int', min: 5 }, end: 'a_tenant' }, { end: 'd_landlord' }] },
              { label: '我把洞窟買下來，你開價', results: [{ cond: { stat: 'gold', min: 200 }, end: 'a_rich_tenant', gain: { gold: -200 } }, { end: 'd_landlord' }] },
              { label: '（搬家）', results: [{ end: 'a_escape' }] },
            ],
          },
          argue: {
            text: ['（龍深深吸了一口氣。洞窟裡開始變熱）', '……先、來、後、到'],
            choices: [
              { label: '（馬上改口）那我當房客可以嗎', results: [{ cond: { stat: 'int', min: 1 }, end: 'a_tenant' }, { prob: 0.5, end: 'a_tenant' }, { end: 'd_landlord' }] },
              { label: '（把洞窟裡最好的東西捧出去給牠）', results: [{ cond: { stat: 'gold', min: 30 }, end: 'a_tenant', gain: { gold: -30 } }, { prob: 0.4, end: 'a_escape' }, { end: 'd_landlord' }] },
              { label: '（繼續講道理）', results: [{ end: 'd_landlord' }] },
            ],
          },
        },
      },

      // ---------- 10 迷路的精靈 ----------
      {
        id: 'lost', weight: 7,
        sender: { name: '莉亞', kind: 'elf', avatar: '🌿' },
        nodes: {
          start: {
            text: ['不好意思，請問往精靈森林是這個方向嗎？', '我迷路了，天快黑了'],
            choices: [
              { label: '往東走，過了河就是', results: [{ end: 'a_guide', gain: { cha: 1 } }] },
              { label: '往西走（其實是錯的，想留她久一點）', results: [{ end: 'd_kindness' }] },
              { label: '我帶你去', results: [{ cond: { stat: 'cha', min: 3 }, end: 'a_walk', gain: { cha: 1 } }, { cond: { stat: 'str', min: 4 }, end: 'a_walk' }, { next: 'escort' }] },
            ],
          },
          escort: {
            text: ['（走到森林邊，前面有兩個衛兵在巡邏）', '……糟糕，他們是來找我的'],
            choices: [
              { label: '（把她推到樹後，自己走出去）', results: [{ cond: { stat: 'str', min: 1 }, end: 'a_walk', gain: { cha: 1 } }, { prob: 0.5, end: 'a_escape' }, { end: 'd_guard' }] },
              { label: '（停在這裡，讓她自己走過去）', results: [{ end: 'a_guide' }] },
              { label: '（兩個一起走出去）', results: [{ end: 'd_guard' }] },
            ],
          },
        },
      },


      // ---------- 11 洞窟管理處（詐騙） ----------
      {
        id: 'scam', weight: 8,
        sender: { name: '洞窟管理處', kind: 'adventurer', avatar: '📨' },
        nodes: {
          start: {
            text: ['【系統通知】您的洞窟本月管理費尚未繳納', '逾期本處將派員前往清理', '請於今日內匯款 200 金幣'],
            choices: [
              { label: '洞窟管理處是什麼', results: [{ next: 'ask' }] },
              { label: '（匯過去）', results: [{ cond: { stat: 'gold', min: 200 }, next: 'paid', gain: { gold: -200 } }, { next: 'broke' }] },
              { label: '（已讀不回）', results: [{ end: 'a_ghost' }] },
            ],
          },
          ask: {
            text: ['冒險者公會洞窟管理處', '（他傳了一張公會印章的照片）', '（印章是手畫的）'],
            choices: [
              { label: '（指出印章是手畫的）', results: [{ cond: { stat: 'int', min: 2 }, end: 'a_ghost', gain: { int: 1 } }, { prob: 0.5, end: 'a_ghost' }, { next: 'broke' }] },
              { label: '好的我馬上匯', results: [{ cond: { stat: 'gold', min: 200 }, next: 'paid', gain: { gold: -200 } }, { next: 'broke' }] },
              { label: '（已讀不回）', results: [{ end: 'a_ghost' }] },
            ],
          },
          paid: {
            text: ['（錢匯出去了）', '（三秒後）', '【系統通知】您的洞窟下月管理費尚未繳納'],
            choices: [
              { label: '（再匯一次）', results: [{ cond: { stat: 'gold', min: 200 }, end: 'a_broke', gain: { gold: -200 } }, { end: 'a_broke' }] },
              { label: '（封鎖）', results: [{ end: 'a_ghost', gain: { int: 1 } }] },
            ],
          },
          broke: {
            text: ['（你翻了翻口袋）', '（裡面有一顆石頭）'],
            choices: [
              { label: '（把石頭的照片傳過去）這是我全部的財產', results: [{ end: 'a_broke' }] },
              { label: '可以分期嗎', results: [{ end: 'a_ghost' }] },
            ],
          },
        },
      },

      // ---------- 12 外送走錯地方 ----------
      {
        id: 'delivery', weight: 7,
        sender: { name: '外送員', kind: 'adventurer', avatar: '🛵' },
        nodes: {
          start: {
            text: ['您好，您的餐點到了', '我在洞窟門口', '……這裡真的是洞窟嗎'],
            choices: [
              { label: '（出去拿）', results: [{ next: 'door' }] },
              { label: '（請他放門口就好）', results: [{ end: 'a_ghost', gain: { food: 2 } }] },
              { label: '我沒有點餐', results: [{ next: 'wrong' }] },
            ],
          },
          door: {
            text: ['（他抬頭看到你）', '（他愣了兩秒）', '……先生，您的餐點'],
            choices: [
              { label: '（接過來，說謝謝）', results: [{ cond: { stat: 'cha', min: 2 }, end: 'a_talk', gain: { food: 3 } }, { prob: 0.5, end: 'a_talk', gain: { food: 2 } }, { next: 'photo' }] },
              { label: '（戴上帽子遮臉再出去）', results: [{ cond: { stat: 'cha', min: 3 }, end: 'a_ghost', gain: { food: 2 } }, { prob: 0.6, end: 'a_ghost', gain: { food: 2 } }, { next: 'photo' }] },
              { label: '（躲回洞窟深處）', results: [{ end: 'a_rock' }] },
            ],
          },
          photo: {
            text: ['（他後退了一步）', '（他掏出手機）', '（他在拍照）'],
            choices: [
              { label: '（伸手擋住鏡頭）', results: [{ cond: { stat: 'str', min: 2 }, end: 'a_escape' }, { prob: 0.4, end: 'a_escape' }, { end: 'd_screenshot' }] },
              { label: '（比一個讚）', results: [{ cond: { stat: 'cha', min: 3 }, end: 'a_talk' }, { prob: 0.35, end: 'a_ghost' }, { end: 'd_screenshot' }] },
              { label: '（追上去）', results: [{ cond: { stat: 'str', min: 4 }, end: 'a_escape' }, { end: 'd_screenshot' }] },
            ],
          },
          wrong: {
            text: ['喔，抱歉，那是隔壁洞窟', '……隔壁也有洞窟嗎'],
            choices: [
              { label: '有，而且他比較兇', results: [{ cond: { stat: 'int', min: 2 }, end: 'a_ghost', gain: { int: 1 } }, { prob: 0.5, end: 'a_ghost' }, { end: 'a_rock' }] },
              { label: '（認真幫他指路）', results: [{ end: 'a_guide', gain: { cha: 1 } }] },
            ],
          },
        },
      },

      // ---------- 13 二手裝備商 ----------
      {
        id: 'gear', weight: 7, requires: ['merchant'],
        sender: { name: '老皮', kind: 'adventurer', avatar: '🎒' },
        nodes: {
          start: {
            text: ['哥布林先生，好久不見', '這次進了新貨', '「人類套裝」，穿上去沒人看得出來'],
            choices: [
              { label: '多少錢', results: [{ next: 'price' }] },
              { label: '上次那個是麻布袋', results: [{ next: 'complain' }] },
              { label: '（已讀不回）', results: [{ end: 'a_ghost' }] },
            ],
          },
          price: {
            text: ['友情價', '你全部的金幣就好', '真的，我只收你全部'],
            choices: [
              { label: '（全部給他）', results: [{ cond: { stat: 'gold', min: 50 }, next: 'wear', gain: { gold: -50 } }, { end: 'a_broke' }] },
              { label: '（翻口袋，只有一顆石頭）', results: [{ end: 'a_broke' }] },
              { label: '（走掉）', results: [{ end: 'a_ghost' }] },
            ],
          },
          complain: {
            text: ['那是初代', '這次是二代', '有領子'],
            choices: [
              { label: '（仔細看那個領子）', results: [{ cond: { stat: 'int', min: 2 }, end: 'a_broke', gain: { int: 1 } }, { prob: 0.5, end: 'a_broke' }, { next: 'wear' }] },
              { label: '有領子就不一樣了', results: [{ next: 'wear' }] },
            ],
          },
          wear: {
            text: ['（你穿上了）', '（麻布袋，挖三個洞）', '（但這次的洞挖得比較整齊）'],
            choices: [
              { label: '（去城裡試試）', results: [{ cond: { stat: 'cha', min: 4 }, end: 'a_talk' }, { cond: { stat: 'cha', min: 2 }, end: 'a_scam' }, { end: 'd_human' }] },
              { label: '（在洞窟裡穿就好）', results: [{ end: 'a_scam' }] },
              { label: '（先去給嘎嘎看）', results: [{ end: 'a_laughed' }] },
            ],
          },
        },
      },

      // ---------- 14 勇者團回頭找你 ----------
      {
        id: 'hero2', weight: 5, requires: ['party'],
        sender: { name: '勇者團隊長', kind: 'adventurer', avatar: '⚔️' },
        nodes: {
          start: {
            text: ['欸，上次那個小隻的', '我們缺一個站前面的', '你來不來'],
            choices: [
              { label: '我可以嗎', results: [{ next: 'yes' }] },
              { label: '站前面的是做什麼', results: [{ next: 'ask' }] },
              { label: '（已讀不回）', results: [{ end: 'a_ghost' }] },
            ],
          },
          yes: {
            text: ['你只要站在最前面', '我們在你後面輸出', '放心，魔王的招打不死人'],
            choices: [
              { label: '好', results: [{ cond: { stat: 'str', min: 5 }, next: 'boss' }, { end: 'a_small' }] },
              { label: '魔王？', results: [{ cond: { stat: 'int', min: 2 }, end: 'a_small', gain: { int: 1 } }, { next: 'boss' }] },
              { label: '（婉拒）', results: [{ end: 'a_ghost' }] },
            ],
          },
          ask: {
            text: ['就是站在最前面', '字面上的意思'],
            choices: [
              { label: '（婉拒）', results: [{ end: 'a_ghost', gain: { int: 1 } }] },
              { label: '（還是去了）', results: [{ next: 'boss' }] },
            ],
          },
          boss: {
            text: ['（魔王的影子罩了下來）', '（隊長在你後面喊：撐住！）'],
            choices: [
              { label: '（張開雙手擋住）', results: [{ cond: { stat: 'str', min: 6 }, end: 'a_escape', gain: { str: 1 } }, { end: 'd_tank' }] },
              { label: '（蹲下抱頭）', results: [{ cond: { stat: 'str', min: 3 }, end: 'a_escape' }, { prob: 0.4, end: 'a_escape' }, { end: 'd_tank' }] },
              { label: '（往旁邊跳）', results: [{ cond: { stat: 'str', min: 2 }, end: 'a_escape' }, { prob: 0.5, end: 'a_escape' }, { end: 'd_tank' }] },
            ],
          },
        },
      },

      // ---------- 15 健身房教練 ----------
      {
        id: 'coach', weight: 6, requires: ['act:gym'],
        sender: { name: '教練布魯', kind: 'adventurer', avatar: '🏋️' },
        nodes: {
          start: {
            text: ['你上次來做了三下就趴著', '我幫你排了課表', '哥布林也可以有胸肌'],
            choices: [
              { label: '真的嗎', results: [{ next: 'plan' }] },
              { label: '我沒錢', results: [{ end: 'a_broke' }] },
              { label: '（已讀不回）', results: [{ end: 'a_ghost' }] },
            ],
          },
          plan: {
            text: ['一週三次，一次兩小時', '每個月 60 金', '第一個月有優惠'],
            choices: [
              { label: '（付錢）', results: [{ cond: { stat: 'gold', min: 60 }, end: 'a_laughed', gain: { str: 2, gold: -60 } }, { end: 'a_broke' }] },
              { label: '可以用搬石頭代替嗎', results: [{ cond: { stat: 'str', min: 2 }, end: 'a_laughed', gain: { str: 1 } }, { end: 'a_laughed' }] },
              { label: '（已讀不回）', results: [{ end: 'a_ghost' }] },
            ],
          },
        },
      },

      // ---------- 16 洞口有狼 ----------
      {
        id: 'wolves', weight: 5,
        sender: { name: '嘎嘎', kind: 'goblin', avatar: '🧟' },
        nodes: {
          start: {
            text: ['兄弟', '洞口有狼', '三隻', '我躲在後面的通道'],
            choices: [
              { label: '（把石頭推上洞口）', results: [{ end: 'a_rule8' }] },
              { label: '（出去看看）', results: [{ next: 'out' }] },
              { label: '（叫嘎嘎先走）', results: [{ end: 'a_brotherless' }] },
            ],
          },
          out: {
            text: ['（三隻狼站在洞口）', '（牠們也看到你了）'],
            choices: [
              { label: '（大吼）', results: [{ cond: { stat: 'str', min: 4 }, end: 'a_escape', gain: { str: 1 } }, { prob: 0.3, end: 'a_escape' }, { end: 'd_run' }] },
              { label: '（慢慢往後退）', results: [{ cond: { stat: 'int', min: 2 }, end: 'a_escape' }, { prob: 0.5, end: 'a_escape' }, { end: 'd_run' }] },
              { label: '（跑）', results: [{ cond: { stat: 'str', min: 3 }, end: 'a_escape' }, { end: 'd_run' }] },
            ],
          },
        },
      },

      // ---------- 17 公會滿意度調查 ----------
      {
        id: 'survey', weight: 6,
        sender: { name: '公會客服', kind: 'adventurer', avatar: '📋' },
        nodes: {
          start: {
            text: ['親愛的用戶您好', '系統顯示您上個月被討伐了 3 次', '想請您填寫滿意度問卷，只要兩分鐘'],
            choices: [
              { label: '（填）', results: [{ next: 'form' }] },
              { label: '我還沒死', results: [{ next: 'alive' }] },
              { label: '（已讀不回）', results: [{ end: 'a_ghost' }] },
            ],
          },
          form: {
            text: ['第一題：您對本次討伐體驗的整體滿意度？', '1 非常不滿意 ～ 5 非常滿意'],
            choices: [
              { label: '1', results: [{ next: 'why' }] },
              { label: '3', results: [{ end: 'a_ghost' }] },
              { label: '5（怕被報復）', results: [{ cond: { stat: 'int', min: 2 }, end: 'a_ghost', gain: { int: 1 } }, { end: 'a_ghost' }] },
            ],
          },
          why: {
            text: ['感謝您的回饋', '請問不滿意的原因是？', '（態度／效率／價格／其他）'],
            choices: [
              { label: '其他：我不想被討伐', results: [{ end: 'a_ghost', gain: { int: 1 } }] },
              { label: '效率：他們砍了三刀才砍到', results: [{ cond: { stat: 'int', min: 3 }, end: 'a_ghost' }, { prob: 0.5, end: 'a_ghost' }, { end: 'd_screenshot' }] },
              { label: '（附上那幾個冒險者的名字）', results: [{ end: 'd_screenshot' }] },
            ],
          },
          alive: {
            text: ['（系統自動回覆）', '感謝您的回饋，我們已將您的意見轉達相關單位', '（三分鐘後，洞口傳來腳步聲）'],
            choices: [
              { label: '（把石頭推上洞口）', results: [{ end: 'a_rule8' }] },
              { label: '（躲到深處）', results: [{ cond: { stat: 'int', min: 2 }, end: 'a_escape' }, { prob: 0.5, end: 'a_escape' }, { end: 'd_newbie' }] },
            ],
          },
        },
      },

      // ---------- 18 生日派對群組（加錯人） ----------
      {
        id: 'elfgroup', weight: 6,
        sender: { name: '艾琳娜', kind: 'elf', avatar: '🎀' },
        nodes: {
          start: {
            text: ['【你被加入群組：莉亞生日🎂】', '大家這週六森林邊見～', '記得帶禮物'],
            choices: [
              { label: '請問我可以帶什麼', results: [{ next: 'gift' }] },
              { label: '（已讀不回）', results: [{ end: 'a_ghost' }] },
              { label: '（默默退出群組）', results: [{ end: 'a_rock' }] },
            ],
          },
          gift: {
            text: ['你是誰？', '這個群組是不是加錯人了', '（有人開始在群組裡點名）'],
            choices: [
              { label: '（老實說自己是哥布林）', results: [{ cond: { stat: 'cha', min: 4 }, end: 'a_talk' }, { cond: { stat: 'cha', min: 2 }, end: 'a_missed' }, { end: 'd_arrow' }] },
              { label: '（傳一張石頭的照片）這是禮物', results: [{ cond: { stat: 'int', min: 3 }, end: 'a_talk', gain: { cha: 1 } }, { prob: 0.4, end: 'a_missed' }, { end: 'd_arrow' }] },
              { label: '（默默退出群組）', results: [{ end: 'a_rock' }] },
            ],
          },
        },
      },

      // ---------- 19 隔壁洞窟的老薩滿 ----------
      {
        id: 'shaman_old', weight: 6,
        sender: { name: '老薩滿咕嚕', kind: 'goblin', avatar: '🦴' },
        nodes: {
          start: {
            text: ['年輕的', '你最近是不是一直在回訊息', '那個東西會把你的命吸走'],
            choices: [
              { label: '什麼東西', results: [{ next: 'warn' }] },
              { label: '（把手機收起來）', results: [{ end: 'a_rock' }] },
              { label: '（已讀不回）', results: [{ end: 'a_ghost', gain: { int: 1 } }] },
            ],
          },
          warn: {
            text: ['那個會發光的板子', '我們這一輩死掉的，有一半是因為它', '（他傳了一張自己用的石板照片）'],
            choices: [
              { label: '石板不能傳訊息', results: [{ cond: { stat: 'int', min: 2 }, end: 'a_ghost', gain: { int: 1 } }, { end: 'a_laughed' }] },
              { label: '那你現在是用什麼傳訊息給我', results: [{ next: 'caught' }] },
              { label: '我會小心', results: [{ end: 'a_rock', gain: { int: 1 } }] },
            ],
          },
          caught: {
            text: ['……', '（他下線了）'],
            choices: [
              { label: '（也下線）', results: [{ end: 'a_rock', gain: { int: 1 } }] },
              { label: '（繼續回訊息）', results: [{ end: 'a_ghost' }] },
            ],
          },
        },
      },

      // ---------- R1 稀有：好心老兵 ----------
      {
        id: 'rare_vet', weight: 1, rare: true,
        sender: { name: '老兵哈克', kind: 'adventurer', avatar: '🛡️' },
        nodes: {
          start: {
            text: ['別緊張，我不是來討伐的', '我只是路過，看到有燈', '可以坐一下嗎？腿不太好'],
            choices: [
              { label: '請坐', results: [{ next: 'sit' }] },
              { label: '你一定是騙我的', results: [{ end: 'a_ghost' }] },
              { label: '（先把石頭藏起來）', results: [{ next: 'sit' }] },
            ],
          },
          // 坐下來只是開場，要真的搭話才會收成結局
          sit: {
            text: ['（他坐下，把劍放在身側，沒有拔出來）', '謝了。走一整天了', '……你不像公告上寫的那樣'],
            choices: [
              { label: '公告上寫什麼？', results: [{ next: 'talk' }] },
              { label: '（倒了一杯給他）', results: [{ next: 'talk' }] },
              { label: '（不說話，繼續藏石頭）', results: [{ end: 'a_rock' }] },
            ],
          },
          talk: {
            text: ['他笑了一下，講起他年輕的時候', '那時候他也被人指著說是怪物', '「你幾歲了？」'],
            choices: [
              { label: '（老實回答）', results: [{ end: 'a_friend' }] },
              { label: '嘎嘎（忘記他聽不懂）', results: [{ end: 'a_friend' }] },
              { label: '（把石頭拿出來給他看）', results: [{ end: 'a_friend' }] },
            ],
          },
        },
      },

      // ---------- R2 稀有：受傷的精靈 ----------
      {
        id: 'rare_elf', weight: 1, rare: true,
        sender: { name: '伊芙', kind: 'elf', avatar: '✨' },
        nodes: {
          start: {
            text: ['（洞口傳來聲音，一個精靈倒在地上，手臂在流血）', '……有人在嗎', '拜託'],
            choices: [
              { label: '（把她扶進洞窟，用乾淨的布包紮）', results: [{ next: 'wake' }] },
              { label: '（跳出來大喊「嘎！」當開場白）', results: [{ end: 'd_scare' }] },
              { label: '（裝沒看見）', results: [{ end: 'd_cold' }] },
            ],
          },
          wake: {
            text: ['（她醒了，看著你）', '……你是哥布林', '你們不是有守則說不能靠近精靈嗎', '你為什麼救我'],
            choices: [
              { label: '守則說不能襲擊，沒說不能救', results: [{ cond: { stat: 'int', min: 2 }, next: 'stay' }, { prob: 0.6, next: 'stay' }, { end: 'a_missed' }] },
              { label: '因為你流血了，就這樣', results: [{ cond: { stat: 'cha', min: 1 }, next: 'stay' }, { cond: { stat: 'int', min: 1 }, next: 'stay' }, { end: 'a_missed' }] },
              { label: '嘎……嘎嘎', results: [{ end: 'a_missed' }] },
              { label: '因為我在練習當一個好人', results: [{ cond: { stat: 'int', min: 3 }, next: 'stay' }, { prob: 0.5, next: 'stay' }, { end: 'a_missed' }] },
            ],
          },
          stay: {
            text: ['（她沉默了很久）', '我可以在這裡休息幾天嗎', '……我不會告訴公會這裡有哥布林'],
            choices: [
              { label: '你想待多久都可以', results: [{ end: 't_elf' }] },
              { label: '好，但你要先交出弓', results: [{ next: 'bow' }] },
            ],
          },
          bow: {
            text: ['（她看了你很久，然後把弓解下來，放在你面前）', '……好'],
            choices: [
              { label: '（把弓推回去給她）', results: [{ end: 't_elf' }] },
              { label: '（收下，放到自己那一側）', results: [{ cond: { stat: 'cha', min: 4 }, end: 't_elf' }, { end: 'a_missed' }] },
            ],
          },
        },
      },
    ],
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = SCENARIO;
  else root.SCENARIO = SCENARIO;
})(typeof window !== 'undefined' ? window : globalThis);
