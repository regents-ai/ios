export type ComposerSelection = {
  start: number;
  end: number;
};

export type ComposerEdit = {
  text: string;
  selection: ComposerSelection;
};

export type DictationDraftSession = {
  segmentStart: number;
  segmentEnd: number;
};

export type DictationTranscriptUpdate = {
  edit: ComposerEdit;
  session: DictationDraftSession;
};

export type MessageComposerAction = 'voice' | 'commands' | 'keyboard' | 'scanQr';

export type MessageComposerController = {
  appendText: (text: string) => void;
  openCommands: () => boolean;
  focus: () => void;
  startDictation: () => void;
  openQrScanner: () => void;
};

type MessageComposerEntry = {
  controller: MessageComposerController;
};

const controllerStack: MessageComposerEntry[] = [];

function activeController(): MessageComposerController | null {
  return controllerStack.at(-1)?.controller ?? null;
}

function normalizedSelection(text: string, selection?: ComposerSelection): ComposerSelection {
  const fallback = text.length;
  const start = Math.min(text.length, Math.max(0, selection?.start ?? fallback));
  const end = Math.min(text.length, Math.max(start, selection?.end ?? start));
  return { start, end };
}

export function insertComposerText(
  draft: string,
  insertedText: string,
  selection?: ComposerSelection
): ComposerEdit {
  const range = normalizedSelection(draft, selection);
  const cursor = range.start + insertedText.length;
  return {
    text: `${draft.slice(0, range.start)}${insertedText}${draft.slice(range.end)}`,
    selection: { start: cursor, end: cursor },
  };
}

export function beginDictationDraft(
  draft: string,
  selection?: ComposerSelection
): DictationDraftSession {
  const range = normalizedSelection(draft, selection);
  return {
    segmentStart: range.start,
    segmentEnd: range.end,
  };
}

export function applyDictationTranscript(
  draft: string,
  session: DictationDraftSession,
  transcript: string
): DictationTranscriptUpdate {
  const range = normalizedSelection(draft, {
    start: session.segmentStart,
    end: session.segmentEnd,
  });
  const cursor = range.start + transcript.length;
  return {
    edit: {
      text: `${draft.slice(0, range.start)}${transcript}${draft.slice(range.end)}`,
      selection: { start: cursor, end: cursor },
    },
    session: {
      segmentStart: range.start,
      segmentEnd: cursor,
    },
  };
}

export function registerMessageComposer(controller: MessageComposerController): () => void {
  const entry = { controller };
  controllerStack.push(entry);
  return () => {
    const index = controllerStack.indexOf(entry);
    if (index >= 0) {
      controllerStack.splice(index, 1);
    }
  };
}

export function captureMessageComposerController(): MessageComposerController | null {
  return activeController();
}

export function appendToMessageComposer(
  controller: MessageComposerController | null,
  text: string
): boolean {
  if (!controller || activeController() !== controller) {
    return false;
  }
  controller.appendText(text);
  return true;
}

export function runMessageComposerAction(action: MessageComposerAction): boolean {
  const controller = activeController();
  if (!controller) {
    return false;
  }

  switch (action) {
    case 'voice':
      controller.startDictation();
      break;
    case 'commands':
      return controller.openCommands();
    case 'keyboard':
      controller.focus();
      break;
    case 'scanQr':
      controller.openQrScanner();
      break;
  }
  return true;
}

export function resetMessageComposerBridgeForTest(): void {
  controllerStack.length = 0;
}
