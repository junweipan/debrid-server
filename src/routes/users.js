const express = require("express");
const createError = require("http-errors");
const { ObjectId } = require("mongodb");
const { getDb } = require("../services/mongoClient");
const config = require("../config");

const router = express.Router();
const collectionName = config.mongoUsersCollection;

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const usersCollection = () => getDb().collection(collectionName);

const normalizeEmail = (value) => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw createError(400, "Email is required");
  }

  const normalized = value.trim().toLowerCase();

  if (!normalized.includes("@") || normalized.startsWith("@")) {
    throw createError(400, "Email must be a valid address");
  }

  return normalized;
};

const parsePassword = (value) => {
  if (typeof value !== "string" || value.length < 6) {
    throw createError(400, "Password must be at least 6 characters long");
  }

  return value;
};

const parseNumberField = (value, fieldName) => {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw createError(400, `${fieldName} must be a positive number`);
  }

  return parsed;
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

const ensureObjectId = (value) => {
  if (!ObjectId.isValid(value)) {
    throw createError(400, "Invalid user id");
  }

  return new ObjectId(value);
};

const enforceStorageInvariant = (storageAll, storageUsed) => {
  if (storageUsed > storageAll) {
    throw createError(400, "storage_used cannot exceed storage_all");
  }
};

const createUserDocument = (payload) => {
  const email = normalizeEmail(payload.email);
  const password = parsePassword(payload.password);
  const storageAll = parseNumberField(payload.storage_all, "storage_all");
  const storageUsed = parseNumberField(payload.storage_used, "storage_used");

  enforceStorageInvariant(storageAll, storageUsed);

  const timestamp = new Date().toISOString();

  return {
    email,
    password,
    storage_all: storageAll,
    storage_used: storageUsed,
    deleted: parseBooleanField(payload.deleted, false),
    created_at: timestamp,
    updated_at: timestamp,
  };
};

const buildUpdateDocument = (payload, current) => {
  const updates = {};
  let nextStorageAll = current.storage_all;
  let nextStorageUsed = current.storage_used;

  if (Object.prototype.hasOwnProperty.call(payload, "email")) {
    updates.email = normalizeEmail(payload.email);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "password")) {
    updates.password = parsePassword(payload.password);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "storage_all")) {
    nextStorageAll = parseNumberField(payload.storage_all, "storage_all");
    updates.storage_all = nextStorageAll;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "storage_used")) {
    nextStorageUsed = parseNumberField(payload.storage_used, "storage_used");
    updates.storage_used = nextStorageUsed;
  }

  enforceStorageInvariant(nextStorageAll, nextStorageUsed);

  if (Object.prototype.hasOwnProperty.call(payload, "deleted")) {
    updates.deleted = parseBooleanField(payload.deleted, current.deleted);
  }

  if (Object.keys(updates).length === 0) {
    throw createError(400, "No valid fields provided for update");
  }

  updates.updated_at = new Date().toISOString();

  return updates;
};

const toUserResponse = (doc) => ({
  id: doc._id.toString(),
  email: doc.email,
  storage_all: doc.storage_all,
  storage_used: doc.storage_used,
  deleted: doc.deleted,
  created_at: doc.created_at,
  updated_at: doc.updated_at,
});

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const includeDeleted = parseBooleanField(req.query.includeDeleted, false);
    const filter = includeDeleted ? {} : { deleted: false };

    const users = await usersCollection()
      .find(filter)
      .sort({ created_at: -1 })
      .toArray();

    res.json({
      success: true,
      value: users.map(toUserResponse),
    });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = ensureObjectId(req.params.id);

    const user = await usersCollection().findOne({ _id: userId });

    if (!user) {
      throw createError(404, "User not found");
    }

    res.json({
      success: true,
      value: toUserResponse(user),
    });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const doc = createUserDocument(req.body || {});

    const existing = await usersCollection().findOne({ email: doc.email });

    if (existing) {
      throw createError(409, "A user with this email already exists");
    }

    const { insertedId } = await usersCollection().insertOne(doc);

    res.status(201).json({
      success: true,
      value: toUserResponse({ ...doc, _id: insertedId }),
    });
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = ensureObjectId(req.params.id);
    const current = await usersCollection().findOne({ _id: userId });

    if (!current) {
      throw createError(404, "User not found");
    }

    const updates = buildUpdateDocument(req.body || {}, current);

    const options = { returnDocument: "after" };
    const result = await usersCollection().findOneAndUpdate(
      { _id: userId },
      { $set: updates },
      options
    );

    res.json({
      success: true,
      value: toUserResponse(result.value),
    });
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = ensureObjectId(req.params.id);

    const result = await usersCollection().findOneAndUpdate(
      { _id: userId },
      {
        $set: {
          deleted: true,
          updated_at: new Date().toISOString(),
        },
      },
      { returnDocument: "after" }
    );

    if (!result.value) {
      throw createError(404, "User not found");
    }

    res.json({
      success: true,
      value: toUserResponse(result.value),
    });
  })
);

module.exports = router;
