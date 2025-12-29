const express = require("express");
const crypto = require("crypto");
const createError = require("http-errors");
const { ObjectId } = require("mongodb");
const { getDb } = require("../services/mongoClient");
const config = require("../config");
const { toChineseIsoString } = require("../utils/time");

const router = express.Router();
const giftCardsCollectionName = config.mongoGiftCardsCollection;
const userRedeemCollectionName = config.mongoUserRedeemCollection;
const usersCollectionName = config.mongoUsersCollection;

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const giftCardsCollection = () => getDb().collection(giftCardsCollectionName);
const userRedeemsCollection = () =>
  getDb().collection(userRedeemCollectionName);
const usersCollection = () => getDb().collection(usersCollectionName);

const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const RAW_KEY_LENGTH = 15;
const SEGMENT_SIZE = 5;
const MAX_GENERATION_ATTEMPTS = 10;
const CARD_BODY_PATTERN = /^[A-Z0-9]+$/;
const STORAGE_EXTENSION_DAYS = 30;

const parsePositiveNumber = (value, fieldName) => {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw createError(400, `${fieldName} must be a positive number`);
  }

  return parsed;
};

const parseMetadata = (value) => {
  if (value == null) {
    return {};
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    throw createError(400, "metadata must be an object if provided");
  }

  return value;
};

const ensureObjectId = (value, fieldName) => {
  if (!value || !ObjectId.isValid(value)) {
    throw createError(400, `${fieldName} must be a valid identifier`);
  }

  return new ObjectId(value);
};

const computeStorageExpiryDate = () => {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + STORAGE_EXTENSION_DAYS);
  return toChineseIsoString(expiry);
};

const normalizeCardNumber = (value) => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw createError(400, "card_number is required");
  }

  const compact = value.replace(/[^0-9a-z]/gi, "").toUpperCase();

  if (compact.length !== RAW_KEY_LENGTH || !CARD_BODY_PATTERN.test(compact)) {
    throw createError(400, "card_number must be 15 letters or digits");
  }

  return formatKey(compact);
};

const formatKey = (raw) =>
  `${raw.slice(0, SEGMENT_SIZE)}-${raw.slice(
    SEGMENT_SIZE,
    SEGMENT_SIZE * 2
  )}-${raw.slice(SEGMENT_SIZE * 2)}`;

const createCardNumber = () => {
  let raw = "";

  while (raw.length < RAW_KEY_LENGTH) {
    const idx = crypto.randomInt(0, CHARSET.length);
    raw += CHARSET[idx];
  }

  return formatKey(raw);
};

const generateUniqueCardNumber = async () => {
  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
    const candidate = createCardNumber();
    const existing = await giftCardsCollection().findOne({
      card_number: candidate,
    });

    if (!existing) {
      return candidate;
    }
  }

  throw createError(500, "Failed to generate a unique card number");
};

const buildGiftCardDocument = (payload, cardNumber) => {
  const storage = parsePositiveNumber(payload.storage, "storage");
  const value = parsePositiveNumber(payload.value, "value");
  const metadata = parseMetadata(payload.metadata);
  const timestamp = toChineseIsoString();

  return {
    card_number: cardNumber,
    storage,
    value,
    used: false,
    used_by: null,
    metadata,
    created_at: timestamp,
    updated_at: timestamp,
  };
};

const toGiftCardResponse = (doc) => ({
  id: doc._id ? doc._id.toString() : null,
  card_number: doc.card_number,
  storage: doc.storage,
  value: doc.value,
  used: doc.used,
  used_by: doc.used_by
    ? {
        user_id:
          doc.used_by.user_id instanceof ObjectId
            ? doc.used_by.user_id.toString()
            : doc.used_by.user_id || null,
        email: doc.used_by.email || null,
      }
    : null,
  metadata: doc.metadata,
  created_at: doc.created_at,
  updated_at: doc.updated_at,
});

const toUserSummary = (doc) => ({
  id: doc._id.toString(),
  email: doc.email,
  storage_all: doc.storage_all,
  storage_used: doc.storage_used,
  storage_expired_at: doc.storage_expired_at,
});

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const cardNumber = await generateUniqueCardNumber();
    const document = buildGiftCardDocument(req.body || {}, cardNumber);
    const { insertedId } = await giftCardsCollection().insertOne(document);

    res.status(201).json({
      success: true,
      value: toGiftCardResponse({ ...document, _id: insertedId }),
    });
  })
);

router.post(
  "/redeem",
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    const userId = ensureObjectId(payload.user_id, "user_id");
    const cardNumber = normalizeCardNumber(payload.card_number);
    const storageExpiredAt = computeStorageExpiryDate();

    const user = await usersCollection().findOne({ _id: userId });

    if (!user) {
      throw createError(404, "User not found");
    }
    // switch to chinese date time zone string for consistency
    const nowIsoCn = toChineseIsoString();

    const giftCardResult = await giftCardsCollection().findOneAndUpdate(
      { card_number: cardNumber, used: false },
      {
        $set: {
          //used: true,
          used_by: {
            user_id: userId,
            email: user.email,
          },
          updated_at: nowIsoCn,
        },
      },
      { returnDocument: "after" }
    );

    if (!giftCardResult) {
      const existingCard = await giftCardsCollection().findOne({
        card_number: cardNumber,
        used: true,
      });

      if (!existingCard) {
        throw createError(404, "Gift card not found");
      }

      throw createError(409, "Gift card has already been redeemed");
    }

    const redeemDoc = {
      card_number: cardNumber,
      gift_card_id: giftCardResult._id,
      user_id: userId,
      user_email: user.email,
      user_snapshot: {
        email: user.email,
        storage_all: user.storage_all,
        storage_used: user.storage_used,
      },
      storage_allocated: giftCardResult.storage,
      storage_expired_at: storageExpiredAt,
      redeemed_at: nowIsoCn,
    };

    const { insertedId } = await userRedeemsCollection().insertOne(redeemDoc);

    const updatedStorageAll =
      giftCardResult.storage + user.storage_all - user.storage_used;

    const userUpdate = await usersCollection().findOneAndUpdate(
      { _id: userId },
      {
        $set: {
          storage_all: updatedStorageAll,
          storage_expired_at: storageExpiredAt,
          updated_at: toChineseIsoString(),
        },
      },
      { returnDocument: "after" }
    );

    res.json({
      success: true,
      value: {
        card: toGiftCardResponse(giftCardResult),
        redeem: {
          id: insertedId.toString(),
          card_number: redeemDoc.card_number,
          storage_allocated: redeemDoc.storage_allocated,
          storage_expired_at: redeemDoc.storage_expired_at,
          redeemed_at: redeemDoc.redeemed_at,
        },
        user: userUpdate.value ? toUserSummary(userUpdate.value) : null,
      },
    });
  })
);

module.exports = router;
