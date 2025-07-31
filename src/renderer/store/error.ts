import { reactive, UnwrapNestedRefs } from "vue";

export type ErrorEntry = {
  message: string;
  count: number;
};

export class ErrorStore {
  private errorCounts: { [key: string]: number } = {};

  get errors(): ErrorEntry[] {
    return Object.entries(this.errorCounts)
      .sort(([a], [b]) => {
        return a < b ? -1 : a > b ? 1 : 0;
      })
      .map(([message, count]) => {
        return {
          message,
          count,
        };
      });
  }

  get hasError(): boolean {
    return !!Object.keys(this.errorCounts).length;
  }

  add(e: unknown): void {
    if (e instanceof AggregateError) {
      for (const error of e.errors) {
        this.add(error);
      }
      return;
    }
    let message = e instanceof Error ? e.message || e.name : "" + e;
    message = message.replace(/Error invoking remote method '[^']*': Error: /, "");
    const count = this.errorCounts[message] || 0;
    this.errorCounts[message] = count + 1;
  }

  clear(): void {
    this.errorCounts = {};
  }
}

export function createErrorStore(): UnwrapNestedRefs<ErrorStore> {
  return reactive(new ErrorStore());
}

let store: UnwrapNestedRefs<ErrorStore>;

export function useErrorStore(): UnwrapNestedRefs<ErrorStore> {
  if (!store) {
    store = createErrorStore();
  }
  return store;
}
