const IS_DEV = import.meta.env.DEV;

type LogArgs = readonly unknown[];

export function devLog(...args: LogArgs): void {
  if (!IS_DEV) {
    return;
  }
  console.log(...args);
}

export function devInfo(...args: LogArgs): void {
  if (!IS_DEV) {
    return;
  }
  console.info(...args);
}

export function devDebug(...args: LogArgs): void {
  if (!IS_DEV) {
    return;
  }
  console.debug(...args);
}
