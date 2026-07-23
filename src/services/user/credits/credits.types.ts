import type {
  CreditOperationType,
  CreditPeriodType,
} from "../../../generated/prisma/client.js";

type CreditCharge = {
  operationId: string;
  operationKey: string;
  type: CreditOperationType;
  amount: number;
  chargedNow: boolean;
};

type CreditPeriodLimit = {
  periodType: CreditPeriodType;
  limit: number;
};

export type { CreditCharge, CreditPeriodLimit };
