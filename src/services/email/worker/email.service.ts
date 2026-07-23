import shouldSkipForPurpose, {
  type EmailJobPurpose,
} from "../shouldSkipForPurpose.service.js";
import { getFlattenedUserById } from "../../user/userData.service.js";

import transporter from "../../../config/nodemailer.config.js";

type EmailJobData = {
  email: string;
  subject: string;
  htmlContent: string;
  userId?: string;
  purpose?: EmailJobPurpose;
  otpHash?: string;
};

const processEmailJob = async (jobData: EmailJobData) => {
  const { email, subject, htmlContent, userId, purpose, otpHash } = jobData;

  if (purpose === "BAN_TEMP" || purpose === "BAN_PERM") {
    await transporter.sendMail({
      from: `'Qanopy' <${process.env.QANOPY_EMAIL}>`,
      to: email,
      subject,
      html: htmlContent,
    });

    return;
  }

  if (userId) {
    const user = await getFlattenedUserById(userId);

    if (!user) return;

    if (await shouldSkipForPurpose(user, purpose, email, otpHash)) return;
  }

  await transporter.sendMail({
    from: `'Qanopy' <${process.env.QANOPY_EMAIL}>`,
    to: email,
    subject,
    html: htmlContent,
  });
};

export default processEmailJob;
