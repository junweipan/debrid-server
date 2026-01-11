const crypto = require("crypto");
const express = require("express");
const createError = require("http-errors");
const jwt = require("jsonwebtoken");
const { ObjectId } = require("mongodb");
const { getDb } = require("../services/mongoClient");
const config = require("../config");
const { toChineseIsoString } = require("../utils/time");
const {
  sendPasswordResetEmail,
  sendEmailVerificationEmail,
} = require("../services/mailerSend");
const e = require("express");

const router = express.Router();
const collectionName = config.mongoUsersCollection;
const PASSWORD_RESET_TOKEN_BYTES = 32;
const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const EMAIL_VERIFICATION_TOKEN_BYTES = 32;
const EMAIL_VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const usersCollection = () => getDb().collection(collectionName);
const verifyEmailCollection = () =>
  getDb().collection(config.mongoVerifyEmailCollection);

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

const parseResetToken = (value) => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw createError(400, "Reset token is required");
  }

  return value.trim();
};

const parseVerificationToken = (value) => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw createError(400, "Verification token is required");
  }

  return value.trim();
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

const parseNullableDateField = (value, fieldName) => {
  if (value == null || value === "") {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw createError(400, `${fieldName} must be a valid date string`);
  }

  return toChineseIsoString(parsed);
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

const requireJwtSecret = () => {
  if (!config.jwtSecret) {
    throw createError(500, "JWT secret is not configured");
  }

  return config.jwtSecret;
};

const generateAuthToken = (doc) => {
  const payload = {
    sub: doc._id.toString(),
    email: doc.email,
  };

  const options = {};

  if (config.jwtExpiresIn) {
    options.expiresIn = config.jwtExpiresIn;
  }

  return jwt.sign(payload, requireJwtSecret(), options);
};

const persistUserToken = async (userId, token) => {
  if (typeof token !== "string" || token.length === 0) {
    throw createError(500, "Failed to generate token");
  }

  const normalizedId =
    userId instanceof ObjectId ? userId : ensureObjectId(userId);

  const result = await usersCollection().updateOne(
    { _id: normalizedId },
    { $set: { token } }
  );

  if (result.matchedCount === 0) {
    throw createError(404, "User not found");
  }

  return token;
};

const issueAuthTokenForUser = async (doc) => {
  if (!doc?._id) {
    throw createError(500, "Unable to issue token for user");
  }

  const token = generateAuthToken(doc);
  await persistUserToken(doc._id, token);
  return token;
};

const recordLastLoginTimestamp = async (doc) => {
  if (!doc?._id) {
    throw createError(500, "Unable to update last login timestamp");
  }

  const timestamp = toChineseIsoString();

  await usersCollection().updateOne(
    { _id: doc._id },
    { $set: { last_login_at: timestamp } }
  );

  return {
    ...doc,
    last_login_at: timestamp,
  };
};

const generatePasswordResetToken = () =>
  crypto.randomBytes(PASSWORD_RESET_TOKEN_BYTES).toString("hex");

const persistPasswordResetToken = async (userId) => {
  const token = generatePasswordResetToken();
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS);
  const timestamp = toChineseIsoString();

  await usersCollection().updateOne(
    { _id: userId },
    {
      $set: {
        password_reset_token: token,
        password_reset_token_expires_at: toChineseIsoString(expiresAt),
        updated_at: timestamp,
      },
    }
  );

  return token;
};

const clearPasswordResetToken = async (userId) => {
  const timestamp = toChineseIsoString();

  await usersCollection().updateOne(
    { _id: userId },
    {
      $set: { updated_at: timestamp },
      $unset: {
        password_reset_token: "",
        password_reset_token_expires_at: "",
      },
    }
  );
};

const generateEmailVerificationToken = () =>
  crypto.randomBytes(EMAIL_VERIFICATION_TOKEN_BYTES).toString("hex");

const persistEmailVerificationRequest = async (userId, email) => {
  const normalizedUserId =
    userId instanceof ObjectId ? userId : ensureObjectId(userId);
  const token = generateEmailVerificationToken();
  const expiresAt = new Date(
    toChineseIsoString(new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_TTL_MS))
  );
  const now = new Date(toChineseIsoString());

  await verifyEmailCollection().deleteMany({ user_id: normalizedUserId });

  await verifyEmailCollection().insertOne({
    user_id: normalizedUserId,
    email,
    token,
    expires_at: expiresAt,
    created_at: now,
    used_at: null,
  });

  return token;
};

const consumeEmailVerificationToken = async (token) => {
  const record = await verifyEmailCollection().findOne({token});

  if (!record) {
    throw createError(400, "Invalid or expired verification token");
  }

  const expiration =
    record.expires_at instanceof Date ? record.expires_at : null;
  const now = new Date(toChineseIsoString());

  if (!expiration || Number.isNaN(expiration.getTime()) || expiration <= now) {
    await verifyEmailCollection().deleteOne({ _id: record._id });
    throw createError(400, "Invalid or expired verification token");
  }

  const userId =
    record.user_id instanceof ObjectId
      ? record.user_id
      : ensureObjectId(record.user_id);

  const user = await usersCollection().findOne({
    _id: userId,
    email: record.email
  });

  if (!user) {
    await verifyEmailCollection().deleteOne({ _id: record._id });
    throw createError(400, "Invalid verification request");
  }

  const result = await verifyEmailCollection().findOneAndUpdate(
    { _id: record._id},
    {
      $set: {
        used_at: now,
      },
    },
    { returnDocument: "after" }
  );

  if (!result) {
    throw createError(400, "Invalid or expired verification token");
  }

  return { user, email: record.email };
};

const extractBearerToken = (authorizationHeader) => {
  if (typeof authorizationHeader !== "string") {
    throw createError(401, "Authorization token is required");
  }

  const [scheme, token] = authorizationHeader.trim().split(/\s+/);

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    throw createError(401, "Authorization token is required");
  }

  return token;
};

const authenticateRequest = asyncHandler(async (req, _res, next) => {
  let payload;

  try {
    const token = extractBearerToken(req.headers.authorization);
    payload = jwt.verify(token, requireJwtSecret());
  } catch (error) {
    throw createError(401, "Invalid token");
  }

  if (!payload?.sub || !ObjectId.isValid(payload.sub)) {
    throw createError(401, "Invalid token");
  }

  const user = await usersCollection().findOne({
    _id: new ObjectId(payload.sub),
    deleted: false,
  });

  if (!user) {
    throw createError(401, "Invalid token");
  }

  req.authUser = user;
  next();
});

const isAdmin = (user) => (user?.role || "standard") === "admin";

const ensureAdmin = (currentUser) => {
  if (!isAdmin(currentUser)) {
    throw createError(403, "Forbidden");
  }
};

const ensureSelfAccess = (requestedUserId, currentUser) => {
  if (!currentUser?._id) {
    throw createError(401, "Invalid token");
  }

  if (isAdmin(currentUser)) {
    return;
  }

  if (!currentUser._id.equals(requestedUserId)) {
    throw createError(403, "Forbidden");
  }
};

const createUserDocument = (payload) => {
  const email = normalizeEmail(payload.email);
  const password = parsePassword(payload.password);
  const storageAll = parseNumberField(
    Object.prototype.hasOwnProperty.call(payload, "storage_all")
      ? payload.storage_all
      : 0,
    "storage_all"
  );
  const storageUsed = parseNumberField(
    Object.prototype.hasOwnProperty.call(payload, "storage_used")
      ? payload.storage_used
      : 0,
    "storage_used"
  );
  const role =
    typeof payload.role === "string" && payload.role.trim().length > 0
      ? payload.role.trim()
      : "standard";

  enforceStorageInvariant(storageAll, storageUsed);

  const timestamp = toChineseIsoString();
  const emailVerified = parseBooleanField(payload.email_verified, false);
  let emailVerifiedAt = null;

  if (emailVerified) {
    if (Object.prototype.hasOwnProperty.call(payload, "email_verified_at")) {
      emailVerifiedAt = parseNullableDateField(
        payload.email_verified_at,
        "email_verified_at"
      );
    }

    if (!emailVerifiedAt) {
      emailVerifiedAt = timestamp;
    }
  }

  return {
    email,
    password,
    storage_all: storageAll,
    storage_used: storageUsed,
    storage_expired_at: toChineseIsoString(
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    ), // Default to 7 days from now
    deleted: parseBooleanField(payload.deleted, false),
    role,
    created_at: timestamp,
    updated_at: timestamp,
    token: null,
    last_login_at: null,
    password_reset_token: null,
    password_reset_token_expires_at: null,
    email_verified: emailVerified,
    email_verified_at: emailVerified ? emailVerifiedAt : null,
  };
};

const buildUpdateDocument = (payload, current) => {
  const updates = {};
  let nextStorageAll = current.storage_all;
  let nextStorageUsed = current.storage_used;
  let nextRole = current.role || "standard";

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

  if (Object.prototype.hasOwnProperty.call(payload, "storage_expired_at")) {
    updates.storage_expired_at = parseNullableDateField(
      payload.storage_expired_at,
      "storage_expired_at"
    );
  }

  if (Object.prototype.hasOwnProperty.call(payload, "deleted")) {
    updates.deleted = parseBooleanField(payload.deleted, current.deleted);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "role")) {
    if (typeof payload.role !== "string" || payload.role.trim().length === 0) {
      throw createError(400, "role must be a non-empty string");
    }

    nextRole = payload.role.trim();
    updates.role = nextRole;
  }

  if (Object.keys(updates).length === 0) {
    throw createError(400, "No valid fields provided for update");
  }

  updates.updated_at = toChineseIsoString();

  return updates;
};

const insertUser = async (payload = {}) => {
  const doc = createUserDocument(payload);

  const existing = await usersCollection().findOne({ email: doc.email });

  if (existing) {
    throw createError(409, "A user with this email already exists");
  }

  const { insertedId } = await usersCollection().insertOne(doc);

  return { ...doc, _id: insertedId };
};

const authenticateUser = async (payload = {}) => {
  const email = normalizeEmail(payload.email);
  const password = parsePassword(payload.password);

  const user = await usersCollection().findOne({ email });

  if (!user || user.deleted || user.password !== password) {
    throw createError(401, "Invalid email or password");
  }

  return user;
};

const toUserResponse = (doc) => ({
  id: doc._id.toString(),
  email: doc.email,
  email_verified: Boolean(doc.email_verified),
  email_verified_at: doc.email_verified_at,
  storage_all: doc.storage_all,
  storage_used: doc.storage_used,
  storage_expired_at: doc.storage_expired_at,
  deleted: doc.deleted,
  role: doc.role || "standard",
  created_at: doc.created_at,
  updated_at: doc.updated_at,
  last_login_at: doc.last_login_at,
});

// Zero out storage fields when the stored quota is already expired.
const applyStorageExpiration = (doc) => {
  if (!doc || !doc.storage_expired_at) {
    return { doc, expired: false };
  }

  const expiration = new Date(doc.storage_expired_at);
  if (Number.isNaN(expiration.getTime())) {
    return { doc, expired: false };
  }

  const nowInChina = new Date(toChineseIsoString());
  if (expiration <= nowInChina) {
    if (doc.storage_all === 0 && doc.storage_used === 0) {
      return { doc, expired: false };
    }

    return {
      doc: {
        ...doc,
        storage_all: 0,
        storage_used: 0,
      },
      expired: true,
    };
  }

  return { doc, expired: false };
};

const refreshStorageIfExpired = async (doc) => {
  if (!doc) {
    return doc;
  }

  const { doc: maybeUpdatedDoc, expired } = applyStorageExpiration(doc);

  if (!expired) {
    return maybeUpdatedDoc;
  }

  const timestamp = toChineseIsoString();

  await usersCollection().updateOne(
    { _id: doc._id },
    {
      $set: {
        storage_all: maybeUpdatedDoc.storage_all,
        storage_used: maybeUpdatedDoc.storage_used,
        updated_at: timestamp,
      },
    }
  );

  return {
    ...maybeUpdatedDoc,
    updated_at: timestamp,
  };
};

router.get(
  "/",
  authenticateRequest,
  asyncHandler(async (req, res) => {
    if (isAdmin(req.authUser)) {
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
      return;
    }

    const current = await usersCollection().findOne({ _id: req.authUser._id });

    if (!current) {
      throw createError(404, "User not found");
    }

    const userWithStorage = await refreshStorageIfExpired(current);

    res.json({
      success: true,
      value: [toUserResponse(userWithStorage)],
    });
  })
);

router.get(
  "/:id",
  authenticateRequest,
  asyncHandler(async (req, res) => {
    const userId = ensureObjectId(req.params.id);

    ensureSelfAccess(userId, req.authUser);

    const user = await usersCollection().findOne({ _id: userId });

    if (!user) {
      throw createError(404, "User not found");
    }

    const userWithStorage = await refreshStorageIfExpired(user);

    res.json({
      success: true,
      value: toUserResponse(userWithStorage),
    });
  })
);

router.post(
  "/",
  authenticateRequest,
  asyncHandler(async (req, res) => {
    const createdUser = await insertUser(req.body || {});

    res.status(201).json({
      success: true,
      value: toUserResponse(createdUser),
    });
  })
);

router.post(
  "/reset-password/request",
  asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const user = await usersCollection().findOne({ email, deleted: false });

    if (user) {
      const token = await persistPasswordResetToken(user._id);
      await sendPasswordResetEmail({
        toEmail: user.email,
        toName: user.email,
        token,
      });
    }

    res.json({
      success: true,
      value: {
        message:
          "If an account exists for the provided email, password reset instructions have been sent.",
      },
    });
  })
);

router.post(
  "/reset-password/confirm",
  asyncHandler(async (req, res) => {
    const token = parseResetToken(req.body?.token);
    const newPassword = parsePassword(req.body?.password);

    const user = await usersCollection().findOne({
      password_reset_token: token,
      deleted: false,
    });

    if (!user) {
      throw createError(400, "Invalid or expired reset token");
    }

    const expiration = user.password_reset_token_expires_at
      ? new Date(user.password_reset_token_expires_at)
      : null;

    if (!expiration || Number.isNaN(expiration.getTime())) {
      await clearPasswordResetToken(user._id);
      throw createError(400, "Invalid or expired reset token");
    }

    const now = new Date(toChineseIsoString());

    if (expiration <= now) {
      await clearPasswordResetToken(user._id);
      throw createError(400, "Reset token has expired");
    }

    const timestamp = toChineseIsoString();

    await usersCollection().updateOne(
      { _id: user._id },
      {
        $set: {
          password: newPassword,
          updated_at: timestamp,
        },
        $unset: {
          password_reset_token: "",
          password_reset_token_expires_at: "",
        },
      }
    );

    res.json({
      success: true,
      value: {
        message: "Password updated successfully",
      },
    });
  })
);

router.post(
  "/register/request-verification",
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const email = normalizeEmail(body.email);
    const password = parsePassword(body.password);
    const payload = {
      ...body,
      email,
      password,
      email_verified: false,
      email_verified_at: null,
    };

    let targetUser = await usersCollection().findOne({ email });

    if (targetUser) {
      if (targetUser.email_verified) {
        throw createError(409, "A user with this email already exists");
      }

      const updates = buildUpdateDocument(payload, targetUser);
      updates.email_verified = false;
      updates.email_verified_at = null;

      const result = await usersCollection().findOneAndUpdate(
        { _id: targetUser._id },
        { $set: updates },
        { returnDocument: "after" }
      );

      targetUser = result.value;
    } else {
      targetUser = await insertUser(payload);
    }

    const token = await persistEmailVerificationRequest(targetUser._id, email);

    await sendEmailVerificationEmail({
      toEmail: email,
      toName: email,
      token,
    });

    res.status(202).json({
      success: true,
      value: {
        message: "Verification email sent",
      },
    });
  })
);

router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const verificationToken = parseVerificationToken(
      req.body?.token ?? req.body?.verification_token
    );

    const { user } = await consumeEmailVerificationToken(verificationToken);

    if (user.email_verified) {
      res.json({
        success: true,
        value: {
          message: "Email account is already active",
        },
      });
      return;
    }

    const verifyTimestamp = toChineseIsoString();

    const result = await usersCollection().findOneAndUpdate(
      { _id: user._id },
      {
        $set: {
          email_verified: true,
          email_verified_at: verifyTimestamp
        },
      },
      { returnDocument: "after" }
    );

    if (!result) {
      throw createError(404, "User not found");
    }

    const userWithLastLogin = await recordLastLoginTimestamp(result);
    const token = await issueAuthTokenForUser(userWithLastLogin);

    res.status(201).json({
      success: true,
      value: {
        user: toUserResponse(userWithLastLogin),
        token,
      },
    });
  })
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const authenticatedUser = await authenticateUser(req.body || {});
    const userWithStorage = await refreshStorageIfExpired(authenticatedUser);
    const userWithLastLogin = await recordLastLoginTimestamp(userWithStorage);
    const token = await issueAuthTokenForUser(userWithLastLogin);

    res.json({
      success: true,
      value: {
        user: toUserResponse(userWithLastLogin),
        token,
      },
    });
  })
);

router.put(
  "/:id",
  authenticateRequest,
  asyncHandler(async (req, res) => {
    const userId = ensureObjectId(req.params.id);
    ensureSelfAccess(userId, req.authUser);
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
  authenticateRequest,
  asyncHandler(async (req, res) => {
    const userId = ensureObjectId(req.params.id);
    ensureSelfAccess(userId, req.authUser);

    const result = await usersCollection().findOneAndUpdate(
      { _id: userId },
      {
        $set: {
          deleted: true,
          updated_at: toChineseIsoString(),
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
