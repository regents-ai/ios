import type { MessageThread, RegentSummary } from '@/types/regents';
import { resolvePrimaryRegent } from '@/utils/regentApi/primaryRegent';
import { resolveUrgentMessageThread } from '@/utils/regentApi/urgentMessageThread';

type DialTargetRefresherOptions = {
  loadRegents: () => Promise<RegentSummary[]>;
  loadThreads: () => Promise<MessageThread[]>;
  updatePrimaryRegent: (regent: RegentSummary | null) => void;
  updateUrgentThreadId: (threadId: string | null) => void;
};

export function createDialTargetRefresher({
  loadRegents,
  loadThreads,
  updatePrimaryRegent,
  updateUrgentThreadId,
}: DialTargetRefresherOptions) {
  let latestRequest = 0;

  return {
    async refresh() {
      const request = ++latestRequest;

      await Promise.all([
        loadRegents()
          .then((regents) => {
            if (request === latestRequest) {
              updatePrimaryRegent(resolvePrimaryRegent(regents));
            }
          })
          .catch(() => undefined),
        loadThreads()
          .then((threads) => {
            if (request === latestRequest) {
              updateUrgentThreadId(
                resolveUrgentMessageThread(threads)?.id ?? null
              );
            }
          })
          .catch(() => undefined),
      ]);
    },

    invalidate() {
      latestRequest += 1;
    },
  };
}
