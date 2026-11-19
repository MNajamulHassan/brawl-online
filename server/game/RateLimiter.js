/**
 * Token bucket. `capacity` tokens, refilled at `perSecond`.
 * take() returns false when the caller is over its budget.
 */
export class RateLimiter {
  constructor(capacity, perSecond, now = () => Date.now()) {
    this.capacity = capacity;
    this.perSecond = perSecond;
    this.tokens = capacity;
    this.now = now;
    this.last = now();
  }

  take(cost = 1) {
    const t = this.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((t - this.last) / 1000) * this.perSecond);
    this.last = t;
    if (this.tokens < cost) return false;
    this.tokens -= cost;
    return true;
  }
}
