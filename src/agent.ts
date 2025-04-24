import Queue from "./queue";
import Animator from "./animator";
import Balloon from "./balloon";
import { AgentWrapper } from "./types";
import {
	Deferred,
	getHeight,
	getOffset,
	getWidth,
	getWindowScroll,
} from "./utils";

export interface AgentOptions {
	agent: AgentWrapper;
	selector?: string;
}

// Add a specific type for queue function
type QueueFn = (done: () => void) => void;

export default class Agent {
	private _queue: Queue;
	private readonly _el: HTMLElement;
	private _animator: Animator;
	private _balloon: Balloon;
	private _hidden = false;
	private _idleDfd?: Deferred;
	private _offset: { top: number; left: number } = { top: 0, left: 0 };
	private _dragUpdateLoop?: number;
	private _targetX?: number;
	private _targetY?: number;
	private _moveHandle?: (e: MouseEvent) => void;
	private _upHandle?: (e: MouseEvent) => void;

	constructor(options: AgentOptions) {
		const { agent, selector } = options;

		this._queue = new Queue(this._onQueueEmpty.bind(this));

		const el = document.createElement("div");
		el.className = "clippy";
		el.setAttribute("hidden", "true");
		this._el = el;

		const selectorEl = selector
			? document.getElementsByClassName(selector)[0]
			: undefined;
		(selectorEl || document.body).appendChild(this._el);

		const agentSounds: string[] = Object.values(
			options.agent.soundMp3 as unknown as Array<string>,
		);

		this._animator = new Animator(this._el, agent, agentSounds);
		this._balloon = new Balloon(this._el);
		this._setupEvents();
	}

	/***
	 *
	 * @param {Number} x
	 * @param {Number} y
	 */
	gestureAt(x: number, y: number) {
		const d = this._getDirection(x, y);
		const gAnim = `Gesture${d}`;
		const lookAnim = `Look${d}`;

		const animation = this.hasAnimation(gAnim) ? gAnim : lookAnim;
		return this.play(animation);
	}

	/***
	 *
	 * @param {Boolean=} fast
	 *
	 */
	hide(fast: boolean, callback: () => void) {
		this._hidden = true;
		this.stop();
		if (fast) {
			this._el.setAttribute("hidden", "true");
			this.stop();
			this.pause();
			if (callback) callback();
			return;
		}

		return this._playInternal("Hide", () => {
			this._el.setAttribute("hidden", "true");
			this.pause();
			if (callback) callback();
		});
	}

	moveTo(x: number, y: number, duration = 1000) {
		const dir = this._getDirection(x, y);
		const anim = `Move${dir}`;

		this._addToQueue((complete: () => void) => {
			// the simple case
			if (duration === 0) {
				this._el.style.top = `${y}px`;
				this._el.style.left = `${x}px`;
				this.reposition();
				complete();
				return;
			}

			// no animations
			if (!this.hasAnimation(anim)) {
				const endHandler = () => {
					this._el.removeEventListener("animationend", endHandler);
					complete();
				};
				this._el.addEventListener("animationend", endHandler);
				this._el.animate(
					{ top: y, left: x },
					{
						duration,
						iterations: 1,
					},
				);
				return;
			}

			const callback = (name: string, state: number) => {
				// when exited, complete
				if (state === Animator.States.EXITED) {
					complete();
				}
				// if waiting,
				if (state === Animator.States.WAITING) {
					const endHandler = () => {
						this._el.removeEventListener("animationend", endHandler);
						this._animator.exitAnimation();
					};
					this._el.addEventListener("animationend", endHandler);
					this._el.animate(
						{ top: `${y}px`, left: `${x}px` },
						{
							duration,
							iterations: 1,
						},
					);
				}
			};

			this._playInternal(anim, callback);
		}, this);
	}

	private _playInternal(
		animation: string,
		callback: (name: string, state: number) => void,
	) {
		// if we're inside an idle animation,
		if (this._isIdleAnimation() && this._idleDfd) {
			this._idleDfd.promise.then(() => {
				this._playInternal(animation, callback);
			});
		}

		this._animator.showAnimation(animation, callback);
	}

	play(
		animation: string,
		timeout = 5000,
		cb?: (name: string, state: number) => void,
	) {
		if (!this.hasAnimation(animation)) return false;

		this._addToQueue((complete: () => void) => {
			let completed = false;
			// handle callback
			const callback = (name: string, state: number) => {
				if (state === Animator.States.EXITED) {
					completed = true;
					if (cb) cb(name, state);
					complete();
				}
			};

			// if has timeout, register a timeout function
			if (timeout) {
				window.setTimeout(() => {
					if (completed) return;
					// exit after timeout
					this._animator.exitAnimation();
				}, timeout);
			}

			this._playInternal(animation, callback);
		}, this);

		return true;
	}

	/***
	 *
	 * @param {Boolean=} fast
	 */
	show(fast = true) {
		this._hidden = false;
		if (fast) {
			this._el.removeAttribute("hidden");
			this.resume();
			this._onQueueEmpty();
			return;
		}

		const cssTop = this._el.style.top;
		const cssLeft = this._el.style.left;
		if (cssTop === "auto" || !(cssLeft === "auto")) {
			const htmlElement = document.querySelector("html");
			const wW = htmlElement?.clientWidth ?? window.innerWidth;
			const wH = htmlElement?.clientHeight ?? window.innerHeight;
			const { scrollLeft: sT } = getWindowScroll();
			const left = wW * 0.8;
			const top = (wH + sT) * 0.8;
			this._el.style.top = `${top}px`;
			this._el.style.left = `${left}px`;
		}

		this.resume();
		return this.play("Show");
	}

	/***
	 *
	 * @param {String} text
	 */
	speak(text: string, hold = false) {
		this._addToQueue((complete: () => void) => {
			this._balloon.speak(complete, text, hold);
		}, this);
	}

	/***
	 * Close the current balloon
	 */
	closeBalloon() {
		this._balloon.hide();
	}

	delay(time: number) {
		const timeToUse = time || 250;

		this._addToQueue((complete: () => void) => {
			this._onQueueEmpty();
			window.setTimeout(complete, timeToUse);
		});
	}

	/***
	 * Skips the current animation
	 */
	stopCurrent() {
		this._animator.exitAnimation();
		this._balloon.close();
	}

	stop() {
		// clear the queue
		this._queue.clear();
		this._animator.exitAnimation();
		this._balloon.hide();
	}

	/***
	 *
	 * @param {String} name
	 * @returns {Boolean}
	 */
	hasAnimation(name: string) {
		return this._animator.hasAnimation(name);
	}

	/***
	 * Gets a list of animation names
	 *
	 * @return {Array.<string>}
	 */
	animations() {
		return this._animator.animations();
	}

	/***
	 * Play a random animation
	 * @return {Deferred}
	 */
	animate(): boolean {
		const animations = this.animations();
		const anim = animations[Math.floor(Math.random() * animations.length)];
		// skip idle animations
		if (anim.indexOf("Idle") === 0) {
			return this.animate();
		}
		return this.play(anim);
	}

	/**************************** Utils ************************************/

	/***
	 *
	 * @param {Number} x
	 * @param {Number} y
	 * @return {String}
	 * @private
	 */
	private _getDirection(x: number, y: number) {
		const offset = getOffset(this._el);
		const h = getHeight(this._el, "height") ?? 0;
		const w = getWidth(this._el, "width") ?? 0;

		const centerX = offset.left + w / 2;
		const centerY = offset.top + h / 2;

		const a = centerY - y;
		const b = centerX - x;

		const r = Math.round((180 * Math.atan2(a, b)) / Math.PI);

		// Left and Right are for the character, not the screen :-/
		if (-45 <= r && r < 45) return "Right";
		if (45 <= r && r < 135) return "Up";
		if ((135 <= r && r <= 180) || (-180 <= r && r < -135)) return "Left";
		if (-135 <= r && r < -45) return "Down";

		// sanity check
		return "Top";
	}

	/**************************** Queue and Idle handling ************************************/

	/***
	 * Handle empty queue.
	 * We need to transition the animation to an idle state
	 * @private
	 */
	private _onQueueEmpty() {
		if (this._hidden || this._isIdleAnimation()) return;
		const idleAnim = this._getIdleAnimation();
		this._idleDfd = new Deferred();

		this._animator.showAnimation(idleAnim, this._onIdleComplete.bind(this));
	}

	private _onIdleComplete(name: string, state: number) {
		if (state === Animator.States.EXITED) {
			this._idleDfd?.resolve(undefined);
		}
	}

	/***
	 * Is the current animation is Idle?
	 * @return {Boolean}
	 * @private
	 */
	private _isIdleAnimation() {
		const c = this._animator.currentAnimationName;
		return c && c.indexOf("Idle") === 0;
	}

	/**
	 * Gets a random Idle animation
	 * @return {String}
	 * @private
	 */
	private _getIdleAnimation() {
		const animations = this.animations();
		const r = [];
		for (let i = 0; i < animations.length; i++) {
			const a = animations[i];
			if (a.indexOf("Idle") === 0) {
				r.push(a);
			}
		}

		// pick one
		const idx = Math.floor(Math.random() * r.length);
		return r[idx];
	}

	/**************************** Events ************************************/

	private _setupEvents() {
		window.addEventListener("resize", this.reposition.bind(this));
		this._el.addEventListener("mousedown", this._onMouseDown.bind(this));
		this._el.addEventListener("dblclick", this._onDoubleClick.bind(this));
	}

	private _onDoubleClick() {
		if (!this.play("ClickedOn")) {
			this.animate();
		}
	}

	reposition() {
		if (!(this._el.getAttribute("hidden") === "true")) return;
		const o = getOffset(this._el);
		const bH = getHeight(this._el, "outer") ?? 0;
		const bW = getWidth(this._el, "outer") ?? 0;

		const htmlElement = document.querySelector("html");
		const wW = htmlElement?.clientWidth ?? window.innerWidth;
		const wH = htmlElement?.clientHeight ?? window.innerHeight;
		const { scrollLeft: sT, scrollTop: sL } = getWindowScroll();

		let top = o.top - sT;
		let left = o.left - sL;
		const m = 5;
		if (top - m < 0) {
			top = m;
		} else if (top + bH + m > wH) {
			top = wH - bH - m;
		}

		if (left - m < 0) {
			left = m;
		} else if (left + bW + m > wW) {
			left = wW - bW - m;
		}

		this._el.style.left = `${left}px`;
		this._el.style.top = `${top}px`;
		// reposition balloon
		this._balloon.reposition();
	}

	private _onMouseDown(e: MouseEvent) {
		e.preventDefault();
		this._startDrag(e);
	}

	/**************************** Drag ************************************/

	private _startDrag(e: MouseEvent) {
		// pause animations
		this.pause();
		this._balloon.hide(true);
		this._offset = this._calculateClickOffset(e);

		this._moveHandle = this._dragMove.bind(this);
		this._upHandle = this._finishDrag.bind(this);

		window.addEventListener("mousemove", this._moveHandle);
		window.addEventListener("mouseup", this._upHandle);

		this._dragUpdateLoop = window.setTimeout(
			this._updateLocation.bind(this),
			10,
		);
	}

	private _calculateClickOffset(e: MouseEvent) {
		const mouseX = e.pageX;
		const mouseY = e.pageY;
		const o = getOffset(this._el);
		return {
			top: mouseY - o.top,
			left: mouseX - o.left,
		};
	}

	private _updateLocation() {
		this._el.style.top = `${this._targetY || 0}px`;
		this._el.style.left = `${this._targetX || 0}px`;
		this._dragUpdateLoop = window.setTimeout(
			this._updateLocation.bind(this),
			10,
		);
	}

	private _dragMove(e: MouseEvent) {
		e.preventDefault();
		const x = e.clientX - this._offset.left;
		const y = e.clientY - this._offset.top;
		this._targetX = x;
		this._targetY = y;
	}

	private _finishDrag() {
		window.clearTimeout(this._dragUpdateLoop);
		// remove handles
		if (this._moveHandle) {
			window.removeEventListener("mousemove", this._moveHandle);
		}
		if (this._upHandle) {
			window.removeEventListener("mouseup", this._upHandle);
		}
		// resume animations
		this._balloon.show();
		this.reposition();
		this.resume();
	}

	private _addToQueue(func: QueueFn, scope?: unknown) {
		const boundFunc = scope ? func.bind(scope) : func;
		this._queue.queue(boundFunc);
	}

	/**************************** Pause and Resume ************************************/

	pause() {
		this._animator.pause();
		this._balloon.pause();
	}

	resume() {
		this._animator.resume();
		this._balloon.resume();
	}
}
