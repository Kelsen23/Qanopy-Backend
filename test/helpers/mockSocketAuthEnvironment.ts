import { vi } from "vitest";

const initSocketEmitSubscriber = vi.fn();
const initSocketDisconnectSubscriber = vi.fn();
const initEditSessionListener = vi.fn();
const initAiAnswerSessionListener = vi.fn();
const initQuestionSessionListener = vi.fn();

const initializeSocketUserSession = vi.fn(async () => undefined);
const removeUserSocket = vi.fn(async () => 1);

export const mockSocketAuthModules = {
  socketEmitSubscriber: {
    default: initSocketEmitSubscriber,
  },
  socketDisconnectSubscriber: {
    default: initSocketDisconnectSubscriber,
  },
  editSessionListener: {
    default: initEditSessionListener,
  },
  aiAnswerSessionListener: {
    default: initAiAnswerSessionListener,
  },
  questionSessionListener: {
    default: initQuestionSessionListener,
  },
  initializeSocketUserSession: {
    default: initializeSocketUserSession,
  },
  presenceService: {
    removeUserSocket,
  },
};

export const resetSocketAuthEnvironment = () => {
  initSocketEmitSubscriber.mockClear();
  initSocketDisconnectSubscriber.mockClear();
  initEditSessionListener.mockClear();
  initAiAnswerSessionListener.mockClear();
  initQuestionSessionListener.mockClear();
  initializeSocketUserSession.mockClear();
  removeUserSocket.mockClear();
};

export {
  initAiAnswerSessionListener,
  initEditSessionListener,
  initQuestionSessionListener,
  initSocketDisconnectSubscriber,
  initSocketEmitSubscriber,
  initializeSocketUserSession,
  removeUserSocket,
};
