# 21點（`pg-blackjack`）— 遊戲規劃文檔

> **用途：** 本 repo 的遊戲權威規格——coding agent 改動前必讀：這個遊戲是什麼、規則、設計限制、優化方向。
> **整理方式：** 從本 repo 實作反向整理（2026-08-23）。**改玩法先改此檔再改碼**；本檔與程式碼衝突時，以「規則（§3）」描述的設計意圖為準回報差異。
> **上游契約：** [PG-GAME-AGENT-GUIDE.md](https://github.com/sampot/playgrounds/blob/main/docs/PG-GAME-AGENT-GUIDE.md)（唯一必讀；本檔不重複其全文）· 型錄條目 `playgrounds/catalog/entries/pg-blackjack.yaml`

## 1. 一句話

對莊家的 21 點——籌碼下注、要牌／停牌／加倍，莊家 S17、天然黑傑克 3:2 的單人休閒牌局；純娛樂虛擬籌碼，非博弈。

## 2. 定案速覽

| 項 | 值 |
| --- | --- |
| catalog id / kind / series | `pg-blackjack` / `game` / `桌遊` |
| status | `listed` |
| 模式 | 單人 vs 莊家（無 AI 對手位，莊家按固定規則行動） |
| 籌碼制 | 起 **1000**；面額 10/25/50/100/250；破產免費重置 1000 |
| 規則集 | 單副牌靴（剩 <15 張整副重洗）· S17 · 天然 3:2 · 無保險／分牌／投降 |
| 定位 | **純娛樂、非博弈**——虛擬籌碼無任何兌換機制 |
| 素材 | 牌面圖檔＋Casino Audio 取樣皆 Kenney CC0 |
| 交付形 | 純 HTML＋CSS＋ESM JS；無 build；`npx vitest run` 測試 |

## 3. 完整規則（現行實作）

### 3.1 點數與下注

- 點數（`cardValue`）：A=11、J/Q/K=10、其餘面值。`handScore` 總和超過 21 時逐張把 A 降為 1；仍有 A 以 11 計即「軟點」（soft=true）。
- 下注：點籌碼累加 `pendingBet`（未扣款暫存）；按發牌時 `placeBet` 校驗正整數且 ≤ 籌碼後扣款。betting 階段 HUD 顯示「籌碼 − pendingBet」預覽。

### 3.2 流程與玩家動作

- 發牌順序：玩家明、莊明、玩家明、莊暗（hole）。任一方天然（首兩張 21，`isBlackjack`）→ 立即亮牌直接結算。
- **要牌**（hit）：補一張翻開；爆牌立即判負結算。首次要牌後 `acted = true`，之後不可再加倍。
- **停牌**（stand）：亮莊暗牌進莊家回合。
- **加倍**（doubleDown）：僅限首動、手牌恰好兩張、剩餘籌碼 ≥ 注碼；再扣一注（注碼 ×2）、只補一張，爆則輸、否則直接進莊家回合。
- **無**保險、分牌（split）、投降；莊家無選擇權。

### 3.3 莊家與結算（實際值）

- **莊家 S17**（`dealerPlay`）：總點 <17 必補牌；≥17 即停（軟 17 也停）。
- 結算優先序（`settleRound`）：玩家爆 → 輸（payout 0）；雙方天然 → push 退注；玩家天然 → 付 `floor(bet × 2.5)`（淨贏 1.5 倍，例：100 注得 250 回收）；莊家天然 → 玩家輸；莊爆或玩家點大 → win 付 `bet × 2`（淨贏 1 倍）；平點 → push 退注；其餘輸。
- 注碼於下注／加倍時已扣，結算只把應得金額加回 `bankroll`；`peak = max(舊 peak, bankroll)` 於每次結算更新。

### 3.4 牌靴與邊界處理

- 單副 52 張 Fisher–Yates；每次抽牌前剩餘 <15 張即整副重洗（`draw` 內建）。跨局保留 shoe（`nextRound` 不重洗）。
- 非 betting 階段下注、bet ≤ 0、超過籌碼、重複發牌一律拒絕並回 reason codes；UI 以狀態列提示，不用原生對話框。
- 籌碼歸零：betting 階段顯示 broke-panel，「再來」重置回 1000；結算面板的「重置籌碼」隨時可用（非破壞性，不需確認）。
- KV 載入時 peak 取「本地值與 KV 值較大者」，避免舊裝置倒退。

## 4. 操作與畫面

| 輸入 | 動作 |
| --- | --- |
| 籌碼鈕 ×5 | 累加本局注碼（超過籌碼擋下並提示） |
| 清除 | pendingBet 歸零 |
| 發牌 | 扣款並開局（天然直接跳結算） |
| 要牌／停牌／加倍 | player 階段三鈕；加倍不合條件時 disabled |
| 下一局／重置籌碼 | settle 階段推進或重置 |
| 音效鈕 | 開/關（僅記憶體，未持久化） |

- HUD：籌碼、本局注碼、最高碼、最高籌碼；雙方牌區各有分數——hole 未亮時莊家只顯示明牌合計，玩家顯示總分（軟點加註「軟」）。
- Mobile-first 直向牌桌、主按鈕 ≥44px；禁 `alert`／`confirm`／`prompt`。

## 5. 持久化（KV 權威）

| key | 內容 | 讀寫時機 |
| --- | --- | --- |
| `pg-blackjack-peak`（`/api/kv`，權威） | 歷史最高籌碼（字串數字） | init GET（取大合併）；每次結算 PUT |

- 無 localStorage；籌碼本身不持久化，重載回到 1000。`functions.js` 為空 stub（`export default {}`），無自訂 functions API。
- 例行性質：`finishSettle` 每次結算都 PUT（含峰值未刷新時），屬可接受的簡化寫法。

## 6. 美術／音效／署名

- `assets/cards/`：52 牌面＋`card_back.png`＋suit/empty/joker 圖與 `Kenney-PlayingCards-License.txt`（Kenney.nl — Playing Cards Pack，CC0；慣例仍署名於 `ATTRIBUTION.md`）。
- `assets/sfx/`：9 個 Kenney Casino Audio `.ogg`（card-shuffle、card-slide×2、card-place×2、chip-lay×2、chips-handle、chips-stack）＋授權 txt。以 HTMLAudio 播放（volume 0.45），deal/place/chip 隨機二選一變化；首次手勢以靜音播放暖機解鎖。
- 新增素材一律拷進 `assets/`、更新 `ATTRIBUTION.md`、同步 `sam-manifest.json` files 清單。

## 7. 測試（`npx vitest run`）

現有覆蓋（`game.test.js`，21 例）：52 張唯一、shuffle 保牌；`cardValue` 全域（數字／人頭／A=11）；硬點（A 降 1）、軟點（A 留 11）、爆牌判定、天然判定（兩張 21 才算）；開桌初始值（bankroll 1000、betting）；下注扣款與發牌後階段、超注／bet 0／非 betting 拒絕；`canDouble` 三條件（首動／籌碼足／phase）；hit 加牌與爆牌直結輸；stand 後莊家補至 ≥17；doubleDown 加倍扣款、只補一張、doubled 標記；S17 軟 17 停牌；賠率五案例（win 1:1、blackjack 3:2＝250、push 退注、lose、雙天然 push）。

改動規則必補對應邊界測試；`app.js` DOM／互動不在測試範圍。

## 8. 硬約束（不可違反）

1. 僅 HTML＋CSS＋JS（ESM）；**無 build**、不入庫 `node_modules`、不安套件；工具一律 `npx <pkg>` 臨時執行。
2. 禁瀏覽器原生 `alert`／`confirm`／`prompt`；提示一律狀態列／頁內 UI。
3. Mobile-first；主操作不可 hover-only。
4. 成績（最高籌碼）以 `fetch('/api/kv/…')` 為權威；禁止裸 localStorage 當權威。
5. 不自行載入 `sdk.js`；宿主注入 `window.PG`。本作未用 `PG.libs`（勿無故引入遊戲框架）。
6. 改動可執行邏輯前先寫失敗測試（TDD）；`game.js` 保持純函式、不碰 DOM。
7. 檔案清單變動須同步 `sam-manifest.json`（下載契約）。
8. **定位約束：純娛樂非博弈**——只准虛擬籌碼；禁止真錢、儲值、虛擬寶物兌換或任何博奕變現機制；破產重置永遠免費無限。

## 9. 優化建議（可玩性與樂趣）

依優先級；實作前先在此登記並補測試。原則：強化決策深度與手感，不改變「單人對莊休閒 21 點」的核心認同與 §8 定位約束。

**高優先**

1. **分牌（Split）**：同點數兩張拆兩手各一注（再扣一注），是現行規則集最大的決策深度缺口；需把 state 的 player 改為 hands[] 迭代處理，UI 依手排序出牌，測試補分牌後各自結算。
2. **基本策略教學提示（可關）**：依玩家手牌與莊明牌對照基本策略表給 hit/stand/double 建議一行 flash；新手學會正確決策本身就是樂趣曲線。

**中優先**

3. **生涯戰績**：KV JSON（場次／勝率／最高連勝／破產次數），結算面板顯示；給長期目標感。
4. **保險／Even Money（預設關）**：莊明 A 時的側注決策補齊規則完整度；做成家規式開關避免複雜化新手局。
5. **下注 UX**：「上次注額」一键重下＋長按連加，減少重複點擊。

**低優先**

6. **牌靴深度顯示**：剩餘張數或剪牌位置視覺化，強化真實賭桌氛圍（純 UI）。
7. **音效細分與發牌動畫**：win/blackjack 用不同變奏、大牌勝利加 chips-stack 疊放音；牌卡位移 transition 提升手感。
