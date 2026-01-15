import { OAuth2Client, TokenPayload } from "google-auth-library";

import HttpError from "./httpError.util.js";

import dotenv from "dotenv";
dotenv.config();

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

async function verifyGoogleToken(idToken: string): Promise<{
  email: string;
  name: string;
  picture: string;
  email_verified: boolean;
  googleId: string;
}> {
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (!payload) throw new HttpError("Invalid Google token payload", 400);

    const { email, name, picture, email_verified, sub } =
      payload as TokenPayload;

    if (!email || !name || !picture || !email_verified) {
      throw new HttpError("Google token missing required fields", 400);
    }

    return { email, name, picture, email_verified, googleId: sub };
  } catch (error) {
    console.error(error);
    throw new HttpError("Google ID token verification failed", 500);
  }
}

export default verifyGoogleToken;
