type QueueFn = (done: () => void) => void;

export default class Queue {
	private _queue: QueueFn[];
	private _onEmptyCallback: () => void;
	private _active = false;

	constructor(onEmptyCallback: () => void) {
		this._queue = [];
		this._onEmptyCallback = onEmptyCallback;
	}

	/***
	 *
	 * @param {function(Function)} func
	 * @returns {jQuery.Deferred}
	 */
	public queue(func: QueueFn): void {
		this._queue.push(func);

		if (this._queue.length === 1 && !this._active) {
			this._progressQueue();
		}
	}

	private _progressQueue() {
		// stop if nothing left in queue
		if (!this._queue.length) {
			this._onEmptyCallback();
			return;
		}

		const f = this._queue.shift();
		this._active = true;

		// execute function
		const completeFunction = this.next.bind(this);
		if (f) f(completeFunction);
	}

	public clear() {
		this._queue = [];
	}

	public next() {
		this._active = false;
		this._progressQueue();
	}
}
