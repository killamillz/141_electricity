import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/env.js";

// Users stay logged in this long before having to sign in again
export const TOKEN_LIFETIME = "7d";

export const generateToken = (userId: string) => {
  return jwt.sign({ userId }, JWT_SECRET, {
    expiresIn: TOKEN_LIFETIME,
  });
};
