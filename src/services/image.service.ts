import type { UploadApiResponse } from "cloudinary";
import { cloudinary } from "../config/cloudinary.js";
import { AppError } from "../utils/AppError.js";

// Receipts show the meter token, so they are stored as "authenticated"
// assets: a plain Cloudinary link won't open them, only a signed one.
const DELIVERY_TYPE = "authenticated";

// Every receipt is stored as a JPEG, so the download link always knows the format.
const FORMAT = "jpg";

const LINK_TTL_SECONDS = 5 * 60;

/** Uploads a receipt image and returns its Cloudinary public_id */
export const uploadReceiptImage = async (image: Buffer) => {
  try {
    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder: "receipts",
            type: DELIVERY_TYPE,
            resource_type: "image",
            format: FORMAT,
          },
          (error, response) =>
            error || !response ? reject(error) : resolve(response),
        )
        .end(image);
    });

    return result.public_id;
  } catch (error) {
    console.error("Receipt image upload failed:", error);
    throw new AppError(503, "Couldn't save the receipt image, please try again");
  }
};

/** Best-effort delete, e.g. when the payment it belonged to wasn't saved */
export const deleteReceiptImage = async (publicId: string) => {
  try {
    await cloudinary.uploader.destroy(publicId, {
      type: DELIVERY_TYPE,
      resource_type: "image",
      invalidate: true,
    });
  } catch (error) {
    console.error(`Couldn't delete receipt image ${publicId}:`, error);
  }
};

/** A signed link to the image that stops working after a few minutes */
export const receiptImageUrl = (publicId: string) => {
  const expiresAt = Math.floor(Date.now() / 1000) + LINK_TTL_SECONDS;

  return {
    url: cloudinary.utils.private_download_url(publicId, FORMAT, {
      type: DELIVERY_TYPE,
      resource_type: "image",
      expires_at: expiresAt,
    }),
    expiresAt: new Date(expiresAt * 1000),
  };
};
