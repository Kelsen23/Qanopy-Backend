import type { CreditOperationType } from "../../../generated/prisma/client.js";

const makeCreditOperationKey = ({
  type,
  userId,
  questionId,
  version,
}: {
  type: CreditOperationType;
  userId: string;
  questionId: string;
  version: number;
}) => `${type}:${userId}:${questionId}:${version}`;

export default makeCreditOperationKey;
