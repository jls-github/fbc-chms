import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

// Rails' has_secure_password also used bcrypt, so imported digests keep working.
export const hashPassword = (password: string) => bcrypt.hash(password, 12);
export const verifyPassword = (password: string, digest: string) => bcrypt.compare(password, digest);

export const newToken = () => randomBytes(32).toString("base64url");
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

let dummy: Promise<string> | undefined;
/** A real digest to compare against when the user doesn't exist (constant-ish timing). */
export const dummyDigest = () => (dummy ??= hashPassword(newToken()));
