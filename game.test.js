import { describe, it, expect } from "vitest";
import {
  makeDeck,
  shuffle,
  cardValue,
  handScore,
  isBlackjack,
  isBust,
  canDouble,
  createTable,
  placeBet,
  dealRound,
  hit,
  stand,
  doubleDown,
  dealerPlay,
  settleRound,
  START_BANKROLL,
} from "./game.js";

let _seed = 1;
function seq() {
  _seed = (Math.imul(_seed, 1664525) + 1013904223) >>> 0;
  return _seed / 4294967296;
}

describe("deck", () => {
  it("makeDeck 有 52 張、四花十三階", () => {
    const d = makeDeck(() => 0.5);
    expect(d.length).toBe(52);
    expect(new Set(d.map((c) => `${c.suit}-${c.rank}`)).size).toBe(52);
  });

  it("shuffle 保留全部牌", () => {
    const s = shuffle(makeDeck(), () => 0.7);
    expect(s.length).toBe(52);
  });
});

describe("cardValue / handScore", () => {
  it("數字／人頭點數", () => {
    expect(cardValue(2)).toBe(2);
    expect(cardValue(10)).toBe(10);
    expect(cardValue(11)).toBe(10);
    expect(cardValue(12)).toBe(10);
    expect(cardValue(13)).toBe(10);
    expect(cardValue(1)).toBe(11);
  });

  it("硬點：無 A 或 A 當 1", () => {
    expect(handScore([{ rank: 10 }, { rank: 7 }])).toEqual({ total: 17, soft: false });
    expect(handScore([{ rank: 1 }, { rank: 6 }, { rank: 10 }])).toEqual({
      total: 17,
      soft: false,
    });
  });

  it("軟點：A 當 11 且不爆", () => {
    expect(handScore([{ rank: 1 }, { rank: 6 }])).toEqual({ total: 17, soft: true });
    expect(handScore([{ rank: 1 }, { rank: 1 }, { rank: 5 }])).toEqual({
      total: 17,
      soft: true,
    });
  });

  it("爆牌", () => {
    expect(isBust([{ rank: 10 }, { rank: 8 }, { rank: 5 }])).toBe(true);
    expect(isBust([{ rank: 10 }, { rank: 7 }])).toBe(false);
  });

  it("天然黑傑克", () => {
    expect(isBlackjack([{ rank: 1 }, { rank: 13 }])).toBe(true);
    expect(isBlackjack([{ rank: 1 }, { rank: 10 }, { rank: 10 }])).toBe(false);
    expect(isBlackjack([{ rank: 10 }, { rank: 7 }])).toBe(false);
  });
});

describe("createTable / placeBet / dealRound", () => {
  it("開桌有起始籌碼、betting 階段", () => {
    const t = createTable({ rand: seq });
    expect(t.bankroll).toBe(START_BANKROLL);
    expect(t.phase).toBe("betting");
    expect(t.bet).toBe(0);
  });

  it("下注扣籌碼並進入 player（或 settle 若天然）", () => {
    // Fixed draw order via deterministic deck: force known cards by stubbing deal with crafted state
    const t0 = createTable({ bankroll: 500, rand: () => 0.1 });
    const bet = placeBet(t0, 50);
    expect(bet.ok).toBe(true);
    expect(bet.state.bankroll).toBe(450);
    expect(bet.state.bet).toBe(50);

    const dealt = dealRound(bet.state);
    expect(dealt.ok).toBe(true);
    expect(dealt.state.player.length).toBe(2);
    expect(dealt.state.dealer.length).toBe(2);
    expect(["player", "settle"]).toContain(dealt.state.phase);
  });

  it("下注超過籌碼或非 betting 拒絕", () => {
    const t = createTable({ bankroll: 40, rand: seq });
    expect(placeBet(t, 50).ok).toBe(false);
    expect(placeBet(t, 0).ok).toBe(false);
    const ok = placeBet(t, 20);
    const dealt = dealRound(ok.state);
    expect(placeBet(dealt.state, 10).ok).toBe(false);
  });
});

describe("hit / stand / double / dealer", () => {
  function handState(player, dealer, opts = {}) {
    return {
      phase: opts.phase ?? "player",
      bankroll: opts.bankroll ?? 900,
      bet: opts.bet ?? 100,
      player: player.map((rank) => ({ suit: 0, rank, up: true })),
      dealer: dealer.map((rank, i) => ({
        suit: 1,
        rank,
        up: i === 0 || opts.dealerUp,
      })),
      doubled: false,
      acted: opts.acted ?? false,
      result: null,
      payout: 0,
      shoe: opts.shoe ?? makeDeck(seq),
      peak: opts.peak ?? 1000,
    };
  }

  it("canDouble：僅首動且籌碼夠", () => {
    expect(canDouble(handState([10, 6], [9, 5], { bankroll: 100, bet: 100 }))).toBe(true);
    expect(canDouble(handState([10, 6], [9, 5], { bankroll: 50, bet: 100 }))).toBe(false);
    expect(canDouble(handState([10, 6], [9, 5], { acted: true }))).toBe(false);
  });

  it("hit 加牌；爆則 settle 輸", () => {
    const shoe = [
      { suit: 2, rank: 10, up: true },
      { suit: 2, rank: 3, up: true },
    ];
    const s = handState([10, 8], [9, 5], { shoe });
    const r = hit(s);
    expect(r.ok).toBe(true);
    expect(r.state.player.length).toBe(3);
    expect(r.state.phase).toBe("settle");
    expect(r.state.result).toBe("lose");
  });

  it("stand 後莊家補牌至 ≥17", () => {
    const shoe = [
      { suit: 2, rank: 6, up: true },
      { suit: 2, rank: 2, up: true },
    ];
    // dealer shows 10 + hole 5 = 15, needs hit
    const s = handState([10, 7], [10, 5], { shoe });
    const st = stand(s);
    expect(st.ok).toBe(true);
    const d = dealerPlay(st.state);
    expect(d.dealer.length).toBeGreaterThanOrEqual(3);
    expect(handScore(d.dealer).total).toBeGreaterThanOrEqual(17);
  });

  it("doubleDown 加倍、只補一張再結算", () => {
    const shoe = [{ suit: 2, rank: 5, up: true }];
    const s = handState([6, 5], [10, 9], { bankroll: 200, bet: 100, shoe });
    const r = doubleDown(s);
    expect(r.ok).toBe(true);
    expect(r.state.bet).toBe(200);
    expect(r.state.bankroll).toBe(100);
    expect(r.state.player.length).toBe(3);
    expect(r.state.doubled).toBe(true);
  });

  it("莊家軟 17 停牌（S17）", () => {
    const shoe = [{ suit: 2, rank: 10, up: true }];
    const s = handState([10, 9], [1, 6], { shoe, dealerUp: true });
    const after = dealerPlay({ ...s, phase: "dealer" });
    expect(after.dealer.length).toBe(2);
    expect(handScore(after.dealer)).toEqual({ total: 17, soft: true });
  });
});

describe("settleRound 賠率", () => {
  function settled(player, dealer, bet = 100, bankroll = 900) {
    const s = {
      phase: "settle",
      bankroll,
      bet,
      player: player.map((rank) => ({ suit: 0, rank, up: true })),
      dealer: dealer.map((rank) => ({ suit: 1, rank, up: true })),
      doubled: false,
      acted: true,
      result: null,
      payout: 0,
      shoe: [],
      peak: Math.max(START_BANKROLL, bankroll),
    };
    return settleRound(s);
  }

  it("玩家贏：1:1", () => {
    const r = settled([10, 9], [10, 7]);
    expect(r.result).toBe("win");
    expect(r.bankroll).toBe(900 + 200);
    expect(r.payout).toBe(200);
  });

  it("天然黑傑克 3:2", () => {
    const r = settled([1, 13], [10, 8], 100, 900);
    expect(r.result).toBe("blackjack");
    expect(r.bankroll).toBe(900 + 250);
    expect(r.payout).toBe(250);
  });

  it("平手退注", () => {
    const r = settled([10, 8], [9, 9]);
    expect(r.result).toBe("push");
    expect(r.bankroll).toBe(900 + 100);
  });

  it("玩家輸", () => {
    const r = settled([10, 6], [10, 9]);
    expect(r.result).toBe("lose");
    expect(r.bankroll).toBe(900);
    expect(r.payout).toBe(0);
  });

  it("雙方天然 → push", () => {
    const r = settled([1, 10], [1, 13]);
    expect(r.result).toBe("push");
  });
});
