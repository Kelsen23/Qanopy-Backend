import nodemailer from "nodemailer";
import dotenv from "dotenv";

import { nodemailerConfigSchema } from "../validations/config.schema.js";

dotenv.config();

const nodemailerConfig = nodemailerConfigSchema.parse(process.env);

const transporter = nodemailer.createTransport({
  host: nodemailerConfig.SMTP_HOST,
  port: 587,
  secure: false,
  auth: {
    user: nodemailerConfig.SENDER_EMAIL,
    pass: nodemailerConfig.SENDER_PASS,
  },
});

export default transporter;
