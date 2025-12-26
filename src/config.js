const dotenv = require("dotenv");

dotenv.config();

const parseNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

module.exports = {
  port: parseNumber(process.env.PORT, 4000),
  apiBaseUrl: process.env.API_BASE_URL || "https://debrid-link.com/api/v2",
  oauthBaseUrl: process.env.OAUTH_BASE_URL || "https://debrid-link.com/api",
  defaultTimeout: parseNumber(process.env.API_TIMEOUT_MS, 15000),
  defaultToken: process.env.API_TOKEN || "",
};
