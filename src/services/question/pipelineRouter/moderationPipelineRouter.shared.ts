import { queueContentModerationRoute } from "../../../utils/question/pipelineRouting.util.js";

import type { NonQuestionContentPipelineRouterJob } from "../../../utils/question/contentPipelineRouter.shared.js";

type ModerationRoutableEntity = {
  _id: string;
  moderationStatus?: string | null;
  moderationRevision?: number | null;
};

type ModerationRoutableModel<T extends ModerationRoutableEntity> = {
  findById: (...args: any[]) => {
    select: (projection: string) => PromiseLike<T | null>;
  };
};

const routePendingModerationContent = async <
  T extends ModerationRoutableEntity,
>({
  contentType,
  contentId,
  moderationRevision,
  model,
  select,
}: {
  contentType: NonQuestionContentPipelineRouterJob["contentType"];
  contentId: string;
  moderationRevision?: number;
  model: ModerationRoutableModel<T>;
  select: string;
}) => {
  const foundEntity = await model.findById(contentId).select(select);

  if (
    !foundEntity ||
    foundEntity.moderationStatus !== "PENDING" ||
    (moderationRevision !== undefined &&
      foundEntity.moderationRevision !== moderationRevision)
  ) {
    return null;
  }

  await queueContentModerationRoute({
    contentType,
    contentId: String(foundEntity._id),
    moderationRevision:
      typeof foundEntity.moderationRevision === "number"
        ? foundEntity.moderationRevision
        : undefined,
  });

  return foundEntity;
};

export { routePendingModerationContent };
