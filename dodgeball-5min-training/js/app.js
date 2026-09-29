/* ================================================================
   5分ドッジボール自宅トレーニング — アプリ本体
   ================================================================ */

const KEYS = {
  users: "fortis5_users",
  currentUser: "fortis5_currentUser",
  lastCondition: "fortis5_lastCondition",
  history: "fortis5_history",
  settings: "fortis5_settings",
};

const WORK_SEC = 20;
const REST_SEC = 10;
const TOTAL_EXERCISES = 10;

// ---------------- ストレージ ----------------
const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  },
};

let users = store.get(KEYS.users, []);
let currentUserId = store.get(KEYS.currentUser, null);
let settings = store.get(KEYS.settings, { voice: true, sound: true });
let history = store.get(KEYS.history, []);

function getCurrentUser() {
  return users.find((u) => u.id === currentUserId) || null;
}

function saveUsers() { store.set(KEYS.users, users); }
function saveSettings() { store.set(KEYS.settings, settings); }
function saveHistory() { store.set(KEYS.history, history); }

// ---------------- 画面切り替え ----------------
function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  window.scrollTo(0, 0);
}

// ---------------- 音声・効果音 ----------------
let audioCtx = null;
function ensureAudioCtx() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    audioCtx = new Ctx();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function beep(freq = 880, durationMs = 120, delayMs = 0, volume = 0.2) {
  if (!settings.sound) return;
  const ctx = ensureAudioCtx();
  const t0 = ctx.currentTime + delayMs / 1000;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.01);
  gain.gain.linearRampToValueAtTime(0, t0 + durationMs / 1000);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + durationMs / 1000 + 0.02);
}

function playCountBeep() { beep(880, 90, 0, 0.18); }
function playEndWhistle() {
  if (!settings.sound) return;
  beep(1100, 140, 0, 0.22);
  beep(1500, 220, 160, 0.22);
}
function playFinishFanfare() {
  if (!settings.sound) return;
  [660, 880, 1100, 1320].forEach((f, i) => beep(f, 150, i * 120, 0.2));
}

function speak(text) {
  if (!settings.voice) return;
  if (!("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ja-JP";
    u.rate = 1.02;
    window.speechSynthesis.speak(u);
  } catch (e) {}
}

// ---------------- Wake Lock ----------------
let wakeLock = null;
async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator) {
      wakeLock = await navigator.wakeLock.request("screen");
    }
  } catch (e) { /* 対応していない・拒否された場合は無視 */ }
}
function releaseWakeLock() {
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && trainingState.phase && trainingState.phase !== "idle") {
    requestWakeLock();
  }
});

// ================================================================
// オンボーディング / 利用者管理
// ================================================================
function initOnboarding() {
  if (users.length === 0) {
    showScreen("screen-onboarding");
  } else {
    if (!getCurrentUser()) currentUserId = users[0].id;
    store.set(KEYS.currentUser, currentUserId);
    showHome();
  }
}

document.getElementById("onboarding-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = document.getElementById("onboarding-name").value.trim() || "選手";
  const user = { id: "u_" + Date.now(), name, createdAt: Date.now() };
  users.push(user);
  currentUserId = user.id;
  saveUsers();
  store.set(KEYS.currentUser, currentUserId);
  showHome();
});

function renderUserSelect() {
  const list = document.getElementById("user-select-list");
  list.innerHTML = "";
  users.forEach((u) => {
    const btn = document.createElement("button");
    btn.className = "user-chip" + (u.id === currentUserId ? " selected" : "");
    btn.textContent = u.name;
    btn.addEventListener("click", () => {
      currentUserId = u.id;
      store.set(KEYS.currentUser, currentUserId);
      showHome();
    });
    list.appendChild(btn);
  });
}

document.getElementById("btn-add-family").addEventListener("click", () => {
  const name = prompt("お名前(ニックネームでOK)を入力してください");
  if (!name) return;
  const user = { id: "u_" + Date.now(), name: name.trim(), createdAt: Date.now() };
  users.push(user);
  saveUsers();
  currentUserId = user.id;
  store.set(KEYS.currentUser, currentUserId);
  renderUserSelect();
});

document.getElementById("btn-open-user-select").addEventListener("click", () => {
  renderUserSelect();
  showScreen("screen-user-select");
});

// ================================================================
// ホーム画面
// ================================================================
function showHome() {
  const user = getCurrentUser();
  document.getElementById("home-user-name").textContent = user ? user.name : "選手";

  const uid = currentUserId;
  const myHistory = history.filter((h) => h.userId === uid);
  const now = new Date();
  const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
  const weekCount = myHistory.filter((h) => new Date(h.date) >= weekAgo).length;
  document.getElementById("home-week-count").textContent = weekCount;

  const last = myHistory[myHistory.length - 1];
  const lastEl = document.getElementById("home-last-record");
  if (last) {
    const d = new Date(last.date);
    lastEl.textContent = `${d.getMonth() + 1}/${d.getDate()} に実施(${GOAL_LABELS[last.condition.goals[0]] || "おまかせ"})`;
  } else {
    lastEl.textContent = "まだ記録がありません";
  }

  const familyCount = document.getElementById("home-family-count");
  familyCount.textContent = `家族全体のトレーニング回数: ${history.length}回`;

  const repeatBtn = document.getElementById("btn-repeat-last");
  const lastCond = store.get(KEYS.lastCondition, null);
  repeatBtn.style.display = lastCond ? "block" : "none";

  showScreen("screen-home");
}

document.getElementById("btn-start-training").addEventListener("click", () => {
  showScreen("screen-condition");
});

document.getElementById("btn-repeat-last").addEventListener("click", () => {
  const lastCond = store.get(KEYS.lastCondition, null);
  if (!lastCond) return;
  currentCondition = { ...lastCond };
  startMenuGeneration();
});

document.getElementById("btn-open-history").addEventListener("click", () => {
  renderHistory();
  showScreen("screen-history");
});

document.getElementById("btn-open-exercise-list").addEventListener("click", () => {
  renderExerciseList();
  showScreen("screen-exercise-list");
});

document.getElementById("btn-open-settings").addEventListener("click", () => {
  document.getElementById("settings-voice").checked = settings.voice;
  document.getElementById("settings-sound").checked = settings.sound;
  showScreen("screen-settings");
});

document.querySelectorAll(".btn-back-home").forEach((b) =>
  b.addEventListener("click", () => showHome())
);

// ================================================================
// 条件設定
// ================================================================
let currentCondition = { goals: [], difficulty: "beginner", space: "small", noise: "some" };

document.querySelectorAll("#goal-options .option-pill").forEach((el) => {
  el.addEventListener("click", () => {
    const val = el.dataset.value;
    if (val === "omakase") {
      document.querySelectorAll("#goal-options .option-pill").forEach((o) => o.classList.remove("selected"));
      el.classList.add("selected");
      return;
    }
    document.querySelector('#goal-options .option-pill[data-value="omakase"]').classList.remove("selected");
    el.classList.toggle("selected");
  });
});

function setupSingleSelect(containerId) {
  document.querySelectorAll(`#${containerId} .option-pill`).forEach((el) => {
    el.addEventListener("click", () => {
      document.querySelectorAll(`#${containerId} .option-pill`).forEach((o) => o.classList.remove("selected"));
      el.classList.add("selected");
    });
  });
}
setupSingleSelect("difficulty-options");
setupSingleSelect("space-options");
setupSingleSelect("noise-options");

document.getElementById("btn-condition-next").addEventListener("click", () => {
  const goals = [...document.querySelectorAll("#goal-options .option-pill.selected")].map((e) => e.dataset.value);
  const difficulty = document.querySelector("#difficulty-options .option-pill.selected")?.dataset.value || "beginner";
  const space = document.querySelector("#space-options .option-pill.selected")?.dataset.value || "small";
  const noise = document.querySelector("#noise-options .option-pill.selected")?.dataset.value || "some";
  currentCondition = { goals: goals.length ? goals : ["omakase"], difficulty, space, noise };
  startMenuGeneration();
});

// ================================================================
// メニュー自動生成アルゴリズム
// currentMenu の各要素は { exId, side } (side は左右ペア種目のみ 'right'/'left')
// ================================================================
function isExcludedByChosenPartner(candidateId, chosenExIds) {
  return EXCLUSIVE_PAIRS.some(
    (pair) => pair.includes(candidateId) && pair.some((id) => id !== candidateId && chosenExIds.includes(id))
  );
}

function buildPool(cond) {
  const spaceLevel = SPACE_ORDER[cond.space];
  const diffLevel = DIFFICULTY_LEVEL[cond.difficulty];

  function pass(e, useSpace, useQuiet, useDifficulty) {
    if (useSpace && SPACE_ORDER[e.space] > spaceLevel) return false;
    if (useDifficulty && e.difficultyLevel > diffLevel) return false;
    if (useQuiet) {
      if (cond.noise === "quiet" && e.quiet !== "quiet") return false;
      if (cond.noise === "some" && e.quiet === "loud") return false;
    }
    return true;
  }

  let pool = EXERCISES.filter((e) => pass(e, true, true, true));
  if (pool.length < TOTAL_EXERCISES) pool = EXERCISES.filter((e) => pass(e, true, true, false));
  if (pool.length < TOTAL_EXERCISES) pool = EXERCISES.filter((e) => pass(e, true, false, false));
  if (pool.length < TOTAL_EXERCISES) pool = EXERCISES.filter((e) => pass(e, false, false, false));
  if (pool.length < TOTAL_EXERCISES) pool = EXERCISES.slice();
  return pool;
}

function scoreExercise(e, cond) {
  const goals = cond.goals.includes("omakase") ? [] : cond.goals;
  let s = 1;
  if (goals.length > 0) {
    const primary = goals[0];
    e.goals.forEach((g) => {
      if (g === primary) s += 2;
      else if (goals.includes(g)) s += 1;
    });
  }
  return Math.max(s, 0.05);
}

function weightedPick(candidates) {
  const total = candidates.reduce((sum, c) => sum + c.w, 0);
  let r = Math.random() * total;
  for (const c of candidates) {
    r -= c.w;
    if (r <= 0) return c.e;
  }
  return candidates[candidates.length - 1].e;
}

const INTENSITY_PATTERN = ["medium", "low", "medium", "high", "low", "medium", "high", "low", "medium", "high"];

function generateMenu(cond) {
  const pool = buildPool(cond);
  const entries = []; // {exId, side, category, jump} フラットな10枠ぶんのリスト
  const chosenExIds = [];
  let jumpCount = 0;
  let slotsUsed = 0;
  let guard = 0;

  while (slotsUsed < TOTAL_EXERCISES && guard < 200) {
    guard++;
    const remaining = TOTAL_EXERCISES - slotsUsed;
    const target = INTENSITY_PATTERN[slotsUsed] || "medium";
    const prev1 = entries[entries.length - 1];

    // 末尾の「同カテゴリー連続数」を数える(左右ペアは2枠まとめて追加されるため必須)
    let trailingCategory = prev1 ? prev1.category : null;
    let trailingStreak = 0;
    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i].category === trailingCategory) trailingStreak++;
      else break;
    }

    let candidates = pool.filter(
      (e) => !chosenExIds.includes(e.id) && !isExcludedByChosenPartner(e.id, chosenExIds)
    );
    if (remaining < 2) candidates = candidates.filter((e) => !e.pairLR);
    candidates = candidates.filter((e) => {
      const addition = e.pairLR ? 2 : 1;
      const wouldBeStreak = e.category === trailingCategory ? trailingStreak + addition : addition;
      return wouldBeStreak < 3;
    });
    if (prev1 && prev1.jump) candidates = candidates.filter((e) => !e.jump);
    if (jumpCount >= 3) candidates = candidates.filter((e) => !e.jump);

    if (candidates.length === 0) {
      candidates = pool.filter((e) => !chosenExIds.includes(e.id) && !isExcludedByChosenPartner(e.id, chosenExIds));
      if (remaining < 2) candidates = candidates.filter((e) => !e.pairLR);
    }
    if (candidates.length === 0) {
      candidates = pool.filter((e) => !chosenExIds.includes(e.id));
      if (remaining < 2) candidates = candidates.filter((e) => !e.pairLR);
    }
    if (candidates.length === 0) candidates = pool.filter((e) => (remaining < 2 ? !e.pairLR : true));
    if (candidates.length === 0) candidates = pool.slice();

    let byIntensity = candidates.filter((e) => e.baseIntensity === target);
    if (byIntensity.length === 0) byIntensity = candidates;

    const weighted = byIntensity.map((e) => ({ e, w: scoreExercise(e, cond) }));
    const pick = weightedPick(weighted);

    chosenExIds.push(pick.id);

    if (pick.pairLR) {
      entries.push({ exId: pick.id, side: "right", category: pick.category, jump: pick.jump });
      entries.push({ exId: pick.id, side: "left", category: pick.category, jump: pick.jump });
      slotsUsed += 2;
      if (pick.jump) jumpCount += 2;
    } else {
      entries.push({ exId: pick.id, side: null, category: pick.category, jump: pick.jump });
      slotsUsed += 1;
      if (pick.jump) jumpCount += 1;
    }
  }
  return entries.slice(0, TOTAL_EXERCISES).map((e) => ({ exId: e.exId, side: e.side }));
}

let currentMenu = [];

function menuEntryLabel(entry) {
  const ex = EXERCISES.find((e) => e.id === entry.exId);
  const suffix = entry.side === "right" ? "(右)" : entry.side === "left" ? "(左)" : "";
  return { ex, label: ex.name + suffix };
}

function startMenuGeneration() {
  currentMenu = generateMenu(currentCondition);
  renderMenuPreview();
  showScreen("screen-menu-preview");
}

document.getElementById("btn-regenerate-menu").addEventListener("click", startMenuGeneration);

function escapeHtmlAttr(str) {
  return String(str).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function renderMenuPreview() {
  const list = document.getElementById("menu-preview-list");
  list.innerHTML = "";
  currentMenu.forEach((entry, i) => {
    const { ex, label } = menuEntryLabel(entry);
    const hasVideo = !!ex.video;
    const li = document.createElement("li");
    li.className = "menu-item" + (hasVideo ? " has-video" : "");
    li.innerHTML = `
      <div class="menu-item-row">
        <button type="button" class="menu-item-thumb-btn" aria-label="${label}のイラストを拡大">
          <img class="menu-item-thumb" src="${ex.image || "images/placeholder.svg"}" alt="">
          <span class="menu-item-thumb-zoom">🔍</span>
        </button>
        <div class="menu-item-info">
          <span class="menu-item-num">${i + 1}</span>
          <span class="menu-item-name">${label}</span>
        </div>
        <span class="menu-item-sec">20秒</span>
      </div>
      ${hasVideo ? `<a class="menu-item-video-link" href="${escapeHtmlAttr(ex.video)}" target="_blank" rel="noopener noreferrer">▶ 参考動画を見る</a>` : ""}
    `;

    // イラスト部分：タップで拡大表示。カード全体の動画リンクには伝播させない。
    li.querySelector(".menu-item-thumb-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      openImageZoom(ex.image || "images/placeholder.svg", label);
    });

    // 「参考動画を見る」：通常のリンク遷移。カード全体側のハンドラと二重発火しないよう伝播を止める。
    const videoLink = li.querySelector(".menu-item-video-link");
    if (videoLink) {
      videoLink.addEventListener("click", (e) => e.stopPropagation());
    }

    // カード全体(イラスト以外)：動画があれば新しいタブで開く。無ければ何もしない。
    if (hasVideo) {
      li.addEventListener("click", () => {
        window.open(ex.video, "_blank", "noopener,noreferrer");
      });
    }

    list.appendChild(li);
  });
}

// ================================================================
// メニュー一覧：イラスト拡大表示モーダル
// ================================================================
function openImageZoom(src, name) {
  document.getElementById("image-zoom-img").src = src;
  document.getElementById("image-zoom-name").textContent = name;
  document.getElementById("image-zoom-modal").classList.add("active");
}
function closeImageZoom() {
  document.getElementById("image-zoom-modal").classList.remove("active");
}
document.getElementById("btn-image-zoom-close").addEventListener("click", closeImageZoom);
document.getElementById("image-zoom-modal").addEventListener("click", (e) => {
  if (e.target.id === "image-zoom-modal") closeImageZoom();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeImageZoom();
});

document.getElementById("btn-menu-start").addEventListener("click", () => {
  store.set(KEYS.lastCondition, currentCondition);
  showFirstExerciseIntro();
});

// ================================================================
// 1種目目の説明画面(運動前に「何をするか」を確認する時間を作る)
// この画面と直後の3-2-1カウントダウンは、5分間のトレーニング時間には含まない。
// ================================================================
function showFirstExerciseIntro() {
  const { ex } = menuEntryLabel(currentMenu[0]);
  document.getElementById("intro-exercise-img").src = ex.image || "images/placeholder.svg";
  document.getElementById("intro-exercise-name").textContent = ex.name;
  document.getElementById("intro-exercise-desc").textContent = ex.description;
  showScreen("screen-exercise-intro");
}

document.getElementById("btn-intro-start").addEventListener("click", () => {
  startCountdown();
});

// ================================================================
// カウントダウン(3-2-1-スタート)
// ================================================================
function startCountdown() {
  showScreen("screen-countdown");
  const el = document.getElementById("countdown-number");
  const seq = ["3", "2", "1", "スタート！"];
  let i = 0;
  ensureAudioCtx();
  function step() {
    if (i >= seq.length) {
      startTraining();
      return;
    }
    el.textContent = seq[i];
    if (seq[i] === "スタート！") {
      speak("スタート！");
      beep(1200, 200, 0, 0.25);
    } else {
      speak(seq[i]);
      playCountBeep();
    }
    i++;
    setTimeout(step, 800);
  }
  step();
}

// ================================================================
// トレーニング本体(タイマーエンジン)
// ================================================================
const trainingState = {
  phase: "idle", // idle | work | rest | paused | done
  index: 0,
  phaseStartMs: 0,
  phaseDurationMs: 0,
  pausedAtMs: 0,
  pausedAccumMs: 0,
  timerId: null,
  lastSpokenSecond: null,
};

function currentExercise(index) {
  const entry = currentMenu[index];
  return EXERCISES.find((e) => e.id === entry.exId);
}

function currentExerciseLabel(index) {
  return menuEntryLabel(currentMenu[index]).label;
}

function difficultyHint(difficulty) {
  if (difficulty === "beginner") return "ゆっくり丁寧に";
  if (difficulty === "advanced") return "できるだけ速く・大きく";
  return "リズムよく";
}

function startTraining() {
  showScreen("screen-training");
  requestWakeLock();
  trainingState.index = 0;
  trainingState.pausedAccumMs = 0;
  beginPhase("work");
}

function beginPhase(phase) {
  trainingState.phase = phase;
  trainingState.phaseStartMs = Date.now();
  trainingState.pausedAccumMs = 0;
  trainingState.lastSpokenSecond = null;
  trainingState.phaseDurationMs = (phase === "work" ? WORK_SEC : REST_SEC) * 1000;

  const ex = currentExercise(trainingState.index);
  const nextEx = trainingState.index + 1 < TOTAL_EXERCISES ? currentExercise(trainingState.index + 1) : null;

  document.getElementById("training-index").textContent = `${trainingState.index + 1} / ${TOTAL_EXERCISES}`;
  document.getElementById("training-progress-bar").style.width =
    `${Math.round(((trainingState.index + (phase === "rest" ? 1 : 0)) / TOTAL_EXERCISES) * 100)}%`;

  const label = currentExerciseLabel(trainingState.index);
  const nextLabel = nextEx ? currentExerciseLabel(trainingState.index + 1) : null;

  if (phase === "work") {
    document.getElementById("training-screen-mode").className = "training-screen work";
    document.getElementById("training-exercise-name").textContent = label;
    document.getElementById("training-exercise-img").src = ex.image || "images/placeholder.svg";
    document.getElementById("training-hint").textContent = difficultyHint(currentCondition.difficulty);
    document.getElementById("training-next-label").textContent = nextLabel ? `次: ${nextLabel}` : "次: 最後の種目です";
    speak(label);
  } else {
    document.getElementById("training-screen-mode").className = "training-screen rest";
    document.getElementById("training-exercise-name").textContent = "小休止";
    document.getElementById("training-exercise-img").src = nextEx ? (nextEx.image || "images/placeholder.svg") : "images/placeholder.svg";
    document.getElementById("training-hint").textContent = "水分補給・呼吸を整えよう";
    document.getElementById("training-next-label").textContent = nextLabel ? `次: ${nextLabel}` : "まもなく終了です";
    if (nextLabel) speak(`次は ${nextLabel}`);
  }

  tickTraining();
  if (trainingState.timerId) clearInterval(trainingState.timerId);
  trainingState.timerId = setInterval(tickTraining, 100);
}

function tickTraining() {
  if (trainingState.phase === "paused") return;
  const elapsed = Date.now() - trainingState.phaseStartMs - trainingState.pausedAccumMs;
  const remainMs = Math.max(trainingState.phaseDurationMs - elapsed, 0);
  const remainSec = Math.ceil(remainMs / 1000);

  document.getElementById("training-timer").textContent = remainSec;

  if (remainSec <= 5 && remainSec >= 1 && trainingState.lastSpokenSecond !== remainSec) {
    trainingState.lastSpokenSecond = remainSec;
    speak(String(remainSec));
    playCountBeep();
  }

  if (remainMs <= 0) {
    clearInterval(trainingState.timerId);
    playEndWhistle();
    advancePhase();
  }
}

function advancePhase() {
  if (trainingState.phase === "work") {
    if (trainingState.index + 1 >= TOTAL_EXERCISES) {
      finishTraining();
      return;
    }
    beginPhase("rest");
  } else {
    trainingState.index++;
    beginPhase("work");
  }
}

function showPauseExerciseInfo() {
  // ワークアウト中に一時停止 → 今やっている種目を表示
  // インターバル中に一時停止 → 直前まで案内していた「次の種目」を表示(画面に出ていた内容をそのまま維持)
  const isRest = trainingState.prevPhase === "rest";
  const index = isRest ? trainingState.index + 1 : trainingState.index;
  const ex = currentExercise(index);
  const label = currentExerciseLabel(index);

  document.getElementById("pause-context-label").textContent = isRest
    ? "インターバル中です。次の種目を確認しよう"
    : "運動中です。フォームを確認しよう";
  document.getElementById("pause-exercise-img").src = ex.image || "images/placeholder.svg";
  document.getElementById("pause-exercise-name").textContent = (isRest ? "次: " : "") + label;
  document.getElementById("pause-exercise-desc").textContent = ex.description;
}

document.getElementById("btn-pause").addEventListener("click", () => {
  if (trainingState.phase === "paused") return;
  trainingState.pausedAtMs = Date.now();
  trainingState.prevPhase = trainingState.phase;
  trainingState.phase = "paused";
  clearInterval(trainingState.timerId);
  window.speechSynthesis && window.speechSynthesis.cancel();
  showPauseExerciseInfo();
  document.getElementById("pause-overlay").classList.add("active");
});

document.getElementById("btn-resume").addEventListener("click", () => {
  trainingState.pausedAccumMs += Date.now() - trainingState.pausedAtMs;
  trainingState.phase = trainingState.prevPhase;
  document.getElementById("pause-overlay").classList.remove("active");
  trainingState.timerId = setInterval(tickTraining, 100);
});

document.getElementById("btn-quit-confirm-open").addEventListener("click", () => {
  document.getElementById("quit-confirm").classList.add("active");
});
document.getElementById("btn-quit-cancel").addEventListener("click", () => {
  document.getElementById("quit-confirm").classList.remove("active");
});
document.getElementById("btn-quit-yes").addEventListener("click", () => {
  clearInterval(trainingState.timerId);
  releaseWakeLock();
  document.getElementById("quit-confirm").classList.remove("active");
  document.getElementById("pause-overlay").classList.remove("active");
  trainingState.phase = "idle";
  showHome();
});

function finishTraining() {
  trainingState.phase = "done";
  releaseWakeLock();
  playFinishFanfare();
  speak("トレーニング終了！ よくがんばりました");

  const record = {
    id: "h_" + Date.now(),
    userId: currentUserId,
    date: new Date().toISOString(),
    menu: currentMenu.slice(),
    condition: { ...currentCondition },
    durationSec: WORK_SEC * TOTAL_EXERCISES + REST_SEC * (TOTAL_EXERCISES - 1),
  };
  history.push(record);
  saveHistory();

  renderResult(record);
  showScreen("screen-result");
}

function renderResult(record) {
  const user = getCurrentUser();
  document.getElementById("result-user-name").textContent = user ? user.name : "選手";
  document.getElementById("result-goal").textContent =
    record.condition.goals.map((g) => GOAL_LABELS[g] || "おまかせ").join("・") || "おまかせ";
  document.getElementById("result-difficulty").textContent =
    { beginner: "初級", intermediate: "中級", advanced: "上級" }[record.condition.difficulty];

  const list = document.getElementById("result-exercise-list");
  list.innerHTML = "";
  record.menu.forEach((entry, i) => {
    const { label } = menuEntryLabel(entry);
    const li = document.createElement("li");
    li.textContent = `${i + 1}. ${label}`;
    list.appendChild(li);
  });
}

document.getElementById("btn-result-home").addEventListener("click", showHome);

// ================================================================
// 簡易履歴
// ================================================================
function renderHistory() {
  const uid = currentUserId;
  const myHistory = history.filter((h) => h.userId === uid).slice().reverse();
  const container = document.getElementById("history-list");
  container.innerHTML = "";
  if (myHistory.length === 0) {
    container.innerHTML = `<p class="empty-note">まだ記録がありません。「5分やる」からはじめよう！</p>`;
    return;
  }
  myHistory.forEach((h) => {
    const d = new Date(h.date);
    const row = document.createElement("div");
    row.className = "history-row";
    row.innerHTML = `
      <div class="history-date">${d.getMonth() + 1}/${d.getDate()}<span>${d.getFullYear()}</span></div>
      <div class="history-info">
        <div class="history-goal">${h.condition.goals.map((g) => GOAL_LABELS[g] || "おまかせ").join("・")}</div>
        <div class="history-sub">${h.menu.length}種目・5分</div>
      </div>
    `;
    container.appendChild(row);
  });
}

// ================================================================
// 種目一覧・種目詳細
// ================================================================
function renderExerciseList() {
  const container = document.getElementById("exercise-list-grid");
  container.innerHTML = "";
  EXERCISES.forEach((ex) => {
    const hasVideo = !!ex.video;
    const card = document.createElement("div");
    card.className = "exercise-card";
    card.innerHTML = `
      <button type="button" class="exercise-card-main" aria-label="${ex.name}の詳細">
        <img src="${ex.image || "images/placeholder.svg"}" alt="">
        <span>${ex.name}</span>
      </button>
      ${hasVideo ? `<a class="exercise-card-video" href="${escapeHtmlAttr(ex.video)}" target="_blank" rel="noopener noreferrer">▶ 参考動画を見る</a>` : ""}
    `;
    card.querySelector(".exercise-card-main").addEventListener("click", () => renderExerciseDetail(ex.id));
    const videoLink = card.querySelector(".exercise-card-video");
    if (videoLink) {
      videoLink.addEventListener("click", (e) => e.stopPropagation());
    }
    container.appendChild(card);
  });
}

function renderExerciseDetail(id) {
  const ex = EXERCISES.find((e) => e.id === id);
  document.getElementById("detail-name").textContent = ex.name;
  document.getElementById("detail-img").src = ex.image || "images/placeholder.svg";
  document.getElementById("detail-description").textContent = ex.description;
  const pointsEl = document.getElementById("detail-points");
  pointsEl.innerHTML = "";
  ex.points.forEach((p) => {
    const li = document.createElement("li");
    li.textContent = p;
    pointsEl.appendChild(li);
  });
  document.getElementById("detail-category").textContent = CATEGORY_LABELS[ex.category];
  showScreen("screen-exercise-detail");
}

document.querySelectorAll(".btn-back-exercise-list").forEach((b) =>
  b.addEventListener("click", () => showScreen("screen-exercise-list"))
);

// ================================================================
// 設定
// ================================================================
document.getElementById("settings-voice").addEventListener("change", (e) => {
  settings.voice = e.target.checked;
  saveSettings();
});
document.getElementById("settings-sound").addEventListener("change", (e) => {
  settings.sound = e.target.checked;
  saveSettings();
});

// ================================================================
// 起動
// ================================================================
initOnboarding();
