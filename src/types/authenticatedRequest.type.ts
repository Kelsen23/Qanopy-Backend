import { Request } from "express";

import type { CreditCharge } from "../services/user/credits/credits.types.js";

interface AuthenticatedRequest extends Request {
  cookies: {
    token?: string;
  };
  user?: any;
  creditCharge?: CreditCharge;
}

export default AuthenticatedRequest;
