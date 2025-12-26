const axios = require("axios");
const createError = require("http-errors");
const config = require("../config");

const hopByHopHeaders = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
]);

const methodsWithoutBody = new Set(["get", "head"]);

const buildUpstreamPath = (template, params = {}) => {
  if (typeof template === "function") {
    return template(params);
  }

  if (!template) {
    return "";
  }

  return template.replace(/:([A-Za-z0-9_]+)/g, (_, key) => {
    if (typeof params[key] === "undefined") {
      return `:${key}`;
    }

    return encodeURIComponent(params[key]);
  });
};

const normalizeToken = (value) => {
  if (!value) {
    return "";
  }

  return value.toLowerCase().startsWith("bearer ") ? value : `Bearer ${value}`;
};

const buildForwardHeaders = (incoming = {}, allowEnvToken) => {
  const headers = {};

  Object.entries(incoming).forEach(([key, headerValue]) => {
    if (!headerValue) {
      return;
    }

    const lowerKey = key.toLowerCase();

    if (hopByHopHeaders.has(lowerKey)) {
      return;
    }

    headers[key] = headerValue;
  });

  if (allowEnvToken && config.defaultToken && !headers.authorization) {
    headers.authorization = normalizeToken(config.defaultToken);
  }

  return headers;
};

const pickResponseHeaders = (source = {}) => {
  const headers = {};

  Object.entries(source).forEach(([key, headerValue]) => {
    if (!headerValue) {
      return;
    }

    if (hopByHopHeaders.has(key.toLowerCase())) {
      return;
    }

    headers[key] = headerValue;
  });

  return headers;
};

const shouldSendBody = (method = "get") =>
  !methodsWithoutBody.has(method.toLowerCase());

const createProxyHandler = ({
  baseUrl,
  upstreamPath,
  allowEnvToken = true,
  summary,
  timeout,
} = {}) => {
  if (!baseUrl) {
    throw new Error("baseUrl is required to create a proxy handler");
  }

  return async function proxyHandler(req, res, next) {
    try {
      const resolvedPath = buildUpstreamPath(
        upstreamPath || req.path,
        req.params
      );
      const targetUrl = `${baseUrl}${resolvedPath}`;
      const headers = buildForwardHeaders(req.headers, allowEnvToken);
      const axiosConfig = {
        method: req.method,
        url: targetUrl,
        headers,
        params: req.query,
        timeout: timeout || config.defaultTimeout,
        validateStatus: () => true,
        transitional: { clarifyTimeoutError: true },
      };

      if (
        shouldSendBody(req.method) &&
        req.body &&
        Object.keys(req.body).length > 0
      ) {
        axiosConfig.data = req.body;
      }

      const response = await axios(axiosConfig);
      const responseHeaders = pickResponseHeaders(response.headers);

      res.status(response.status);
      Object.entries(responseHeaders).forEach(([key, headerValue]) => {
        res.setHeader(key, headerValue);
      });

      if (typeof response.data === "undefined") {
        res.end();
        return;
      }

      res.send(response.data);
    } catch (error) {
      if (error.response) {
        res.status(error.response.status).send(error.response.data);
        return;
      }

      if (error.code === "ECONNABORTED") {
        next(createError(504, "Upstream request timed out"));
        return;
      }

      const message = summary
        ? `${summary} failed: ${error.message}`
        : error.message;
      next(createError(502, message));
    }
  };
};

module.exports = {
  createProxyHandler,
};
