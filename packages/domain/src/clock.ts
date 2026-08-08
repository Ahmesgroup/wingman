export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class FakeClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return new Date(this.current.getTime());
  }

  advanceMs(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }

  set(date: Date): void {
    this.current = new Date(date.getTime());
  }
}

export function addMs(date: Date, ms: number): Date {
  return new Date(date.getTime() + ms);
}

export function toUtcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
