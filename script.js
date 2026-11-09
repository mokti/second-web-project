// NEON MEMORY — game logic, DOM updates and localStorage persistence.
"use strict";

const SYMBOLS = ["✦", "☾", "❖", "✿", "☀", "♫", "⚡", "☯", "♜", "❋"];
const LEVELS = {
  easy: { pairs: 6, columns: 4 },
  medium: { pairs: 8, columns: 4 },
  hard: { pairs: 10, columns: 5 }
};
const STORAGE_KEY = "neonMemoryBestTimes";

const board = document.querySelector("#board");
const movesElement = document.querySelector("#moves");
const timerElement = document.querySelector("#timer");
const matchedElement = document.querySelector("#matched");
const bestElement = document.querySelector("#best-time");
const progressBar = document.querySelector("#progress-bar");
const statusElement = document.querySelector("#status");
const winOverlay = document.querySelector("#win-overlay");
const winMessage = document.querySelector("#win-message");
const soundButton = document.querySelector("#sound-toggle");
const helpDialog = document.querySelector("#help-dialog");

let level = "easy";
let cards = [];
let firstCard = null;
let secondCard = null;
let lockBoard = false;
let moves = 0;
let matches = 0;
let seconds = 0;
let timerId = null;
let hasStarted = false;
let soundEnabled = true;
let mismatchTimeout = null;
let audioContext = null;

function readBestTimes() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch (error) {
    console.warn("Could not read saved scores:", error);
    return {};
  }
}

function saveBestTime(time) {
  const bestTimes = readBestTimes();
  const previous = bestTimes[level];
  if (previous === undefined || time < previous) {
    bestTimes[level] = time;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(bestTimes));
    } catch (error) {
      console.warn("Could not save score:", error);
    }
  }
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const secs = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${secs}`;
}

function updateTimerDisplay() {
  timerElement.textContent = formatTime(seconds);
}

function startTimer() {
  if (timerId || hasStarted) return;
  hasStarted = true;
  timerId = window.setInterval(() => {
    seconds += 1;
    updateTimerDisplay();
  }, 1000);
}

function stopTimer() {
  if (timerId) window.clearInterval(timerId);
  timerId = null;
}

function updateStats() {
  const totalPairs = LEVELS[level].pairs;
  movesElement.textContent = moves;
  matchedElement.innerHTML = `${matches} <small>/ ${totalPairs}</small>`;
  progressBar.style.width = `${(matches / totalPairs) * 100}%`;
  const best = readBestTimes()[level];
  bestElement.textContent = best === undefined ? "—" : formatTime(best);
}

function shuffle(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function playTone(frequency = 440, duration = 0.08, type = "sine") {
  if (!soundEnabled) return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    audioContext = audioContext || new AudioContextClass();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.045, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
  } catch (error) {
    // Audio is optional; the game remains fully playable without it.
  }
}

function createCard(symbol, index) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "card";
  button.dataset.symbol = symbol;
  button.dataset.index = index;
  button.setAttribute("aria-label", `Hidden card ${index + 1}`);
  button.addEventListener("click", () => flipCard(button));
  return button;
}

function renderBoard() {
  board.replaceChildren();
  board.classList.toggle("hard", level === "hard");
  cards.forEach((symbol, index) => board.appendChild(createCard(symbol, index)));
}

function startNewGame() {
  if (mismatchTimeout) window.clearTimeout(mismatchTimeout);
  stopTimer();
  level = document.querySelector(".level.active").dataset.level;
  const symbols = SYMBOLS.slice(0, LEVELS[level].pairs);
  cards = shuffle([...symbols, ...symbols]);
  firstCard = null;
  secondCard = null;
  lockBoard = false;
  moves = 0;
  matches = 0;
  seconds = 0;
  hasStarted = false;
  winOverlay.classList.add("hidden");
  updateTimerDisplay();
  updateStats();
  renderBoard();
  statusElement.textContent = "Ready when you are.";
}

function revealCard(card) {
  card.classList.add("revealed");
  card.textContent = card.dataset.symbol;
  card.setAttribute("aria-label", `Revealed ${card.dataset.symbol}`);
}

function hideCard(card) {
  card.classList.remove("revealed");
  card.textContent = "";
  card.setAttribute("aria-label", `Hidden card ${Number(card.dataset.index) + 1}`);
}

function flipCard(card) {
  if (lockBoard || card === firstCard || card.classList.contains("matched") || card.classList.contains("revealed")) return;

  startTimer();
  revealCard(card);
  playTone(430, 0.06);

  if (!firstCard) {
    firstCard = card;
    statusElement.textContent = "Find its pair…";
    return;
  }

  secondCard = card;
  moves += 1;
  updateStats();
  checkForMatch();
}

function checkForMatch() {
  const isMatch = firstCard.dataset.symbol === secondCard.dataset.symbol;
  if (isMatch) {
    firstCard.classList.add("matched");
    secondCard.classList.add("matched");
    firstCard.disabled = true;
    secondCard.disabled = true;
    matches += 1;
    playTone(660, 0.12, "triangle");
    updateStats();
    resetTurn();
    statusElement.textContent = "Nice match!";
    if (matches === LEVELS[level].pairs) finishGame();
  } else {
    lockBoard = true;
    statusElement.textContent = "Not a match — try again.";
    mismatchTimeout = window.setTimeout(() => {
      hideCard(firstCard);
      hideCard(secondCard);
      resetTurn();
      mismatchTimeout = null;
    }, 850);
  }
}

function resetTurn() {
  [firstCard, secondCard] = [null, null];
  lockBoard = false;
}

function finishGame() {
  stopTimer();
  saveBestTime(seconds);
  updateStats();
  winMessage.textContent = `You matched all ${matches} pairs in ${moves} moves and ${formatTime(seconds)}.`;
  winOverlay.classList.remove("hidden");
  statusElement.textContent = "All pairs found. Brilliant!";
  playTone(880, 0.22, "triangle");
}

function setLevel(nextLevel) {
  level = nextLevel;
  document.querySelectorAll(".level").forEach((button) => {
    const active = button.dataset.level === level;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  startNewGame();
}

document.querySelectorAll(".level").forEach((button) => {
  button.addEventListener("click", () => setLevel(button.dataset.level));
});
document.querySelector("#new-game").addEventListener("click", startNewGame);
document.querySelector("#play-again").addEventListener("click", startNewGame);
soundButton.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  soundButton.textContent = soundEnabled ? "♫" : "♪";
  soundButton.setAttribute("aria-label", soundEnabled ? "Turn sound off" : "Turn sound on");
  soundButton.title = soundEnabled ? "Sound on" : "Sound off";
});
document.querySelector("#help-button").addEventListener("click", () => helpDialog.showModal());
document.querySelector("#close-help").addEventListener("click", () => helpDialog.close());
document.querySelector("#got-it").addEventListener("click", () => helpDialog.close());

// Start with the easy board. Saved records are loaded from this browser automatically.
startNewGame();
