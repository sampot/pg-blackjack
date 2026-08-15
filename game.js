/**
 * Blackjack（21 點）— 純函式規則邏輯。
 * 單人對莊：下注、要牌／停牌／加倍、S17、天然 3:2。
 * 不碰 DOM，可單元測試。
 */

export const SUITS = ["spades", "hearts", "diamonds", "clubs"];
export const SUIT_CHAR = ["♠", "♥", "♦", "♣"];
export const RANKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
export const START_BANKROLL = 1000;

export function makeDeck(rand = Math.random) {
  const cards = [];
  for (const s of [0, 1, 2, 3]) {
    for (const r of RANKS) {
      cards.push({ suit: s, rank: r, up: true });
    }
  }
  return shuffle(cards, rand);
}

export function shuffle(arr, rand = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** A=11、人頭=10、其餘面值。 */
export function cardValue(rank) {
  if (rank === 1) return 11;
  if (rank >= 11) return 10;
  return rank;
}

/**
 * 最佳點數（≤21 優先；軟點＝至少一張 A 當 11）。
 * @returns {{ total: number, soft: boolean }}
 */
export function handScore(cards) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += cardValue(c.rank);
    if (c.rank === 1) aces += 1;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  const soft = aces > 0 && total <= 21;
  return { total, soft };
}

export function isBlackjack(cards) {
  return cards.length === 2 && handScore(cards).total === 21;
}

export function isBust(cards) {
  return handScore(cards).total > 21;
}

export function createTable({ bankroll = START_BANKROLL, rand = Math.random } = {}) {
  return {
    phase: "betting",
    bankroll,
    bet: 0,
    player: [],
    dealer: [],
    doubled: false,
    acted: false,
    result: null,
    payout: 0,
    shoe: makeDeck(rand),
    peak: bankroll,
    rand,
  };
}

export function placeBet(state, amount) {
  if (state.phase !== "betting") return { ok: false, reason: "not-betting", state };
  const n = Math.floor(Number(amount));
  if (!Number.isFinite(n) || n <= 0) return { ok: false, reason: "bad-bet", state };
  if (n > state.bankroll) return { ok: false, reason: "insufficient", state };
  return {
    ok: true,
    state: {
      ...state,
      bankroll: state.bankroll - n,
      bet: n,
      player: [],
      dealer: [],
      doubled: false,
      acted: false,
      result: null,
      payout: 0,
    },
  };
}

function draw(state, up = true) {
  let shoe = state.shoe.slice();
  if (shoe.length < 15) {
    shoe = makeDeck(state.rand || Math.random);
  }
  const card = { ...shoe[0], up };
  return { card, shoe: shoe.slice(1) };
}

/**
 * 發兩張給玩家與莊（莊家第二張蓋牌）。
 * 任一方天然 → 直接 settle。
 */
export function dealRound(state) {
  if (state.bet <= 0) return { ok: false, reason: "no-bet", state };
  if (state.phase !== "betting" && state.player.length) {
    return { ok: false, reason: "already-dealt", state };
  }

  let s = { ...state, shoe: state.shoe.slice() };
  const p = [];
  const d = [];

  let drawn = draw(s, true);
  p.push(drawn.card);
  s = { ...s, shoe: drawn.shoe };

  drawn = draw(s, true);
  d.push(drawn.card);
  s = { ...s, shoe: drawn.shoe };

  drawn = draw(s, true);
  p.push(drawn.card);
  s = { ...s, shoe: drawn.shoe };

  drawn = draw(s, false);
  d.push(drawn.card);
  s = { ...s, shoe: drawn.shoe, player: p, dealer: d, acted: false, doubled: false };

  const pBj = isBlackjack(p);
  const dBj = isBlackjack(d);
  if (pBj || dBj) {
    const revealed = {
      ...s,
      phase: "settle",
      dealer: s.dealer.map((c) => ({ ...c, up: true })),
    };
    return { ok: true, state: settleRound(revealed) };
  }

  return { ok: true, state: { ...s, phase: "player" } };
}

export function canDouble(state) {
  if (state.phase !== "player") return false;
  if (state.acted) return false;
  if (state.player.length !== 2) return false;
  return state.bankroll >= state.bet;
}

export function hit(state) {
  if (state.phase !== "player") return { ok: false, reason: "not-player", state };
  const drawn = draw(state, true);
  const player = [...state.player, drawn.card];
  let next = {
    ...state,
    shoe: drawn.shoe,
    player,
    acted: true,
  };
  if (isBust(player)) {
    next = {
      ...next,
      phase: "settle",
      dealer: next.dealer.map((c) => ({ ...c, up: true })),
      result: "lose",
      payout: 0,
    };
    return { ok: true, state: next };
  }
  return { ok: true, state: next };
}

export function stand(state) {
  if (state.phase !== "player") return { ok: false, reason: "not-player", state };
  return {
    ok: true,
    state: {
      ...state,
      phase: "dealer",
      acted: true,
      dealer: state.dealer.map((c) => ({ ...c, up: true })),
    },
  };
}

export function doubleDown(state) {
  if (!canDouble(state)) return { ok: false, reason: "cannot-double", state };
  const bet = state.bet * 2;
  const bankroll = state.bankroll - state.bet;
  const drawn = draw(state, true);
  const player = [...state.player, drawn.card];
  let next = {
    ...state,
    bankroll,
    bet,
    shoe: drawn.shoe,
    player,
    doubled: true,
    acted: true,
  };
  if (isBust(player)) {
    next = {
      ...next,
      phase: "settle",
      dealer: next.dealer.map((c) => ({ ...c, up: true })),
      result: "lose",
      payout: 0,
    };
    return { ok: true, state: next };
  }
  return {
    ok: true,
    state: {
      ...next,
      phase: "dealer",
      dealer: next.dealer.map((c) => ({ ...c, up: true })),
    },
  };
}

/**
 * 莊家 S17：硬／軟 ≥17 停；否則補牌。
 */
export function dealerPlay(state) {
  let s = {
    ...state,
    phase: "dealer",
    dealer: state.dealer.map((c) => ({ ...c, up: true })),
    shoe: state.shoe.slice(),
  };
  while (true) {
    const { total } = handScore(s.dealer);
    if (total >= 17) break;
    const drawn = draw(s, true);
    s = { ...s, shoe: drawn.shoe, dealer: [...s.dealer, drawn.card] };
  }
  return settleRound({ ...s, phase: "settle" });
}

/**
 * 結算：黑傑克 3:2、一般贏 1:1、平手退注。
 * 注碼已在 placeBet／double 從 bankroll 扣除。
 */
export function settleRound(state) {
  const player = state.player;
  const dealer = state.dealer.map((c) => ({ ...c, up: true }));
  const bet = state.bet;
  let bankroll = state.bankroll;
  let result = state.result;
  let payout = state.payout;

  if (result === "lose") {
    // already bust
    payout = 0;
  } else {
    const pBj = isBlackjack(player);
    const dBj = isBlackjack(dealer);
    const pScore = handScore(player).total;
    const dScore = handScore(dealer).total;
    const pBust = pScore > 21;
    const dBust = dScore > 21;

    if (pBust) {
      result = "lose";
      payout = 0;
    } else if (pBj && dBj) {
      result = "push";
      payout = bet;
      bankroll += bet;
    } else if (pBj) {
      result = "blackjack";
      payout = Math.floor(bet * 2.5);
      bankroll += payout;
    } else if (dBj) {
      result = "lose";
      payout = 0;
    } else if (dBust || pScore > dScore) {
      result = "win";
      payout = bet * 2;
      bankroll += payout;
    } else if (pScore === dScore) {
      result = "push";
      payout = bet;
      bankroll += bet;
    } else {
      result = "lose";
      payout = 0;
    }
  }

  const peak = Math.max(state.peak ?? START_BANKROLL, bankroll);
  return {
    ...state,
    phase: "settle",
    dealer,
    result,
    payout,
    bankroll,
    peak,
  };
}

/** 清桌回下注階段（保留籌碼與 shoe）。 */
export function nextRound(state) {
  return {
    ...state,
    phase: "betting",
    bet: 0,
    player: [],
    dealer: [],
    doubled: false,
    acted: false,
    result: null,
    payout: 0,
  };
}

export function resetTable(rand = Math.random) {
  return createTable({ rand });
}
