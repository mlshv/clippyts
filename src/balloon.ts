import { getHeight, getOffset, getWidth, getWindowScroll } from "./utils";
const WORD_SPEAK_TIME: number = 200;
const CLOSE_BALLOON_DELAY = 2000;
const BALLOON_MARGIN = 15;

export default class Balloon {
	private _targetEl: HTMLElement;
	private _balloon?: HTMLElement;
	private _content?: HTMLElement;
	private _complete?: () => void;

	private _hiding: number | null = null;
	private _loop: number | null = null;

	private _hidden: boolean;
	private _active = true;
	private _hold = false;

	private _addWord: (() => void) | null = null;

	constructor(targetEl: HTMLElement) {
		this._targetEl = targetEl;
		this._hidden = true;
		this._setup();
	}

	private _setup() {
		const balloonEl = document.createElement("div");
		balloonEl.className = "clippy-balloon";
		balloonEl.setAttribute("hidden", "true");
		const tipEl = document.createElement("div");
		tipEl.className = "clippy-tip";
		const contentEl = document.createElement("div");
		contentEl.className = "clippy-content";
		balloonEl.appendChild(tipEl);
		balloonEl.appendChild(contentEl);
		this._balloon = balloonEl;
		this._content = contentEl;

		const targetEl = this._targetEl;
		targetEl.insertAdjacentElement("afterend", balloonEl);
	}

	public reposition() {
		const sides = ["top-left", "top-right", "bottom-left", "bottom-right"];

		for (let i = 0; i < sides.length; i++) {
			const s = sides[i];
			this._position(s);
			if (!this._isOut()) break;
		}
	}

	/***
	 *
	 * @param side
	 * @private
	 */
	private _position(side: string) {
		if (!this._balloon) return;

		const o = getOffset(this._targetEl);
		const h = getHeight(this._targetEl, "height") ?? 0;
		const w = getWidth(this._targetEl, "width") ?? 0;

		const { scrollLeft: sT, scrollTop: sL } = getWindowScroll();
		o.top -= sT;
		o.left -= sL;

		const bH = getHeight(this._balloon, "outer") ?? 0;
		const bW = getWidth(this._balloon, "outer") ?? 0;

		this._balloon.classList.remove("clippy-top-left");
		this._balloon.classList.remove("clippy-top-right");
		this._balloon.classList.remove("clippy-bottom-right");
		this._balloon.classList.remove("clippy-bottom-left");

		let left = 0;
		let top = 0;
		switch (side) {
			case "top-left":
				// right side of the balloon next to the right side of the agent
				left = o.left + w - bW;
				top = o.top - bH - BALLOON_MARGIN;
				break;
			case "top-right":
				// left side of the balloon next to the left side of the agent
				left = o.left;
				top = o.top - bH - BALLOON_MARGIN;
				break;
			case "bottom-right":
				// right side of the balloon next to the right side of the agent
				left = o.left;
				top = o.top + h + BALLOON_MARGIN;
				break;
			case "bottom-left":
				// left side of the balloon next to the left side of the agent
				left = o.left + w - bW;
				top = o.top + h + BALLOON_MARGIN;
				break;
		}

		this._balloon.style.top = `${top}px`;
		this._balloon.style.left = `${left}px`;
		this._balloon.classList.add(`clippy-${side}`);
	}

	private _isOut() {
		if (!this._balloon) return;

		const o = getOffset(this._balloon);
		const bH = getHeight(this._balloon, "outer") ?? 0;
		const bW = getWidth(this._balloon, "outer") ?? 0;

		const htmlElement = document.querySelector("html");
		const wW = htmlElement?.clientWidth ?? window.innerWidth;
		const wH = htmlElement?.clientHeight ?? window.innerHeight;
		const { scrollLeft: sT, scrollTop: sL } = getWindowScroll();

		const top = o.top - sT;
		const left = o.left - sL;
		const m = 5;
		if (top - m < 0 || left - m < 0) return true;
		return top + bH + m > wH || left + bW + m > wW;
	}

	public speak(complete: () => void, text: string, hold: boolean) {
		this._hidden = false;
		this.show();
		const c = this._content;

		if (!c) return;

		// set height to auto
		c.style.height = "auto";
		c.style.width = "auto";

		// add the text
		c.innerHTML = text;

		// set height
		c.style.height = c.style.height || "";
		c.style.width = c.style.width || "";
		c.innerHTML = "";
		this.reposition();

		this._complete = complete;
		this._sayWords(text, hold, complete);
	}

	public show() {
		if (!this._balloon) return;
		if (this._hidden) return;
		this._balloon.removeAttribute("hidden");
	}

	public hide(fast?: boolean) {
		if (fast) {
			this._balloon?.setAttribute("hidden", "true");
			return;
		}

		this._hiding = window.setTimeout(
			this._finishHideBalloon.bind(this),
			CLOSE_BALLOON_DELAY,
		);
	}

	private _finishHideBalloon() {
		if (this._active) return;
		this._balloon?.setAttribute("hidden", "true");
		this._hidden = true;
		this._hiding = null;
	}

	private _sayWords(text: string, hold: boolean, complete: () => void) {
		this._active = true;
		this._hold = hold;
		const words = text.split(/[^\S-]/);
		const time = WORD_SPEAK_TIME;
		const el = this._content;
		let idx = 1;

		this._addWord = () => {
			if (!this._active) return;
			if (idx > words.length) {
				this._addWord = null;
				this._active = false;
				if (!this._hold) {
					complete();
					this.hide(false);
				}
			} else {
				if (el) el.innerHTML = words.slice(0, idx).join(" ");
				idx++;
				// @ts-ignore
				this._loop = window.setTimeout(this._addWord?.bind(this), time);
			}
		};

		this._addWord();
	}

	public close() {
		if (this._active) {
			this._hold = false;
		} else if (this._hold && this._complete) {
			this._complete();
		}
	}

	public pause() {
		if (this._loop) {
			window.clearTimeout(this._loop);
		}
		if (this._hiding) {
			window.clearTimeout(this._hiding);
			this._hiding = null;
		}
	}

	public resume() {
		if (this._addWord) {
			this._addWord();
		} else if (!this._hold && !this._hidden) {
			this._hiding = window.setTimeout(
				this._finishHideBalloon.bind(this),
				CLOSE_BALLOON_DELAY,
			);
		}
	}
}
