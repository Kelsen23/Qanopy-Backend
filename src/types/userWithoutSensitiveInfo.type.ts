import { Role, Status, Interest } from "../generated/prisma/index.js";

interface Achievement {
  id: string;
  userId: string;
  name: string;
  description: string;
  createdAt: string;
}

interface UserWithoutSensitiveInfo {
  id: string;
  username: string;
  email: string;
  profilePictureUrl?: string;
  bio?: string;
  interests: Interest[];
  reputationPoints: number;
  role: Role;
  questionsAsked: number;
  answersGiven: number;
  bestAnswers: number;
  achievements: Achievement[];
  status: Status;
  createdAt: string;
}

export default UserWithoutSensitiveInfo;
