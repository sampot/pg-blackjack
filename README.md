# 21點（Blackjack）

對莊家的經典 21 點：籌碼下注、要牌／停牌／加倍，莊家軟 17 停牌（S17），天然黑傑克赔 3:2。

## 玩法

1. 點籌碼累加本局注碼，按「發牌」。
2. **要牌**補一張；**停牌**交給莊家；首兩張可 **加倍**（再下一注、只補一張）。
3. 愈接近 21 且不爆者勝；平手退注。天然（首兩張 21）賠 3:2。

## 操作

- 觸控／滑鼠皆可；主按鈕 ≥44px，窄螢幕直向牌桌。
- 音效可關；最高籌碼寫入 `/api/kv/pg-blackjack-peak`（無 KV 環境照玩）。

## 技術

- `game.js`：純函式規則（點數、下注、發牌、要牌／停牌／加倍、莊家 S17、結算）— `npx vitest run`。
- `app.js`：DOM 渲染與互動。
- `audio.js`：Kenney Casino Audio 取樣。
- 純 HTML + CSS + JS，無 build、不安裝套件。

## 試玩（本機）

```bash
npx --yes serve .
# 或
python3 -m http.server 8080
```

## 授權

- 程式碼：MIT（見 `LICENSE`）。
- 美術／音效：Kenney.nl CC0（見 `ATTRIBUTION.md`）。
