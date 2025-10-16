/*!
 * ScrollVars v1.0.0
 * (c) 2025 ng.inc / MIT
 * ---------------------------------------------------------------------
 * 📘 概要
 * スクロール位置に応じて要素へ CSSカスタムプロパティ（変数）を設定する軽量JSプラグイン。
 * GSAPやScrollTriggerなしでも、純粋にCSS変数でトランスフォームや色などを制御可能。
 *
 * ---------------------------------------------------------------------
 * 🧩 主な機能
 * - 対象: `.scrollvars` または `[data-sv]` を持つ要素。
 * - data属性で複数のCSS変数を定義可能。
 * - 要素がビューポートを通過する間の進行率（0〜1）に応じて値を補間。
 * - 値範囲（min..max）と初期値（@init）を指定可能。
 * - 要素がスクロール領域に入る／出るタイミングで自動クラス付与。
 * - `ResizeObserver`・`visualViewport` に対応し、スマホURLバーでも安定。
 *
 * ---------------------------------------------------------------------
 * 🔧 基本構文
 *
 *  <div class="scrollvars"
 *       data-sv="--scale=0..1@0; --x=-5..5@-5; --hue=0..360@0"
 *       data-sv-start="0.0"
 *       data-sv-end="1.0">
 *       コンテンツ...
 *  </div>
 *
 * ---------------------------------------------------------------------
 * 📐 data-sv属性の書式
 *
 *  data-sv="--変数名=最小値..最大値@初期値; --別変数=..."
 *
 *  - 「@初期値」は省略可（省略時は最小値が初期値になる）
 *  - マイナス値・小数値も指定可能。
 *  - 複数指定する場合はセミコロンで区切る。
 *
 * 例：
 *  "--scale=0..1@0.2; --x=-50..50@-50; --opacity=0..1@0"
 *
 * ---------------------------------------------------------------------
 * 🎯 data-sv-start / data-sv-end
 *
 *  スクロール区間の基準をビューポート高さに対する割合(0〜1)で指定。
 *
 *  - data-sv-start="0.0" → 要素の上端が画面上端に来たとき t=0（開始）
 *  - data-sv-end="1.0"   → 要素の下端が画面下端に来たとき t=1（終了）
 *
 *  ※ start=end の場合は「瞬時に完了」トリガー的に動作。
 *
 * ---------------------------------------------------------------------
 * 🧮 進行率 t の算出ロジック
 *
 *  t = -A / (B - A)
 *  A: 要素上端 - startライン位置
 *  B: 要素下端 - endライン位置
 *  → 開始前は常に0、終了後は1で打ち切り。
 *
 * ---------------------------------------------------------------------
 * 🧠 進行値の補間ロジック（progressOrigin）
 *
 *  progressOrigin = "init" | "min" | "center"
 *
 *  - "init": @初期値 → max に補間（推奨）
 *  - "min":  min → max に補間（従来式）
 *  - "center": minとmaxの中点を原点に補間（振り子的）
 *
 *  ※ data-sv-origin="init|min|center" でも個別指定可能。
 *
 * ---------------------------------------------------------------------
 * 🧩 クラス付与（スクロール状態）
 *
 *  - is-sv-active   : tが0〜1の間（スクロール中）
 *  - is-sv-started  : tがthresholdを超えた（開始）
 *  - is-sv-ended    : tが(1-threshold)以上（終了）
 *
 * ---------------------------------------------------------------------
 * ⚙️ 初期化オプション（ScrollVars.init({...})）
 *
 *  selector         : 対象セレクタ
 *  clamp            : tを0..1範囲にクランプ（true推奨）
 *  threshold        : 開始/終了クラス判定のヒステリシス
 *  smartResize      : SPでのresize多発を防止（true推奨）
 *  resizeMinDelta   : 再計算の最小高さ変化量(px)
 *  useVisualViewport: visualViewportを使用してSP安定化
 *  initUntilStart   : スクロール開始まで@初期値を維持
 *  progressOrigin   : 上記"init"|"min"|"center"（グローバル既定）
 *
 * 例：
 *  ScrollVars.init({
 *    resizeMinDelta: 64,
 *    progressOrigin: "init"
 *  });
 *
 * ---------------------------------------------------------------------
 * 🪄 カスタムイベント
 *
 *  各要素に対して以下が発火：
 *   - "sv:start" : 開始ライン到達時
 *   - "sv:enter" : アクティブ領域に入った時
 *   - "sv:leave" : アクティブ領域から出た時
 *   - "sv:end"   : 終了ライン通過時
 *
 *  例：
 *    el.addEventListener("sv:start", e => console.log("start", e.detail.t));
 *
 * ---------------------------------------------------------------------
 * 💡 使用例（CSS）
 *
 *  .scrollvars {
 *    transform: translateX(calc(var(--x, 0) * 1%)) scale(var(--scale, 1));
 *    filter: hue-rotate(calc(var(--hue, 0) * 1deg));
 *  }
 *
 * ---------------------------------------------------------------------
 * 🧩 拡張予定（今後のアイデア）
 *  - data-sv-ease="easeOutCubic" 対応
 *  - data-sv-once="true"（1回きり再生）
 *  - data-sv-media="(min-width:1024px)" 条件付き有効化
 * ---------------------------------------------------------------------
 */

;(() => {
	"use strict";

	const DEFAULTS = {
		selector: ".scrollvars,[data-sv]",
		startAttr: "data-sv-start",
		endAttr: "data-sv-end",
		specAttr: "data-sv",
		originAttr: "data-sv-origin", // "init" | "min" | "center"（任意）
		activeClass: "is-sv-active",
		startedClass: "is-sv-started",
		endedClass: "is-sv-ended",
		clamp: true,
		threshold: 0.0005,
		smartResize: true,
		initUntilStart: true,
		progressOrigin: "init", // "min" | "init" | "center"
		resizeMinDelta: 1, // 高さの最小変化量(px)
		useVisualViewport: true
	};

	const toNum = (v, def = 0) => {
		if (v == null || v === "") return def;
		const n = Number(v);
		return Number.isFinite(n) ? n : def;
	};

	// specパーサ："--name=min..max@init" → {name,min,max,init}
	const parseSpec = (raw) => {
		const list = [];
		if (!raw) return list;
		const parts = raw.split(";").map(s => s.trim()).filter(Boolean);
		for (const part of parts) {
			const m = part.match(/^([A-Za-z_\-][A-Za-z0-9_\-]*)\s*=\s*([^@]+?)(?:@(.+))?$/);
			if (!m) continue;
			const name = m[1];
			const range = m[2].trim();
			const initRaw = m[3] != null ? m[3].trim() : null;
			const m2 = range.match(/^\s*([+\-]?\d+(?:\.\d+)?)\s*\.\.\s*([+\-]?\d+(?:\.\d+)?)\s*$/);
			if (!m2) continue;
			const min = Number(m2[1]);
			const max = Number(m2[2]);
			const init = initRaw != null ? Number(initRaw) : min;
			if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(init)) continue;
			list.push({ name, min, max, init });
		}
		return list;
	};

	// 0..1 進行率。start/end は viewport 比 (0=上端, 1=下端)。
	// 区間外は厳密に 0 / 1 を返す。区間内は線形に 0→1。
	const computeProgress = (el, start = 0, end = 1) => {
		const rect = el.getBoundingClientRect();
		const vh = window.innerHeight || document.documentElement.clientHeight;

		const startPx = start * vh; // el.top がここに到達 → t=0
		const endPx   = end   * vh; // el.bottom がここに到達 → t=1

		const A = rect.top    - startPx; // 開始ラインに対する距離
		const B = rect.bottom - endPx;   // 終了ラインに対する距離

		if (A > 0)  return 0; // まだ開始前
		if (B <= 0) return 1; // すでに終了後

		// 区間内：必ず 0→1 に収束
		const t = -A / (B - A);
		return t;
	};

	// 進行 t と {min,max,init} から値を算出（原点切替）
	const mapByOrigin = (t, s, origin) => {
		switch (origin) {
			case "min": // min→max 補間
				return s.min + t * (s.max - s.min);
			case "center": {
				const mid = (s.min + s.max) / 2;
				return mid + (t - 0.5) * (s.max - s.min);
			}
			case "init": // init→max 補間（推奨）
			default:
				return s.init + t * (s.max - s.init);
		}
	};

	// 0..1に収める
	const clamp01 = (t) => t < 0 ? 0 : (t > 1 ? 1 : t);

	class Instance {
		constructor(el, opts) {
			this.el = el;
			this.opts = opts;
			this.specs = parseSpec(el.getAttribute(opts.specAttr));
			this.start = toNum(el.getAttribute(opts.startAttr), 0);
			this.end = toNum(el.getAttribute(opts.endAttr), 1);

			// インラインで origin 指定があれば優先
			const originAttr = el.getAttribute(opts.originAttr);
			this.origin = (originAttr === "min" || originAttr === "center" || originAttr === "init")
				? originAttr
				: opts.progressOrigin;

			// 状態
			this.t = 0;
			this.active = false;
			this.started = false;
			this.ended = false;

			// 初期値（範囲丸め＋即時適用）
			for (const s of this.specs) {
				if (s.init < s.min) s.init = s.min;
				if (s.init > s.max) s.init = s.max;
				this.el.style.setProperty(s.name, String(s.init));
			}

			// 初期クラス
			this.updateClasses(0, true);
		}

		update() {
			let t = computeProgress(this.el, this.start, this.end);
			if (this.opts.clamp) t = clamp01(t);
			this.t = t;

			const { threshold, initUntilStart } = this.opts;
			const isStarted = t > threshold;
			const isEnded   = t >= (1 - threshold);
			const isActive  = t > threshold && t < (1 - threshold);

			// 値反映（開始前は @ を保持）
			for (const s of this.specs) {
				const v = (initUntilStart && !isStarted)
					? s.init
					: mapByOrigin(t, s, this.origin);
				const vv = Math.max(Math.min(v, s.max), s.min); // 念のためクランプ
				this.el.style.setProperty(s.name, String(vv));
			}

			this.updateClasses(t, false);
		}

		updateClasses(t, initial) {
			const { activeClass, startedClass, endedClass, threshold } = this.opts;
			const wasActive = this.active;
			const wasStarted = this.started;
			const wasEnded = this.ended;

			const isStarted = t > threshold;
			const isEnded = t >= (1 - threshold);
			const isActive = t > threshold && t < (1 - threshold);

			this.active = isActive;
			this.started = isStarted;
			this.ended = isEnded;

			this.el.classList.toggle(activeClass, isActive);
			this.el.classList.toggle(startedClass, isStarted);
			this.el.classList.toggle(endedClass, isEnded);

			if (!initial) {
				if (!wasStarted && isStarted) this.el.dispatchEvent(new CustomEvent("sv:start", { detail: { t } }));
				if (!wasActive && isActive)   this.el.dispatchEvent(new CustomEvent("sv:enter", { detail: { t } }));
				if (wasActive && !isActive)   this.el.dispatchEvent(new CustomEvent("sv:leave", { detail: { t } }));
				if (!wasEnded && isEnded)     this.el.dispatchEvent(new CustomEvent("sv:end",   { detail: { t } }));
			}
		}
	}

	const ScrollVars = {
		_instances: [],
		_opts: { ...DEFAULTS },
		_bound: false,
		_rafId: 0,

		init(userOpts = {}) {
			this._opts = { ...DEFAULTS, ...userOpts };
			const nodes = Array.from(document.querySelectorAll(this._opts.selector));
			this._instances = nodes.map(n => new Instance(n, this._opts));

			// 1フレーム更新
			this._update();

			if (!this._bound) this._bind();
			return this;
		},

		refresh() {
			this._update();
		},

		_bind() {
			this._bound = true;

			let ticking = false;
			const onTick = () => { ticking = false; this._update(); };
			const requestTick = () => {
				if (!ticking) {
					ticking = true;
					this._rafId = window.requestAnimationFrame(onTick);
				}
			};

			// ハンドラ参照を保存（destroyで外せるように）
			this._onScroll = requestTick;
			window.addEventListener("scroll", this._onScroll, { passive: true });

			// スマートリサイズ
			let lastW = window.innerWidth;
			let lastH = window.innerHeight;

			const handleResize = () => {
				if (!this._opts.smartResize) return requestTick();
				const w = window.innerWidth;
				const h = window.innerHeight;
				const wChanged = w !== lastW;
				const hDelta = Math.abs(h - lastH);
				if (wChanged || hDelta >= this._opts.resizeMinDelta) {
					lastW = w; lastH = h;
					requestTick();
				}
			};

			this._onResize = handleResize;
			window.addEventListener("resize", this._onResize);

			// VisualViewport（SPでのURLバー揺れ対策）
			if (this._opts.useVisualViewport && window.visualViewport) {
				let lastVVW = window.visualViewport.width;
				let lastVVH = window.visualViewport.height;
				this._onVvResize = () => {
					const w = window.visualViewport.width;
					const h = window.visualViewport.height;
					const wChanged = w !== lastVVW;
					const hDelta = Math.abs(h - lastVVH);
					if (wChanged || hDelta >= this._opts.resizeMinDelta) {
						lastVVW = w; lastVVH = h;
						requestTick();
					}
				};
				window.visualViewport.addEventListener("resize", this._onVvResize, { passive: true });
			}

			// 端末回転は即時
			this._onOrient = () => requestTick();
			window.addEventListener("orientationchange", this._onOrient);

			// 画像/フォント読み込み後
			this._onLoad = () => this._update();
			window.addEventListener("load", this._onLoad);

			// 要素サイズ変化
			if ("ResizeObserver" in window) {
				const ro = new ResizeObserver(() => requestTick());
				for (const inst of this._instances) ro.observe(inst.el);
				this._ro = ro;
			}
		},

		_update() {
			for (const inst of this._instances) inst.update();
		},

		destroy() {
			if (this._rafId) cancelAnimationFrame(this._rafId);

			if (this._onScroll)  window.removeEventListener("scroll", this._onScroll);
			if (this._onResize)  window.removeEventListener("resize", this._onResize);
			if (this._onVvResize && window.visualViewport) {
				window.visualViewport.removeEventListener("resize", this._onVvResize);
			}
			if (this._onOrient)  window.removeEventListener("orientationchange", this._onOrient);
			if (this._onLoad)     window.removeEventListener("load", this._onLoad);

			if (this._ro) {
				try { this._ro.disconnect(); } catch (e) {}
				this._ro = null;
			}

			this._instances = [];
			this._bound = false;

			this._onScroll = this._onResize = this._onVvResize = this._onOrient = this._onLoad = null;
		}
	};

	// グローバル公開
	window.ScrollVars = ScrollVars;

	// 自動初期化（不要なら削除）
	document.addEventListener("DOMContentLoaded", () => {
		window.ScrollVars.init();
	});
})();
