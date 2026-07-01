import crypto from "crypto";

import { cloudfrontDomain } from "../../../config/s3.config.js";
import { getRedisCacheClient } from "../../../config/redis.config.js";

import { makeJobId } from "../../../utils/job/makeJobId.util.js";
import getObjectKeyFromUrl from "../../../utils/media/getObjectKeyFromUrl.util.js";
import moveS3Object from "../../../utils/media/moveS3Object.util.js";
import publishSocketEvent from "../../../utils/socket/publishSocketEvent.util.js";

import Question from "../../../models/question.model.js";
import Answer from "../../../models/answer.model.js";

import contentPipelineRouter from "../../../queues/contentPipelineRouter.queue.js";
import questionVersioningQueue from "../../../queues/questionVersioning.queue.js";

type ContentFinalizeJobData = {
  userId: string;
  entityId: string;
  version?: number;
  basedOnVersion?: number;
  title?: string;
  body?: string;
  tags?: string[];
  moderationStatus?: string;
  moderationUpdatedAt?: Date | null;
  topicStatus?: string;
  embeddingStatus?: string;
};

const processContentFinalizeJob = async (
  jobName: string,
  data: ContentFinalizeJobData,
) => {
  const {
    userId,
    entityId,
    version,
    basedOnVersion,
    title,
    body,
    tags,
    moderationStatus,
    moderationUpdatedAt,
    topicStatus,
    embeddingStatus,
  } = data;

  let entity;
  if (jobName === "QUESTION") {
    entity = await Question.findById(entityId).select(
      "body currentVersion userId title tags moderationStatus moderationUpdatedAt topicStatus embeddingStatus",
    );
  } else if (jobName === "ANSWER") {
    entity = await Answer.findById(entityId).select("body");
  } else {
    throw new Error("Invalid job type");
  }

  if (!entity) throw new Error("Content not found");

  let newBody =
    jobName === "QUESTION" ? String(body ?? "") : (entity.body as string);

  const domainWithoutProtocol = String(cloudfrontDomain)
    .replace(/^https?:\/\//, "")
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const tempImageRegex = new RegExp(
    `!\\[[^\\]]*\\]\\((https?:\\/\\/${domainWithoutProtocol}/temp/content/${userId}/[a-zA-Z0-9/_\\-]+\\.png)\\)`,
    "gi",
  );

  const markdownReplacements = new Map<string, string>();
  const tempImageUrls: string[] = [];

  let match: RegExpExecArray | null;
  while ((match = tempImageRegex.exec(newBody)) !== null) {
    tempImageUrls.push(match[1]);
  }

  const imageLimit = 10;
  if (tempImageUrls.length > imageLimit) {
    await publishSocketEvent(
      userId,
      `Your freshly created ${jobName.toLowerCase()} exceeds the image limit of ${imageLimit}. Some temporary images may soon be removed. Please reduce image count.`,
      { entityId, entityType: jobName },
    );
  }

  const urlsToProcess = tempImageUrls.slice(0, imageLimit);

  for (const url of urlsToProcess) {
    const fullMarkdownMatch = newBody.match(
      new RegExp(
        `!\\[[^\\]]*\\]\\(${url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)`,
      ),
    )?.[0];

    if (!fullMarkdownMatch) continue;

    const fromKey = getObjectKeyFromUrl(url);
    if (!fromKey) continue;

    const newKey = `content/${jobName.toLowerCase()}s/${userId}/${entityId}/${crypto.randomUUID()}.png`;

    await moveS3Object(fromKey, newKey);

    const newUrl = `${cloudfrontDomain}/${newKey}`;
    markdownReplacements.set(
      fullMarkdownMatch,
      fullMarkdownMatch.replace(url, newUrl),
    );
  }

  for (const [oldMarkdown, newMarkdown] of markdownReplacements) {
    newBody = newBody.replaceAll(oldMarkdown, newMarkdown);
  }

  if (jobName !== "QUESTION" && newBody !== entity.body) {
    entity.body = newBody;
    await entity.save();
  }

  if (jobName === "QUESTION") {
    if (
      Number((entity as { currentVersion?: number }).currentVersion) ===
        Number(version) &&
      newBody !== entity.body
    ) {
      entity.body = newBody;
      await entity.save();
    }

    await getRedisCacheClient().del(`question:${entity._id}`);

    await questionVersioningQueue.add(
      "CREATE_NEW_QUESTION_VERSION",
      {
        questionId: entity._id,
        intendedVersion: version,
        basedOnVersion,
        userId,
        title,
        body: newBody,
        tags,
        moderationStatus,
        moderationUpdatedAt,
        topicStatus,
        embeddingStatus,
      },
      {
        removeOnComplete: true,
        removeOnFail: false,
        jobId: makeJobId(
          "questionVersioning",
          "CREATE_NEW_QUESTION_VERSION",
          entity._id,
          version,
        ),
      },
    );
  } else {
    await contentPipelineRouter.add("ANSWER", { contentId: entityId });
  }
};

export default processContentFinalizeJob;
