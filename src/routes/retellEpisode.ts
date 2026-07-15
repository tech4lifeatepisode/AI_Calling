import type { Request, Response } from "express";
import {
  checkRoomAvailability,
  getRoomPricing,
  listSelectableRooms,
} from "../services/episodeRoomBooking.js";
import { parseRetellPayload } from "../services/retellAuth.js";

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function num(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.length > 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export async function listSelectableRoomsHandler(
  req: Request,
  res: Response
): Promise<void> {
  const { args, sessionId, hubspotDealId, hubspotContactId } = parseRetellPayload(
    req.body
  );

  const checkIn = str(args.checkIn);
  const checkOut = str(args.checkOut);

  if (!checkIn || !checkOut) {
    res.status(400).json({ ok: false, error: "checkIn and checkOut are required" });
    return;
  }

  const result = await listSelectableRooms({
    checkIn,
    checkOut,
    sessionId,
    hubspotDealId,
    hubspotContactId,
    requestSource: "retell",
  });

  res.json(result);
}

export async function checkAvailabilityHandler(
  req: Request,
  res: Response
): Promise<void> {
  const { args, sessionId, hubspotDealId, hubspotContactId } = parseRetellPayload(
    req.body
  );

  const unitTypeSlug = str(args.unitTypeSlug);
  const checkIn = str(args.checkIn);
  const checkOut = str(args.checkOut);

  if (!unitTypeSlug || !checkIn || !checkOut) {
    res.status(400).json({
      ok: false,
      error: "unitTypeSlug, checkIn, and checkOut are required",
    });
    return;
  }

  const result = await checkRoomAvailability({
    unitTypeSlug,
    checkIn,
    checkOut,
    sessionId,
    hubspotDealId,
    hubspotContactId,
    requestSource: "retell",
  });

  res.json(result);
}

export async function getPricingHandler(req: Request, res: Response): Promise<void> {
  const { args, sessionId, hubspotDealId, hubspotContactId } = parseRetellPayload(
    req.body
  );

  const unitTypeSlug = str(args.unitTypeSlug);
  const checkIn = str(args.checkIn);
  const checkOut = str(args.checkOut);
  const people = num(args.people) ?? 1;

  if (!unitTypeSlug || !checkIn || !checkOut) {
    res.status(400).json({
      ok: false,
      error: "unitTypeSlug, checkIn, checkOut, and people are required",
    });
    return;
  }

  const result = await getRoomPricing({
    unitTypeSlug,
    checkIn,
    checkOut,
    people,
    promoCode: str(args.promoCode),
    paymentOption: str(args.paymentOption),
    sessionId,
    hubspotDealId,
    hubspotContactId,
    requestSource: "retell",
  });

  res.json(result);
}
