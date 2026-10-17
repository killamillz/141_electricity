import { v2 as cloudinary } from "cloudinary";

const required = [
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
] as const;

const missing = required.filter((name) => !process.env[name]);

if (missing.length > 0) {
  throw new Error(
    `${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} not defined in the environment variables`,
  );
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME as string,
  api_key: process.env.CLOUDINARY_API_KEY as string,
  api_secret: process.env.CLOUDINARY_API_SECRET as string,
  secure: true,
});

export { cloudinary };
