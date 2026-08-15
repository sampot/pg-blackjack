/**
 * Blackjack — Kenney casino-audio 取樣。
 */
export class BlackjackAudio {
  constructor() {
    /** @type {Record<string, HTMLAudioElement>} */
    this.clips = {};
    this.enabled = true;
    this.unlocked = false;
    const map = {
      shuffle: "card-shuffle.ogg",
      deal: "card-slide-1.ogg",
      deal2: "card-slide-2.ogg",
      place: "card-place-1.ogg",
      place2: "card-place-2.ogg",
      chip: "chip-lay-1.ogg",
      chip2: "chip-lay-2.ogg",
      win: "chips-stack-1.ogg",
      handle: "chips-handle-1.ogg",
    };
    for (const [k, file] of Object.entries(map)) {
      const a = new Audio(`assets/sfx/${file}`);
      a.preload = "auto";
      a.volume = 0.45;
      this.clips[k] = a;
    }
  }

  setEnabled(on) {
    this.enabled = on;
  }

  async unlock() {
    this.unlocked = true;
    // warm one clip under user gesture
    try {
      const a = this.clips.chip;
      a.volume = 0;
      await a.play();
      a.pause();
      a.currentTime = 0;
      a.volume = 0.45;
    } catch {
      /* ignore */
    }
  }

  play(key) {
    if (!this.enabled) return;
    const a = this.clips[key];
    if (!a) return;
    try {
      a.currentTime = 0;
      void a.play();
    } catch {
      /* ignore */
    }
  }

  shuffle() {
    this.play("shuffle");
  }

  deal() {
    this.play(Math.random() < 0.5 ? "deal" : "deal2");
  }

  place() {
    this.play(Math.random() < 0.5 ? "place" : "place2");
  }

  chip() {
    this.play(Math.random() < 0.5 ? "chip" : "chip2");
  }

  win() {
    this.play("win");
  }

  lose() {
    this.play("handle");
  }

  push() {
    this.play("place");
  }
}
