/** Ignores a second submit while the first request is still in flight. */
export function createSubmitGuard() {
  let locked = false;
  return {
    tryBegin(): boolean {
      if (locked) return false;
      locked = true;
      return true;
    },
    end(): void {
      locked = false;
    },
  };
}
