const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const createError = require("http-errors");
const config = require("./config");
const endpointGroups = require("./endpoints");
const { createProxyHandler } = require("./services/proxyForwarder");

const app = express();

app.disable("x-powered-by");
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

app.get("/health", (req, res) => {
  res.json({
    success: true,
    value: {
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
  });
});

const baseUrlMap = {
  api: config.apiBaseUrl,
  oauth: config.oauthBaseUrl,
};

const registerEndpoint = (
  appInstance,
  baseUrl,
  endpoint,
  defaultAllowEnvToken = true
) => {
  const handler = createProxyHandler({
    baseUrl,
    upstreamPath: endpoint.upstreamPath || endpoint.path,
    allowEnvToken:
      typeof endpoint.allowEnvToken === "boolean"
        ? endpoint.allowEnvToken
        : defaultAllowEnvToken,
    summary: endpoint.summary,
    timeout: endpoint.timeout,
  });

  const methods =
    endpoint.methods && endpoint.methods.length > 0
      ? endpoint.methods
      : ["all"];

  methods.forEach((method) => {
    const normalizedMethod = method.toLowerCase();

    if (normalizedMethod === "all") {
      appInstance.all(endpoint.path, handler);
      return;
    }

    if (typeof appInstance[normalizedMethod] !== "function") {
      console.warn(`Unsupported HTTP method ${method} for ${endpoint.path}`);
      return;
    }

    appInstance[normalizedMethod](endpoint.path, handler);
  });
};

endpointGroups.forEach((group) => {
  const baseUrl = baseUrlMap[group.base];

  if (!baseUrl) {
    console.warn(`No base URL configured for group ${group.base}`);
    return;
  }

  group.endpoints.forEach((endpoint) => {
    registerEndpoint(app, baseUrl, endpoint, group.allowEnvToken ?? true);
  });
});

app.use((req, res, next) => {
  next(createError(404, `Endpoint ${req.originalUrl} is not defined`));
});

app.use((err, req, res, next) => {
  const status = err.status || 500;
  const message = err.expose ? err.message : "internalError";

  if (status >= 500) {
    console.error(err);
  }

  res.status(status).json({
    success: false,
    error: message,
    details: err.details || null,
  });
});

module.exports = app;
