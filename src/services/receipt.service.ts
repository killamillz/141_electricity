import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { AppError } from "../utils/AppError.js";

export const RECEIPT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

type ReceiptMimeType = (typeof RECEIPT_MIME_TYPES)[number];

const ReceiptSchema = z.object({
  isReceipt: z
    .boolean()
    .describe("true only if the image is an electricity purchase receipt"),
  amount: z
    .number()
    .nullable()
    .describe("Total amount paid in naira, as a plain number"),
  token: z
    .string()
    .nullable()
    .describe("The prepaid meter token, digits only, no spaces or dashes"),
  kilowattHours: z
    .number()
    .nullable()
    .describe("Units of electricity bought, in kWh, as a plain number"),
  purchasedAt: z
    .string()
    .nullable()
    .describe(
      "Transaction date and time as ISO 8601 with the +01:00 offset, " +
        "e.g. 2026-10-09T14:30:00+01:00, or just YYYY-MM-DD if no time is shown",
    ),
});

export type ScannedReceipt = Omit<z.infer<typeof ReceiptSchema>, "isReceipt">;

const SYSTEM_PROMPT = `You read photos of Nigerian prepaid electricity purchase receipts \
(from bank apps, POS slips, vendor SMS screenshots or distribution company receipts) \
and extract the purchase details.

- amount: the total amount the customer paid. If the receipt lists a total alongside \
items such as VAT, service charge or debt deductions, use the total paid.
- token: the electricity token the customer types into the meter, usually 20 digits, \
often printed in groups. Return the digits only.
- kilowattHours: the units bought, in kWh.
- purchasedAt: the transaction date. Receipts are in Nigerian time (UTC+01:00).

Set a field to null if it is missing, cut off or too blurry to read with confidence. \
Never guess a digit: a wrong token or amount is worse than an empty field, because \
the customer will fill in empty fields themselves. If the image is not an electricity \
receipt, set isReceipt to false and every other field to null.`;

let client: Anthropic | undefined;

// Created on first use, so the server still starts without an API key
// (only scanning is unavailable then).
const getClient = () => {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Receipt scan failed: ANTHROPIC_API_KEY is not set");
    throw new AppError(
      503,
      "Receipt scanning is unavailable, please enter the details manually",
    );
  }
  client ??= new Anthropic();
  return client;
};

export const scanReceipt = async (
  image: Buffer,
  mediaType: ReceiptMimeType,
): Promise<ScannedReceipt> => {
  const anthropic = getClient();
  let response;

  try {
    response = await anthropic.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      // Retries on another model if a safety check wrongly declines the request
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "medium",
        format: betaZodOutputFormat(ReceiptSchema),
      },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: image.toString("base64"),
              },
            },
            { type: "text", text: "Extract the details from this receipt." },
          ],
        },
      ],
    });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      throw new AppError(
        503,
        "Receipt scanning is busy, please try again or enter the details manually",
      );
    }
    if (error instanceof Anthropic.APIError) {
      console.error("Receipt scan failed:", error.status, error.message);
      throw new AppError(
        503,
        "Receipt scanning is unavailable, please enter the details manually",
      );
    }
    if (error instanceof Anthropic.AnthropicError) {
      // e.g. network failure reaching the API
      console.error("Receipt scan failed:", error.message);
      throw new AppError(
        503,
        "Receipt scanning is unavailable, please enter the details manually",
      );
    }
    throw error;
  }

  const result = response.parsed_output;

  if (response.stop_reason === "refusal" || !result) {
    throw new AppError(
      422,
      "Could not read this receipt, please enter the details manually",
    );
  }

  if (!result.isReceipt) {
    throw new AppError(422, "This image doesn't look like an electricity receipt");
  }

  return {
    amount: result.amount,
    token: result.token?.replace(/\D/g, "") || null,
    kilowattHours: result.kilowattHours,
    purchasedAt: result.purchasedAt,
  };
};
