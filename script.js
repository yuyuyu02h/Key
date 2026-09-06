'use strict';
/* ==========================================================================
   Origami Keyboard — script.js

   Swift/UIKit へ移植しやすいように、責務ごとにセクションを分離しています。
     1. LAYOUTS / DATA    … キー配列の定義（Swift側では struct や enum に対応）
     2. KeyboardState     … 現在のモードや設定（UIInputViewController が持つ状態に対応）
     3. TextModel         … 入力バッファとカーソル位置（UITextDocumentProxy に対応）
     4. UIRenderer        … 画面描画のみを担当（UIKit では layout/draw に対応）
     5. GestureHandler    … タップ／フリック／長押し／ドラッグの検出
        （UIKit では UIGestureRecognizer 群に対応）
     6. KeyHandler        … ジェスチャーの結果を「入力の意味」に変換する層
     7. App               … 初期化・イベント結線
   ========================================================================== */


/* ==========================================================================
   1. LAYOUTS / DATA
   ========================================================================== */

// 日本語フリック配列（12キー、独自配列）
const JA_FLICK_ROWS = [
  [
    { id:'ka1', kind:'char', center:'あ', up:'い', right:'う', down:'え', left:'お' },
    { id:'ka2', kind:'char', center:'か', up:'き', right:'く', down:'け', left:'こ' },
    { id:'ka3', kind:'char', center:'さ', up:'し', right:'す', down:'せ', left:'そ' },
  ],
  [
    { id:'ka4', kind:'char', center:'た', up:'ち', right:'つ', down:'て', left:'と' },
    { id:'ka5', kind:'char', center:'な', up:'に', right:'ぬ', down:'ね', left:'の' },
    { id:'ka6', kind:'char', center:'は', up:'ひ', right:'ふ', down:'へ', left:'ほ' },
  ],
  [
    { id:'ka7', kind:'char', center:'ま', up:'み', right:'む', down:'め', left:'も' },
    { id:'ka8', kind:'char', center:'や', up:'ゆ', right:'ょ', down:'よ', left:'ゃ' },
    { id:'ka9', kind:'char', center:'ら', up:'り', right:'る', down:'れ', left:'ろ' },
  ],
  [
    { id:'dakuten', kind:'fn', fn:'dakuten', label:'゛゜小', cls:'key--fn' },
    { id:'ka0', kind:'char', center:'わ', up:'を', right:'っ', down:'ん', left:'ー' },
    { id:'delete', kind:'fn', fn:'delete', label:'⌫', cls:'key--fn key--delete' },
  ],
  [
    { id:'globe', kind:'fn', fn:'globe', label:'A/#', cls:'key--fn key--globe' },
    { id:'numtoggle', kind:'fn', fn:'numtoggle', label:'123', cls:'key--fn key--num' },
    { id:'space', kind:'fn', fn:'space', label:'空白', cls:'key--fn key--space' },
    { id:'return', kind:'fn', fn:'return', label:'改行', cls:'key--fn key--return' },
  ],
];

// 数字モード（日本語から遷移。ガラケーのダイヤルパッド風・フリックのみ、連続タップでの切替は無し）
const JA_NUM_ROWS = [
  [ { id:'n1', kind:'char', center:'1', up:'(' }, { id:'n2', kind:'char', center:'2', up:')' }, { id:'n3', kind:'char', center:'3', up:'/' } ],
  [ { id:'n4', kind:'char', center:'4', up:'-' }, { id:'n5', kind:'char', center:'5', up:'+' }, { id:'n6', kind:'char', center:'6', up:'=' } ],
  [ { id:'n7', kind:'char', center:'7', up:'*' }, { id:'n8', kind:'char', center:'8', up:'#' }, { id:'n9', kind:'char', center:'9', up:'%' } ],
  [
    { id:'star', kind:'char', center:'*', up:'・' },
    { id:'n0', kind:'char', center:'0', up:'ー' },
    { id:'delete', kind:'fn', fn:'delete', label:'⌫', cls:'key--fn key--delete' },
  ],
  [
    { id:'globe', kind:'fn', fn:'globe', label:'A/#', cls:'key--fn key--globe' },
    { id:'numtoggle', kind:'fn', fn:'numtoggle', label:'あ', cls:'key--fn key--num' },
    { id:'space', kind:'fn', fn:'space', label:'空白', cls:'key--fn key--space' },
    { id:'return', kind:'fn', fn:'return', label:'改行', cls:'key--fn key--return' },
  ],
];

// 英語 QWERTY（フリックは使わず、母音の長押しでアクセント候補を出す）
const EN_QWERTY_ROWS = [
  'qwertyuiop'.split('').map(c => ({ id:'c-'+c, kind:'char', center:c })),
  'asdfghjkl'.split('').map(c => ({ id:'c-'+c, kind:'char', center:c })),
  [
    { id:'shift', kind:'fn', fn:'shift', label:'⇧', cls:'key--fn' },
    ...'zxcvbnm'.split('').map(c => ({ id:'c-'+c, kind:'char', center:c })),
    { id:'delete', kind:'fn', fn:'delete', label:'⌫', cls:'key--fn key--delete' },
  ],
  [
    { id:'globe', kind:'fn', fn:'globe', label:'⊕', cls:'key--fn key--globe' },
    { id:'numtoggle', kind:'fn', fn:'numtoggle', label:'123', cls:'key--fn key--num' },
    { id:'space', kind:'fn', fn:'space', label:'space', cls:'key--fn key--space' },
    { id:'return', kind:'fn', fn:'return', label:'return', cls:'key--fn key--return' },
  ],
];

// 英語モードの数字画面（QWERTY配列側の「123」から来る専用レイアウト。ページが2つある）
const EN_NUM_ROWS_PAGE1 = [
  '1234567890'.split('').map(c => ({ id:'d-'+c, kind:'char', center:c })),
  '-/:;()$&@"'.split('').map(c => ({ id:'s1-'+c, kind:'char', center:c })),
  [
    { id:'more', kind:'fn', fn:'more-symbols', label:'#+=', cls:'key--fn' },
    ...".,?!'".split('').map(c => ({ id:'p1-'+c, kind:'char', center:c })),
    { id:'delete', kind:'fn', fn:'delete', label:'⌫', cls:'key--fn key--delete' },
  ],
  [
    { id:'globe', kind:'fn', fn:'globe', label:'⊕', cls:'key--fn key--globe' },
    { id:'numtoggle', kind:'fn', fn:'numtoggle', label:'ABC', cls:'key--fn key--num' },
    { id:'space', kind:'fn', fn:'space', label:'space', cls:'key--fn key--space' },
    { id:'return', kind:'fn', fn:'return', label:'return', cls:'key--fn key--return' },
  ],
];
const EN_NUM_ROWS_PAGE2 = [
  '1234567890'.split('').map(c => ({ id:'d-'+c, kind:'char', center:c })),
  '_\\|~<>€£¥•'.split('').map(c => ({ id:'s2-'+c, kind:'char', center:c })),
  [
    { id:'more', kind:'fn', fn:'more-symbols', label:'123', cls:'key--fn' },
    ...".,?!'".split('').map(c => ({ id:'p2-'+c, kind:'char', center:c })),
    { id:'delete', kind:'fn', fn:'delete', label:'⌫', cls:'key--fn key--delete' },
  ],
  [
    { id:'globe', kind:'fn', fn:'globe', label:'⊕', cls:'key--fn key--globe' },
    { id:'numtoggle', kind:'fn', fn:'numtoggle', label:'ABC', cls:'key--fn key--num' },
    { id:'space', kind:'fn', fn:'space', label:'space', cls:'key--fn key--space' },
    { id:'return', kind:'fn', fn:'return', label:'return', cls:'key--fn key--return' },
  ],
];

// 濁点・半濁点・小文字の循環グループ（濁点キー用）
const DAKUTEN_GROUPS = [
  ['か','が'], ['き','ぎ'], ['く','ぐ'], ['け','げ'], ['こ','ご'],
  ['さ','ざ'], ['し','じ'], ['す','ず'], ['せ','ぜ'], ['そ','ぞ'],
  ['た','だ'], ['ち','ぢ'], ['つ','づ','っ'], ['て','で'], ['と','ど'],
  ['は','ば','ぱ'], ['ひ','び','ぴ'], ['ふ','ぶ','ぷ'], ['へ','べ','ぺ'], ['ほ','ぼ','ぽ'],
  ['あ','ぁ'], ['い','ぃ'], ['う','ぅ','ゔ'], ['え','ぇ'], ['お','ぉ'],
  ['や','ゃ'], ['ゆ','ゅ'], ['よ','ょ'], ['わ','ゎ'],
];
const DAKUTEN_LOOKUP = {};
DAKUTEN_GROUPS.forEach(group => {
  group.forEach((ch, i) => { DAKUTEN_LOOKUP[ch] = { group, index:i }; });
});

// 英語モード：母音などの長押しで出すアクセント候補
const ACCENT_MAP = {
  a: ['á','à','â','ä','ã','å'],
  e: ['é','è','ê','ë'],
  i: ['í','ì','î','ï'],
  o: ['ó','ò','ô','ö','õ'],
  u: ['ú','ù','û','ü'],
  n: ['ñ'],
  c: ['ç'],
  s: ['ß','š'],
};

// 濁点キーが「未入力状態」のときに出す記号一覧
const SYMBOL_ITEMS = ['、','。','・','「','」','『','』','〜','ー','…','!','?','(',')','+','-','/','%','&','#','@','*'];

// よく使う文章（ワンタップ入力）
const QUICK_PHRASES = ['よろしくお願いします', 'ありがとうございます！', '了解です！', '承知しました。', 'お疲れさまです。'];

const LONGPRESS_MS = 420;
const DRAG_CHAR_PX = 14; // スペースキーをこの距離なぞるとカーソルが1文字分動く


/* ==========================================================================
   2. KeyboardState — 現在の状態
   ========================================================================== */
const state = {
  mode: 'ja',          // 'ja' | 'ja-num' | 'en' | 'en-num'
  shift: false,        // 英語モードの次の1文字を大文字にするか
  enNumPage: 1,        // 英語の数字/記号画面のページ（1 or 2）
  settings: {
    sound: true,
    haptic: true,
    flickThreshold: 18, // これ以上動いたらフリックとみなす（px）
  },
};

function toggleGlobe(){
  const next = { ja:'en', en:'ja', 'ja-num':'en-num', 'en-num':'ja-num' };
  state.mode = next[state.mode];
}
function toggleNum(){
  const next = { ja:'ja-num', 'ja-num':'ja', en:'en-num', 'en-num':'en' };
  state.mode = next[state.mode];
}
function getLayoutRows(){
  if(state.mode === 'ja') return JA_FLICK_ROWS;
  if(state.mode === 'ja-num') return JA_NUM_ROWS;
  if(state.mode === 'en') return EN_QWERTY_ROWS;
  return state.enNumPage === 1 ? EN_NUM_ROWS_PAGE1 : EN_NUM_ROWS_PAGE2;
}


/* ==========================================================================
   3. TextModel — 入力バッファとカーソル
   ========================================================================== */
const TextModel = {
  text: '',
  cursor: 0,

  insert(str){
    this.text = this.text.slice(0, this.cursor) + str + this.text.slice(this.cursor);
    this.cursor += str.length;
  },
  deleteBackward(){
    if(this.cursor === 0) return;
    this.text = this.text.slice(0, this.cursor - 1) + this.text.slice(this.cursor);
    this.cursor -= 1;
  },
  // 削除キーの左フリック：直前の「、」「。」の位置まで一気に削除し、そこで止まる。
  // カーソルの直前がすでに句読点の場合はその1文字を消してから、
  // さらに前の句読点を探す（同じ場所で止まり続けないようにする）。
  // 句読点が見つからなければ先頭まで全部削除する。
  deleteToPunctuation(){
    if(this.cursor === 0) return;
    const after = this.text.slice(this.cursor);
    let i = this.cursor - 1;
    if(this.text[i] === '、' || this.text[i] === '。'){ i -= 1; }
    let idx = -1;
    for(let j = i; j >= 0; j--){
      if(this.text[j] === '、' || this.text[j] === '。'){ idx = j; break; }
    }
    if(idx === -1){
      this.text = after;
      this.cursor = 0;
    } else {
      this.text = this.text.slice(0, idx + 1) + after;
      this.cursor = idx + 1;
    }
  },
  moveCursor(delta){
    this.cursor = Math.max(0, Math.min(this.text.length, this.cursor + delta));
  },
  replaceLastChar(newChar){
    if(this.cursor === 0) return;
    this.text = this.text.slice(0, this.cursor - 1) + newChar + this.text.slice(this.cursor);
  },
  lastChar(){
    return this.cursor > 0 ? this.text[this.cursor - 1] : '';
  },
};


/* ==========================================================================
   4. UIRenderer — 画面描画
   ========================================================================== */
function escapeHtml(str){
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function renderText(){
  const el = document.getElementById('textDisplay');
  const hint = document.getElementById('textHint');
  const before = escapeHtml(TextModel.text.slice(0, TextModel.cursor));
  const after = escapeHtml(TextModel.text.slice(TextModel.cursor));
  el.innerHTML = before + '<span class="text-cursor"></span>' + after;
  hint.classList.toggle('is-hidden', TextModel.text.length > 0);
}

function updateModeLabel(){
  const labels = {
    'ja': '日本語 ・ フリック配列',
    'ja-num': '数字 ・ フリック配列',
    'en': 'English ・ QWERTY',
    'en-num': 'Numbers ・ QWERTY',
  };
  document.getElementById('modeSubLabel').textContent = labels[state.mode];
}

function buildKeyElement(keyDef){
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'key' + (keyDef.cls ? ' ' + keyDef.cls : '');
  btn.dataset.id = keyDef.id;

  let label = keyDef.kind === 'fn' ? keyDef.label : keyDef.center;
  if(keyDef.kind === 'char' && state.mode === 'en' && state.shift){
    label = label.toUpperCase();
  }
  const labelSpan = document.createElement('span');
  labelSpan.className = 'key__label';
  labelSpan.textContent = label;
  btn.appendChild(labelSpan);

  if(keyDef.kind === 'char' && keyDef.up){
    const sub = document.createElement('span');
    sub.className = 'key__sub';
    sub.textContent = keyDef.up;
    btn.appendChild(sub);
  }
  if(keyDef.fn === 'shift' && state.shift){
    btn.classList.add('is-active');
  }

  GestureHandler.attach(btn, keyDef);
  return btn;
}

function renderKeyboard(){
  const wrap = document.getElementById('kbRows');
  wrap.innerHTML = '';
  getLayoutRows().forEach(row => {
    const rowEl = document.createElement('div');
    rowEl.className = 'kb-row';
    row.forEach(keyDef => rowEl.appendChild(buildKeyElement(keyDef)));
    wrap.appendChild(rowEl);
  });
  updateModeLabel();
}

function renderPhraseBar(){
  const bar = document.getElementById('phraseBar');
  bar.innerHTML = '';
  QUICK_PHRASES.forEach(phrase => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'phrase-chip';
    chip.textContent = phrase;
    chip.addEventListener('click', () => {
      TextModel.insert(phrase);
      renderText();
      playFeedback();
    });
    bar.appendChild(chip);
  });
}

function renderSymbolGrid(){
  const grid = document.getElementById('symbolGrid');
  grid.innerHTML = '';
  SYMBOL_ITEMS.forEach(sym => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = sym;
    b.addEventListener('click', () => {
      TextModel.insert(sym);
      renderText();
      closeSheet('symbolSheet');
      playFeedback();
    });
    grid.appendChild(b);
  });
}

function openSheet(id){ document.getElementById(id).hidden = false; }
function closeSheet(id){ document.getElementById(id).hidden = true; }
function openSymbolSheet(){ renderSymbolGrid(); openSheet('symbolSheet'); }

// --- フリック方向プレビュー（浮遊バブル） ---
function showFlickBubble(keyEl, keyDef){
  const bubble = document.getElementById('flickBubble');
  const rect = keyEl.getBoundingClientRect();
  bubble.style.left = (rect.left + rect.width / 2 - 75) + 'px';
  bubble.style.top = (rect.top - 158) + 'px';
  bubble.querySelector('.flick-bubble__cell--center').textContent = keyDef.center ?? '';
  bubble.querySelector('.flick-bubble__cell--up').textContent = keyDef.up ?? '';
  bubble.querySelector('.flick-bubble__cell--right').textContent = keyDef.right ?? '';
  bubble.querySelector('.flick-bubble__cell--down').textContent = keyDef.down ?? '';
  bubble.querySelector('.flick-bubble__cell--left').textContent = keyDef.left ?? '';
  bubble.hidden = false;
  highlightFlickDirection('center');
}
function highlightFlickDirection(dir){
  document.querySelectorAll('.flick-bubble__cell').forEach(c => c.classList.remove('flick-bubble__cell--active'));
  const el = document.querySelector('.flick-bubble__cell--' + dir);
  if(el) el.classList.add('flick-bubble__cell--active');
}
function hideFlickBubble(){ document.getElementById('flickBubble').hidden = true; }

// --- 長押しアクセント候補ポップアップ（英語モード） ---
function showAccentPopup(keyEl, options){
  const popup = document.getElementById('accentPopup');
  popup.innerHTML = '';
  options.forEach((opt, i) => {
    const d = document.createElement('div');
    d.className = 'accent-popup__opt';
    d.dataset.index = i;
    d.textContent = state.shift ? opt.toUpperCase() : opt;
    popup.appendChild(d);
  });
  const rect = keyEl.getBoundingClientRect();
  popup.style.left = (rect.left + rect.width / 2 - (options.length * 38) / 2) + 'px';
  popup.style.top = (rect.top - 50) + 'px';
  popup.hidden = false;
}
function highlightAccentOption(index){
  document.querySelectorAll('.accent-popup__opt').forEach(el => el.classList.remove('is-active'));
  const el = document.querySelector('.accent-popup__opt[data-index="' + index + '"]');
  if(el) el.classList.add('is-active');
}
function hideAccentPopup(){ document.getElementById('accentPopup').hidden = true; }

// --- 効果音・触覚フィードバック ---
let audioCtx = null;
function playFeedback(){
  if(state.settings.haptic && navigator.vibrate){ navigator.vibrate(6); }
  if(state.settings.sound){
    try{
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.value = 620;
      gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.05);
    }catch(e){ /* オーディオが使えない環境では無視 */ }
  }
}


/* ==========================================================================
   5. GestureHandler — タップ／フリック／長押し／ドラッグの検出
   ========================================================================== */
const GestureHandler = {
  attach(el, keyDef){
    let startX = 0, startY = 0;
    let longPressTimer = null;
    let longPressFired = false;
    let dragging = false;
    let dragAccum = 0;
    let lastDragX = 0;
    let currentDir = 'center';
    let accentOptions = null;
    let accentIndex = 0;

    const isFlickable = keyDef.kind === 'char' && (keyDef.up || keyDef.down || keyDef.left || keyDef.right);
    const isSpace = keyDef.fn === 'space';
    const isDelete = keyDef.fn === 'delete';

    function onDown(e){
      el.setPointerCapture(e.pointerId);
      startX = e.clientX; startY = e.clientY;
      lastDragX = startX;
      longPressFired = false; dragging = false; dragAccum = 0;
      currentDir = 'center'; accentOptions = null; accentIndex = 0;
      el.classList.add('is-pressed');

      if(isFlickable) showFlickBubble(el, keyDef);

      longPressTimer = setTimeout(() => {
        const letter = keyDef.kind === 'char' ? keyDef.center.toLowerCase() : null;
        if(state.mode === 'en' && letter && ACCENT_MAP[letter]){
          longPressFired = true;
          accentOptions = ACCENT_MAP[letter];
          accentIndex = 0;
          hideFlickBubble();
          showAccentPopup(el, accentOptions);
          highlightAccentOption(0);
        }
      }, LONGPRESS_MS);
    }

    function onMove(e){
      const dx = e.clientX - startX, dy = e.clientY - startY;
      const dist = Math.hypot(dx, dy);

      // アクセント候補選択中：横方向のドラッグで候補を切り替える
      if(accentOptions){
        const idx = Math.max(0, Math.min(
          accentOptions.length - 1,
          Math.round(accentOptions.length / 2 + dx / 38)
        ));
        accentIndex = idx;
        highlightAccentOption(idx);
        return;
      }

      // スペースキー：トラックパッド化してカーソルを移動
      if(isSpace && dist > 6){
        if(!dragging){
          dragging = true;
          clearTimeout(longPressTimer);
        }
        const stepDx = e.clientX - lastDragX;
        dragAccum += stepDx;
        while(Math.abs(dragAccum) >= DRAG_CHAR_PX){
          const dir = dragAccum > 0 ? 1 : -1;
          TextModel.moveCursor(dir);
          dragAccum -= dir * DRAG_CHAR_PX;
        }
        lastDragX = e.clientX;
        renderText();
        return;
      }

      if(dist > state.settings.flickThreshold){
        clearTimeout(longPressTimer);
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        if(angle >= -45 && angle < 45) currentDir = 'right';
        else if(angle >= 45 && angle < 135) currentDir = 'down';
        else if(angle >= -135 && angle < -45) currentDir = 'up';
        else currentDir = 'left';
      } else {
        currentDir = 'center';
      }
      if(isFlickable) highlightFlickDirection(currentDir);
    }

    function onUp(){
      clearTimeout(longPressTimer);
      el.classList.remove('is-pressed');
      hideFlickBubble();

      if(accentOptions){
        KeyHandler.insertChar(accentOptions[accentIndex] ?? accentOptions[0]);
        hideAccentPopup();
        return;
      }
      hideAccentPopup();

      if(isSpace && dragging) return; // ドラッグでカーソル移動済み。文字は入力しない

      if(longPressFired) return; // 長押し処理はすでに済んでいる

      if(isDelete && currentDir === 'left'){
        TextModel.deleteToPunctuation();
        renderText();
        playFeedback();
        return;
      }

      if(isFlickable && currentDir !== 'center'){
        KeyHandler.insertChar(keyDef[currentDir] ?? keyDef.center);
        playFeedback();
        return;
      }

      KeyHandler.handleTap(keyDef);
      playFeedback();
    }

    function onCancel(){
      clearTimeout(longPressTimer);
      el.classList.remove('is-pressed');
      hideFlickBubble();
      hideAccentPopup();
      dragging = false;
      accentOptions = null;
    }

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onCancel);
  },
};


/* ==========================================================================
   6. KeyHandler — ジェスチャー結果を「入力の意味」に変換する
   ========================================================================== */
const KeyHandler = {
  insertChar(ch){
    if(state.mode === 'en' && state.shift){
      ch = ch.toUpperCase();
      state.shift = false;
      TextModel.insert(ch);
      renderText();
      renderKeyboard();
      return;
    }
    TextModel.insert(ch);
    renderText();
  },

  handleTap(keyDef){
    if(keyDef.kind === 'char'){
      this.insertChar(keyDef.center);
      return;
    }
    this.handleFunction(keyDef.fn);
  },

  handleFunction(fn){
    switch(fn){
      case 'delete':
        TextModel.deleteBackward();
        renderText();
        break;
      case 'space':
        TextModel.insert(' ');
        renderText();
        break;
      case 'return':
        TextModel.insert('\n');
        renderText();
        break;
      case 'shift':
        state.shift = !state.shift;
        renderKeyboard();
        break;
      case 'globe':
        toggleGlobe();
        renderKeyboard();
        break;
      case 'numtoggle':
        toggleNum();
        renderKeyboard();
        break;
      case 'more-symbols':
        state.enNumPage = state.enNumPage === 1 ? 2 : 1;
        renderKeyboard();
        break;
      case 'dakuten': {
        const last = TextModel.lastChar();
        if(!last){ openSymbolSheet(); break; }
        const info = DAKUTEN_LOOKUP[last];
        if(!info) break; // 対象外の文字はそのまま（何もしない）
        TextModel.replaceLastChar(info.group[(info.index + 1) % info.group.length]);
        renderText();
        playFeedback();
        break;
      }
    }
  },
};


/* ==========================================================================
   7. App — 初期化・画面のイベント結線
   ========================================================================== */
const App = {
  init(){
    renderText();
    renderKeyboard();
    renderPhraseBar();
    this.bindChrome();
    this.tickClock();
    setInterval(() => this.tickClock(), 30000);
  },
  bindChrome(){
    document.getElementById('settingsBtn').addEventListener('click', () => openSheet('settingsSheet'));
    document.getElementById('settingsClose').addEventListener('click', () => closeSheet('settingsSheet'));
    document.getElementById('symbolClose').addEventListener('click', () => closeSheet('symbolSheet'));
    document.getElementById('soundToggle').addEventListener('change', e => { state.settings.sound = e.target.checked; });
    document.getElementById('hapticToggle').addEventListener('change', e => { state.settings.haptic = e.target.checked; });
    document.getElementById('sensitivitySlider').addEventListener('input', e => { state.settings.flickThreshold = Number(e.target.value); });
    document.getElementById('clearTextBtn').addEventListener('click', () => {
      TextModel.text = ''; TextModel.cursor = 0;
      renderText();
      closeSheet('settingsSheet');
    });
  },
  tickClock(){
    const now = new Date();
    document.getElementById('clock').textContent =
      String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
