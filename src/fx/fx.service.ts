import { Injectable, Logger } from '@nestjs/common';

type FrankfurterLatest = {
  amount: number;
  base: string;
  date: string;
  rates: Record<string, number>;
};

/** ECB-aligned daily rates (Frankfurter), cached in-process ~1h. */
@Injectable()
export class FxService {
  private readonly log = new Logger(FxService.name);
  private cache: { fetchedAt: number; payload: { date: string; rates: Record<string, number> } } | null =
    null;
  private readonly ttlMs = 60 * 60 * 1000;

  async getEcbLatestFromEur(): Promise<{ date: string; rates: Record<string, number> }> {
    const now = Date.now();
    if (this.cache && now - this.cache.fetchedAt < this.ttlMs) {
      return this.cache.payload;
    }
    const res = await fetch('https://api.frankfurter.app/v1/latest?from=EUR');
    if (!res.ok) {
      this.log.warn(`Frankfurter HTTP ${res.status}`);
      throw new Error(`FX_HTTP_${res.status}`);
    }
    const data = (await res.json()) as FrankfurterLatest;
    const payload = { date: data.date, rates: data.rates };
    this.cache = { fetchedAt: now, payload };
    return payload;
  }
}
