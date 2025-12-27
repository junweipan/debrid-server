const express = require("express");
const createError = require("http-errors");
const { ObjectId } = require("mongodb");
const { getDb } = require("../services/mongoClient");
const config = require("../config");

const router = express.Router();
const collectionName = config.mongoTransactionsCollection;

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const transactionsCollection = () => getDb().collection(collectionName);

const ensureObjectId = (value, fieldName = "id") => {
  if (value instanceof ObjectId) {
    return value;
  }

  if (!ObjectId.isValid(value)) {
    throw createError(400, `${fieldName} must be a valid id`);
  }

  return new ObjectId(value);
};

const normalizeEmail = (value, fieldName = "user_email") => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw createError(400, `${fieldName} is required`);
  }

  const normalized = value.trim().toLowerCase();

  if (!normalized.includes("@") || normalized.startsWith("@")) {
    throw createError(400, `${fieldName} must be a valid address`);
  }

  return normalized;
};

const parseNonEmptyString = (value, fieldName, { maxLength = 512 } = {}) => {
  if (typeof value !== "string") {
    throw createError(400, `${fieldName} must be a string`);
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    throw createError(400, `${fieldName} cannot be empty`);
  }

  if (maxLength && trimmed.length > maxLength) {
    throw createError(400, `${fieldName} is too long (>${maxLength} chars)`);
  }

  return trimmed;
};

const parseOptionalString = (
  value,
  fieldName,
  { fallback = null, maxLength = 256 } = {}
) => {
  if (value === undefined || value === null) {
    return fallback;
  }

  const normalized = String(value).trim();

  if (normalized.length === 0) {
    return fallback;
  }

  if (maxLength && normalized.length > maxLength) {
    throw createError(400, `${fieldName} is too long (>${maxLength} chars)`);
  }

  return normalized;
};

const parseOrderAmount = (value) => {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw createError(400, "order_amount must be a positive number");
  }

  return parsed;
};

const parseOrderDate = (value) => {
  if (!value) {
    throw createError(400, "order_date is required");
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw createError(400, "order_date must be a valid date");
  }

  return parsed.toISOString();
};

const parseMetadata = (value) => {
  if (value === undefined || value === null) {
    return {};
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    throw createError(400, "metadata must be an object");
  }

  return { ...value };
};

const parseBooleanField = (value, fallback = false) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    if (["true", "1"].includes(value.toLowerCase())) {
      return true;
    }

    if (["false", "0"].includes(value.toLowerCase())) {
      return false;
    }
  }

  if (value === 1) {
    return true;
  }

  if (value === 0) {
    return false;
  }

  return fallback;
};

const toTransactionResponse = (doc) => ({
  id: doc._id.toString(),
  user_id: doc.user_id.toString(),
  user_email: doc.user_email,
  order_amount: doc.order_amount,
  order_date: doc.order_date,
  order_key: doc.order_key,
  order_desc: doc.order_desc,
  status: doc.status,
  currency: doc.currency,
  payment_method: doc.payment_method,
  payment_reference: doc.payment_reference,
  metadata: doc.metadata || {},
  deleted: doc.deleted,
  created_at: doc.created_at,
  updated_at: doc.updated_at,
});

const createTransactionDocument = (payload = {}) => {
  const userId = ensureObjectId(payload.user_id, "user_id");
  const userEmail = normalizeEmail(payload.user_email);
  const orderAmount = parseOrderAmount(payload.order_amount);
  const orderDate = parseOrderDate(payload.order_date);
  const orderKey = parseNonEmptyString(payload.order_key, "order_key", {
    maxLength: 120,
  });
  const orderDesc = parseNonEmptyString(payload.order_desc, "order_desc", {
    maxLength: 1000,
  });
  const timestamp = new Date().toISOString();

  return {
    user_id: userId,
    user_email: userEmail,
    order_amount: orderAmount,
    order_date: orderDate,
    order_key: orderKey,
    order_desc: orderDesc,
    status: parseOptionalString(payload.status, "status", {
      fallback: "pending",
      maxLength: 60,
    }),
    currency: parseOptionalString(payload.currency, "currency", {
      fallback: "USD",
      maxLength: 10,
    }),
    payment_method: parseOptionalString(
      payload.payment_method,
      "payment_method",
      {
        fallback: null,
        maxLength: 60,
      }
    ),
    payment_reference: parseOptionalString(
      payload.payment_reference,
      "payment_reference",
      {
        fallback: null,
        maxLength: 120,
      }
    ),
    metadata: parseMetadata(payload.metadata), // capture custom transaction props
    deleted: false,
    created_at: timestamp,
    updated_at: timestamp,
  };
};

const buildUpdateDocument = (payload = {}) => {
  const updates = {};

  if (Object.prototype.hasOwnProperty.call(payload, "user_id")) {
    updates.user_id = ensureObjectId(payload.user_id, "user_id");
  }

  if (Object.prototype.hasOwnProperty.call(payload, "user_email")) {
    updates.user_email = normalizeEmail(payload.user_email);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "order_amount")) {
    updates.order_amount = parseOrderAmount(payload.order_amount);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "order_date")) {
    updates.order_date = parseOrderDate(payload.order_date);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "order_key")) {
    updates.order_key = parseNonEmptyString(payload.order_key, "order_key", {
      maxLength: 120,
    });
  }

  if (Object.prototype.hasOwnProperty.call(payload, "order_desc")) {
    updates.order_desc = parseNonEmptyString(payload.order_desc, "order_desc", {
      maxLength: 1000,
    });
  }

  ["status", "currency", "payment_method", "payment_reference"].forEach(
    (field) => {
      if (Object.prototype.hasOwnProperty.call(payload, field)) {
        updates[field] = parseOptionalString(payload[field], field, {
          fallback: null,
        });
      }
    }
  );

  if (Object.prototype.hasOwnProperty.call(payload, "metadata")) {
    updates.metadata = parseMetadata(payload.metadata);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "deleted")) {
    updates.deleted = parseBooleanField(payload.deleted, false);
  }

  if (Object.keys(updates).length === 0) {
    throw createError(400, "No valid fields provided for update");
  }

  updates.updated_at = new Date().toISOString();

  return updates;
};

const ensureUniqueOrderKey = async (orderKey, excludeId = null) => {
  if (!orderKey) {
    return;
  }

  const filter = { order_key: orderKey };

  if (excludeId) {
    filter._id = { $ne: excludeId };
  }

  const existing = await transactionsCollection().findOne(filter);

  if (existing) {
    throw createError(409, "A transaction with this order_key already exists");
  }
};

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const includeDeleted = parseBooleanField(req.query.includeDeleted, false);
    const filter = includeDeleted ? {} : { deleted: false };

    if (req.query.userId) {
      filter.user_id = ensureObjectId(req.query.userId, "userId");
    }

    if (req.query.userEmail) {
      filter.user_email = normalizeEmail(req.query.userEmail, "userEmail");
    }

    if (req.query.orderKey) {
      filter.order_key = parseNonEmptyString(req.query.orderKey, "orderKey", {
        maxLength: 120,
      });
    }

    if (Object.prototype.hasOwnProperty.call(req.query, "status")) {
      const status = parseOptionalString(req.query.status, "status", {
        fallback: undefined,
        maxLength: 60,
      });

      if (status !== undefined) {
        filter.status = status;
      }
    }

    const transactions = await transactionsCollection()
      .find(filter)
      .sort({ created_at: -1 })
      .toArray();

    res.json({
      success: true,
      value: transactions.map(toTransactionResponse),
    });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const transactionId = ensureObjectId(req.params.id);

    const transaction = await transactionsCollection().findOne({
      _id: transactionId,
    });

    if (!transaction) {
      throw createError(404, "Transaction not found");
    }

    res.json({
      success: true,
      value: toTransactionResponse(transaction),
    });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const doc = createTransactionDocument(req.body || {});

    await ensureUniqueOrderKey(doc.order_key);

    const { insertedId } = await transactionsCollection().insertOne(doc);

    res.status(201).json({
      success: true,
      value: toTransactionResponse({ ...doc, _id: insertedId }),
    });
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const transactionId = ensureObjectId(req.params.id);
    const current = await transactionsCollection().findOne({
      _id: transactionId,
    });

    if (!current) {
      throw createError(404, "Transaction not found");
    }

    const updates = buildUpdateDocument(req.body || {});

    if (updates.order_key && updates.order_key !== current.order_key) {
      await ensureUniqueOrderKey(updates.order_key, transactionId);
    }

    const result = await transactionsCollection().findOneAndUpdate(
      { _id: transactionId },
      { $set: updates },
      { returnDocument: "after" }
    );

    res.json({
      success: true,
      value: toTransactionResponse(result.value),
    });
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const transactionId = ensureObjectId(req.params.id);

    const result = await transactionsCollection().findOneAndUpdate(
      { _id: transactionId },
      {
        $set: {
          deleted: true,
          updated_at: new Date().toISOString(),
        },
      },
      { returnDocument: "after" }
    );

    if (!result.value) {
      throw createError(404, "Transaction not found");
    }

    res.json({
      success: true,
      value: toTransactionResponse(result.value),
    });
  })
);

module.exports = router;
