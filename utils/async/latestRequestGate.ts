export type LatestRequestGate = {
  next: () => number;
  isLatest: (requestId: number) => boolean;
};

export function createLatestRequestGate(): LatestRequestGate {
  let latestRequestId = 0;

  return {
    next: () => {
      latestRequestId += 1;
      return latestRequestId;
    },
    isLatest: (requestId) => requestId === latestRequestId,
  };
}
