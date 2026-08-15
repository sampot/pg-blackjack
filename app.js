/**
 * Blackjack — DOM 互動與渲染。
 */
import {
  createTable,
  placeBet,
  dealRound,
  hit,
  stand,
  doubleDown,
  dealerPlay,
  nextRound,
  resetTable,
  handScore,
  canDouble,
  SUIT_CHAR,
  START_BANKROLL,
} from "./game.js";
import { BlackjackAudio } from "./audio.js";

const audio = new BlackjackAudio();
const PEAK_KEY = "pg-blackjack-peak";

const els = {
  bankroll: document.getElementById("bankroll"),
  betLabel: document.getElementById("bet-label"),
  peak: document.getElementById("peak-label"),
  status: document.getElementById("status"),
  dealerCards: document.getElementById("dealer-cards"),
  playerCards: document.getElementById("player-cards"),
  dealerScore: document.getElementById("dealer-score"),
  playerScore: document.getElementById("player-score"),
  betPanel: document.getElementById("bet-panel"),
  playPanel: document.getElementById("play-panel"),
  settlePanel: document.getElementById("settle-panel"),
  btnDeal: document.getElementById("btn-deal"),
  btnClear: document.getElementById("btn-clear-bet"),
  btnHit: document.getElementById("btn-hit"),
  btnStand: document.getElementById("btn-stand"),
  btnDouble: document.getElementById("btn-double"),
  btnNext: document.getElementById("btn-next"),
  btnReset: document.getElementById("btn-reset"),
  btnMute: document.getElementById("btn-mute"),
  brokePanel: document.getElementById("broke-panel"),
  btnBrokeReset: document.getElementById("btn-broke-reset"),
};

let state = createTable();
/** 尚未扣款的暫存下注（betting 階段） */
let pendingBet = 0;

function cardFile(c) {
  if (!c.up) return "card_back.png";
  const rank =
    c.rank === 1
      ? "A"
      : c.rank === 11
        ? "J"
        : c.rank === 12
          ? "Q"
          : c.rank === 13
            ? "K"
            : String(c.rank).padStart(2, "0");
  const suit =
    c.suit === 0 ? "spades" : c.suit === 1 ? "hearts" : c.suit === 2 ? "diamonds" : "clubs";
  return `card_${suit}_${rank}.png`;
}

function rankZh(r) {
  if (r === 1) return "A";
  if (r === 11) return "J";
  if (r === 12) return "Q";
  if (r === 13) return "K";
  return String(r);
}

function cardEl(c) {
  const img = document.createElement("img");
  img.src = `assets/cards/${cardFile(c)}`;
  img.alt = c.up ? `${rankZh(c.rank)} ${SUIT_CHAR[c.suit]}` : "牌背";
  img.draggable = false;
  img.className = "card-img";
  return img;
}

function setStatus(msg, tone = "") {
  els.status.textContent = msg;
  els.status.dataset.tone = tone;
}

function renderCards(el, cards) {
  el.replaceChildren(...cards.map(cardEl));
}

function visibleScore(cards, hideHole) {
  if (!cards.length) return "";
  if (hideHole) {
    const shown = cards.filter((c) => c.up);
    if (!shown.length) return "";
    return String(handScore(shown).total);
  }
  const { total, soft } = handScore(cards);
  return soft ? `${total}（軟）` : String(total);
}

function resultMessage(result, payout, bet) {
  switch (result) {
    case "blackjack":
      return `黑傑克！贏得 ${payout - bet}（3:2）`;
    case "win":
      return `你贏了 +${payout - bet}`;
    case "push":
      return "平手，退回注碼";
    case "lose":
      return `莊家贏，失去 ${bet}`;
    default:
      return "";
  }
}

function render() {
  const hideHole = state.phase === "player";
  const displayBank =
    state.phase === "betting" ? state.bankroll - pendingBet : state.bankroll;
  const displayBet = state.phase === "betting" ? pendingBet : state.bet;

  els.bankroll.textContent = String(displayBank);
  els.betLabel.textContent = String(displayBet);
  els.peak.textContent = String(state.peak);

  renderCards(els.dealerCards, state.dealer);
  renderCards(els.playerCards, state.player);
  els.dealerScore.textContent = visibleScore(state.dealer, hideHole);
  els.playerScore.textContent = state.player.length
    ? visibleScore(state.player, false)
    : "";

  const betting = state.phase === "betting";
  const playing = state.phase === "player";
  const settling = state.phase === "settle";

  els.betPanel.classList.toggle("hidden", !betting);
  els.playPanel.classList.toggle("hidden", !playing);
  els.settlePanel.classList.toggle("hidden", !settling);

  els.btnDeal.disabled = pendingBet <= 0 || pendingBet > state.bankroll;
  els.btnDouble.disabled = !canDouble(state);

  if (betting && state.bankroll <= 0) {
    els.brokePanel.classList.remove("hidden");
  } else {
    els.brokePanel.classList.add("hidden");
  }
}

async function loadPeak() {
  try {
    const res = await fetch(`/api/kv/${PEAK_KEY}`);
    if (res.ok) {
      const t = (await res.text()).trim();
      if (/^\d+$/.test(t)) {
        const n = Number(t);
        if (n > state.peak) {
          state = { ...state, peak: n };
        }
      }
    }
  } catch {
    /* 無 KV */
  }
  render();
}

async function savePeak() {
  try {
    await fetch(`/api/kv/${PEAK_KEY}`, { method: "PUT", body: String(state.peak) });
  } catch {
    /* 無 KV */
  }
}

function addChip(n) {
  audio.unlock();
  if (state.phase !== "betting") return;
  if (pendingBet + n > state.bankroll) {
    setStatus("籌碼不足", "bad");
    return;
  }
  pendingBet += n;
  audio.chip();
  setStatus(`下注 ${pendingBet}，按發牌開始`);
  render();
}

function clearBet() {
  audio.unlock();
  pendingBet = 0;
  audio.place();
  setStatus("選籌碼下注，再按「發牌」。");
  render();
}

function doDeal() {
  audio.unlock();
  if (state.phase !== "betting" || pendingBet <= 0) return;
  const betRes = placeBet(state, pendingBet);
  if (!betRes.ok) {
    setStatus("無法下注", "bad");
    return;
  }
  pendingBet = 0;
  audio.shuffle();
  const dealt = dealRound(betRes.state);
  if (!dealt.ok) {
    setStatus("發牌失敗", "bad");
    return;
  }
  state = dealt.state;
  audio.deal();
  if (state.phase === "settle") {
    finishSettle();
  } else {
    setStatus("要牌、停牌，或加倍");
  }
  render();
}

function finishSettle() {
  const msg = resultMessage(state.result, state.payout, state.bet);
  const tone =
    state.result === "win" || state.result === "blackjack"
      ? "good"
      : state.result === "lose"
        ? "bad"
        : "";
  setStatus(msg, tone);
  if (state.result === "win" || state.result === "blackjack") audio.win();
  else if (state.result === "lose") audio.lose();
  else audio.push();
  void savePeak();
}

function doHit() {
  audio.unlock();
  const r = hit(state);
  if (!r.ok) return;
  state = r.state;
  audio.deal();
  if (state.phase === "settle") finishSettle();
  else setStatus(`你 ${handScore(state.player).total} 點`);
  render();
}

function doStand() {
  audio.unlock();
  const r = stand(state);
  if (!r.ok) return;
  audio.place();
  state = dealerPlay(r.state);
  finishSettle();
  render();
}

function doDouble() {
  audio.unlock();
  const r = doubleDown(state);
  if (!r.ok) {
    setStatus("現在不能加倍", "bad");
    return;
  }
  audio.chip();
  audio.deal();
  state = r.state;
  if (state.phase === "dealer") {
    state = dealerPlay(state);
  }
  if (state.phase === "settle") finishSettle();
  render();
}

function doNext() {
  audio.unlock();
  state = nextRound(state);
  pendingBet = 0;
  audio.place();
  if (state.bankroll <= 0) {
    setStatus("籌碼用盡", "bad");
  } else {
    setStatus("選籌碼下注，再按「發牌」。");
  }
  render();
}

function doReset() {
  audio.unlock();
  state = resetTable();
  pendingBet = 0;
  audio.shuffle();
  setStatus("已重置為 1000 籌碼。選籌碼下注。");
  els.brokePanel.classList.add("hidden");
  render();
}

document.querySelectorAll("[data-chip]").forEach((btn) => {
  btn.addEventListener("click", () => addChip(Number(btn.dataset.chip)));
});
els.btnClear.addEventListener("click", clearBet);
els.btnDeal.addEventListener("click", doDeal);
els.btnHit.addEventListener("click", doHit);
els.btnStand.addEventListener("click", doStand);
els.btnDouble.addEventListener("click", doDouble);
els.btnNext.addEventListener("click", doNext);
els.btnReset.addEventListener("click", doReset);
els.btnBrokeReset.addEventListener("click", doReset);
els.btnMute.addEventListener("click", () => {
  const enabled = audio.enabled;
  audio.setEnabled(!enabled);
  els.btnMute.textContent = enabled ? "音效關" : "音效開";
});

setStatus("選籌碼下注，再按「發牌」。");
render();
void loadPeak();
