import dotenv from "dotenv";

import { PrismaClient } from "../generated/prisma/index.js";

import { prismaConfigSchema } from "../validations/config.schema.js";

dotenv.config();

prismaConfigSchema.parse(process.env);

const prisma = new PrismaClient();

export default prisma;
