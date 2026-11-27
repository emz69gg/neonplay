/* Tiny event bus for visual effects (win animations, coin bursts). */
export type FxEvent =
  | { type: 'win'; kind?: string }
  | { type: 'coins'; amount: number; kind?: string }
  /** try a cursor trail for a few seconds (shop preview) */
  | { type: 'trail'; kind: string };
type Fn = (e: FxEvent) => void;
const subs = new Set<Fn>();
export function onFx(fn: Fn) {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}
export function emitFx(e: FxEvent) {
  subs.forEach((fn) => fn(e));
}
