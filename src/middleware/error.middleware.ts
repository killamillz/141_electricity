import type { Request, Response, NextFunction } from "express";
import multer from "multer";
import { ZodError } from "zod";
import { Prisma } from "../generated/prisma/client.js";
import { AppError } from "../utils/AppError.js";

// Catches requests that matched no route. Register after all routes.
export const notFound = (req: Request, res: Response) => {
  return res.status(404).json({
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
};

// Central error handler. Express recognises it by its 4 arguments,
// so `next` must stay even though it is unused. Register last.
export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) => {
  // Errors we threw on purpose
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      message: err.message,
    });
  }

  // Request body failed validation
  if (err instanceof ZodError) {
    return res.status(400).json({
      message: "Invalid request",
      errors: err.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  // Upload problems, e.g. file too large
  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      message:
        err.code === "LIMIT_FILE_SIZE"
          ? "Receipt image must be 5 MB or smaller"
          : err.message,
    });
  }

  // Malformed JSON body (thrown by express.json())
  if (
    err instanceof SyntaxError &&
    "type" in err &&
    err.type === "entity.parse.failed"
  ) {
    return res.status(400).json({
      message: "Invalid JSON body",
    });
  }

  // Known database errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return res.status(409).json({
        message: "A record with that value already exists",
      });
    }

    if (err.code === "P2025") {
      return res.status(404).json({
        message: "Record not found",
      });
    }
  }

  // Anything else is a bug: log it, but don't leak details to the client
  console.error(err);
  return res.status(500).json({
    message: "Something went wrong",
  });
};
