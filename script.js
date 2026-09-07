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
// フリック方向と母音の対応： 中央=あ段／左=い段／上=う段／右=え段／下=お段
const JA_FLICK_ROWS = [
  [
    { id:'ka1', kind:'char', center:'あ', left:'い', up:'う', right:'え', down:'お' },
    { id:'ka2', kind:'char', center:'か', left:'き', up:'く', right:'け', down:'こ' },
    { id:'ka3', kind:'char', center:'さ', left:'し', up:'す', right:'せ', down:'そ' },
  ],
  [
    { id:'ka4', kind:'char', center:'た', left:'ち', up:'つ', right:'て', down:'と' },
    { id:'ka5', kind:'char', center:'な', left:'に', up:'ぬ', right:'ね', down:'の' },
    { id:'ka6', kind:'char', center:'は', left:'ひ', up:'ふ', right:'へ', down:'ほ' },
  ],
  [
    { id:'ka7', kind:'char', center:'ま', left:'み', up:'む', right:'め', down:'も' },
    { id:'ka8', kind:'char', center:'や', left:'ゃ', up:'ゆ', right:'ょ', down:'よ' },
    { id:'ka9', kind:'char', center:'ら', left:'り', up:'る', right:'れ', down:'ろ' },
  ],
  [
    { id:'dakuten', kind:'fn', fn:'dakuten', label:'゛゜小', cls:'key--fn' },
    { id:'ka0', kind:'char', center:'わ', left:'ん', up:'ー', right:'っ', down:'を' },
    { id:'punct', kind:'char', center:'、', left:'？', up:'。', right:'！', down:'…' },
  ],
  [
    { id:'globe', kind:'fn', fn:'globe', label:'A/#', cls:'key--fn key--globe' },
    { id:'numtoggle', kind:'fn', fn:'numtoggle', label:'123', cls:'key--fn key--num' },
    { id:'space', kind:'fn', fn:'space', label:'空白', cls:'key--fn key--space' },
    { id:'delete', kind:'fn', fn:'delete', label:'⌫', cls:'key--fn key--delete' },
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
   3.5 Composition — かな漢字変換（プリエディット）
   日本語モードでは、確定前の文字は Composition.buffer に貯め、
   スペースキーで変換候補を呼び出す（＝本物のIMEの下線付き未確定文字と同じ仕組み）。
   簡易辞書のみのため変換範囲は限定的だが、変換機能そのものは実装している。
   ========================================================================== */
const CONVERSION_DICT = {
  'きょう':['今日','京'], 'あした':['明日'], 'あさって':['明後日'], 'きのう':['昨日'],
  'わたし':['私'], 'ぼく':['僕'], 'ありがとう':['有難う','ありがとう'],
  'おはよう':['おはよう','お早う'], 'こんにちは':['今日は','こんにちは'],
  'こんばんは':['今晩は','こんばんは'], 'よろしく':['宜しく'], 'おねがいします':['お願いします'],
  'かいぎ':['会議'], 'しごと':['仕事'], 'がっこう':['学校'], 'せんせい':['先生'],
  'がくせい':['学生'], 'でんわ':['電話'], 'じかん':['時間'], 'きょうと':['京都'],
  'とうきょう':['東京'], 'にほん':['日本'], 'げんき':['元気'], 'たべる':['食べる'],
  'いく':['行く'], 'みる':['見る'], 'てんき':['天気'], 'かんじ':['漢字'],
  'にゅうりょく':['入力'], 'へんかん':['変換'], 'けいたい':['携帯'], 'かいしゃ':['会社'],
  'さくせい':['作成'], 'かくにん':['確認'], 'しつもん':['質問'], 'かいとう':['回答'],
};

function toKatakana(str){
  return str.replace(/[\u3041-\u3096]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60));
}
function getCandidates(buffer){
  const list = [...(CONVERSION_DICT[buffer] || [])];
  if(!list.includes(buffer)) list.push(buffer);       // ひらがなのまま
  const kata = toKatakana(buffer);
  if(kata !== buffer && !list.includes(kata)) list.push(kata); // カタカナ変換
  return list;
}

const Composition = {
  buffer: '',        // 未確定のかな文字列
  candidates: null,  // 現在のバッファに対する変換候補（予測変換バー用に常に最新化する）
  candidateIndex: 0,

  isActive(){ return this.buffer.length > 0; },

  _refreshCandidates(){
    this.candidates = this.buffer ? getCandidates(this.buffer) : null;
    this.candidateIndex = 0;
  },
  addChar(ch){
    this.buffer += ch;
    this._refreshCandidates();
  },
  backspace(){
    this.buffer = this.buffer.slice(0, -1);
    this._refreshCandidates();
  },
  cycleCandidate(){
    if(!this.candidates || this.candidates.length === 0) return;
    this.candidateIndex = (this.candidateIndex + 1) % this.candidates.length;
  },
  currentDisplay(){
    return this.candidates ? this.candidates[this.candidateIndex] : this.buffer;
  },
  reset(){ this.buffer = ''; this.candidates = null; this.candidateIndex = 0; },
};

// 未確定文字列を確定してTextModelへ書き込む（＝改行キーの「確定」動作の本体）
function commitComposition(){
  if(!Composition.isActive()) return;
  TextModel.insert(Composition.currentDisplay());
  Composition.reset();
}
// 変換候補バーで特定の候補をタップしたときに、その候補で確定する
function commitCompositionAt(index){
  if(!Composition.candidates) return;
  Composition.candidateIndex = Math.max(0, Math.min(Composition.candidates.length - 1, index));
  commitComposition();
}


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
  const compHtml = Composition.isActive()
    ? '<span class="composition">' + escapeHtml(Composition.currentDisplay()) + '</span>'
    : '';
  el.innerHTML = before + compHtml + '<span class="text-cursor"></span>' + after;
  hint.classList.toggle('is-hidden', TextModel.text.length > 0 || Composition.isActive());
  renderToolbar();
}

// ツールバー：未入力時はカーソル移動＋音声入力、変換中は候補チップの一覧に切り替える
function renderToolbar(){
  const cursorWrap = document.getElementById('kbToolbarCursor');
  const candWrap = document.getElementById('kbToolbarCandidates');
  const micBtn = document.getElementById('micBtn');

  if(Composition.isActive() && Composition.candidates){
    cursorWrap.hidden = true;
    micBtn.hidden = true;
    candWrap.hidden = false;
    candWrap.innerHTML = '';
    Composition.candidates.forEach((cand, i) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'candidate-chip' + (i === Composition.candidateIndex ? ' is-selected' : '');
      chip.textContent = cand;
      chip.addEventListener('click', () => {
        commitCompositionAt(i);
        renderText();
        playFeedback();
      });
      candWrap.appendChild(chip);
    });
  } else {
    candWrap.hidden = true;
    cursorWrap.hidden = false;
    micBtn.hidden = false;
  }
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

  if(keyDef.kind === 'char'){
    ['up','down','left','right'].forEach(dir => {
      if(!keyDef[dir]) return;
      const hint = document.createElement('span');
      hint.className = 'key__hint key__hint--' + dir;
      hint.textContent = keyDef[dir];
      btn.appendChild(hint);
    });
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
      commitComposition();
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
      commitComposition();
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

// ツールバーに短いメッセージを一時的に表示する（音声入力が使えない場合の案内など）
function showToolbarMessage(msg){
  const cursorWrap = document.getElementById('kbToolbarCursor');
  const candWrap = document.getElementById('kbToolbarCandidates');
  cursorWrap.hidden = true;
  candWrap.hidden = false;
  candWrap.innerHTML = '<span class="toolbar-msg">' + escapeHtml(msg) + '</span>';
  setTimeout(renderToolbar, 2200);
}

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
      e.preventDefault();
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
        if(state.mode === 'ja' && Composition.isActive()){
          Composition.reset();
        } else {
          TextModel.deleteToPunctuation();
        }
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
    el.addEventListener('contextmenu', e => e.preventDefault());
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
    if(state.mode === 'ja'){
      // 日本語モードでは直接確定せず、変換前のバッファに積む
      Composition.addChar(ch);
      renderText();
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
        if(state.mode === 'ja' && Composition.isActive()){
          Composition.backspace();
        } else {
          TextModel.deleteBackward();
        }
        renderText();
        break;
      case 'space':
        if(state.mode === 'ja' && Composition.isActive()){
          // 変換候補を呼び出す／次の候補へ送る
          Composition.cycleCandidate();
        } else {
          TextModel.insert(' ');
        }
        renderText();
        break;
      case 'return':
        if(state.mode === 'ja' && Composition.isActive()){
          // 変換中・入力中の改行キーは「確定」ボタンとして働く
          commitComposition();
        } else {
          TextModel.insert('\n');
        }
        renderText();
        break;
      case 'shift':
        state.shift = !state.shift;
        renderKeyboard();
        break;
      case 'globe':
        if(state.mode === 'ja') commitComposition();
        toggleGlobe();
        renderText();
        renderKeyboard();
        break;
      case 'numtoggle':
        if(state.mode === 'ja') commitComposition();
        toggleNum();
        renderText();
        renderKeyboard();
        break;
      case 'more-symbols':
        state.enNumPage = state.enNumPage === 1 ? 2 : 1;
        renderKeyboard();
        break;
      case 'dakuten': {
        // 変換中／未確定バッファがある場合は、そちらの最後の文字に対して濁点処理を行う
        if(state.mode === 'ja' && Composition.isActive()){
          const last = Composition.buffer[Composition.buffer.length - 1];
          const info = DAKUTEN_LOOKUP[last];
          if(info){
            Composition.buffer = Composition.buffer.slice(0, -1) + info.group[(info.index + 1) % info.group.length];
            Composition._refreshCandidates();
            renderText();
            playFeedback();
          }
          break;
        }
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
      Composition.reset();
      renderText();
      closeSheet('settingsSheet');
    });
    document.getElementById('cursorLeftBtn').addEventListener('click', () => {
      TextModel.moveCursor(-1); renderText(); playFeedback();
    });
    document.getElementById('cursorRightBtn').addEventListener('click', () => {
      TextModel.moveCursor(1); renderText(); playFeedback();
    });
    this.bindMic();
  },

  // 音声入力：Web Speech APIが使える環境ではそのまま動作し、無い場合は
  // その旨をツールバーに一時表示する（Swift版ではSFSpeechRecognizerに置き換える想定）
  bindMic(){
    const micBtn = document.getElementById('micBtn');
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognizer = null;
    let listening = false;

    micBtn.addEventListener('click', () => {
      if(!SR){
        showToolbarMessage('この環境では音声入力を利用できません');
        return;
      }
      if(listening){ recognizer && recognizer.stop(); return; }

      recognizer = new SR();
      recognizer.lang = (state.mode === 'en' || state.mode === 'en-num') ? 'en-US' : 'ja-JP';
      recognizer.interimResults = false;
      recognizer.maxAlternatives = 1;

      recognizer.onresult = (e) => {
        const text = e.results[0][0].transcript;
        commitComposition();
        TextModel.insert(text);
        renderText();
      };
      recognizer.onerror = () => { listening = false; micBtn.classList.remove('is-listening'); };
      recognizer.onend = () => { listening = false; micBtn.classList.remove('is-listening'); };

      try{
        recognizer.start();
        listening = true;
        micBtn.classList.add('is-listening');
      }catch(err){
        showToolbarMessage('音声入力を開始できませんでした');
      }
    });
  },
  tickClock(){
    const now = new Date();
    document.getElementById('clock').textContent =
      String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
