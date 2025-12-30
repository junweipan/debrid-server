const dotenv = require("dotenv");

dotenv.config();

const parseNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const mongoUri = process.env.MONGODB_URI;

const mongoDbName =
  process.env.MONGODB_DB_NAME || process.env.MONGO_DB_NAME || "debrid";

const mongoUsersCollection = process.env.MONGODB_USERS_COLLECTION || "users";
const mongoTransactionsCollection =
  process.env.MONGODB_TRANSACTIONS_COLLECTION || "transactions";
const mongoGiftCardsCollection =
  process.env.MONGODB_GIFT_CARD_COLLECTION || "gift_card";
const mongoUserRedeemCollection =
  process.env.MONGODB_USER_REDEEM_COLLECTION || "user_redeem";

const jwtSecret = process.env.JWT_SECRET || "";
const jwtExpiresIn = process.env.JWT_EXPIRES_IN || "7d";

module.exports = {
  port: parseNumber(process.env.PORT, 4000),
  apiBaseUrl: process.env.API_BASE_URL || "https://debrid-link.com/api/v2",
  oauthBaseUrl: process.env.OAUTH_BASE_URL || "https://debrid-link.com/api",
  defaultTimeout: parseNumber(process.env.API_TIMEOUT_MS, 15000),
  defaultToken: process.env.API_TOKEN || "",
  mongoUri,
  mongoDbName,
  mongoUsersCollection,
  mongoTransactionsCollection,
  mongoGiftCardsCollection,
  mongoUserRedeemCollection,
  jwtSecret,
  jwtExpiresIn,
};
