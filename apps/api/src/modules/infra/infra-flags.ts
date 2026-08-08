let skipHydrate = false;

export function setSkipProtocolHydrate(value: boolean): void {
  skipHydrate = value;
}

export function shouldSkipProtocolHydrate(): boolean {
  return skipHydrate || process.env.PROTOCOL_HYDRATE === "false";
}
