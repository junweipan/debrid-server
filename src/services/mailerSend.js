const axios = require("axios");
const createError = require("http-errors");
const config = require("../config");

const MAILERSEND_EMAIL_ENDPOINT = "https://api.mailersend.com/v1/email";

const ensureMailerSendConfig = () => {
  if (!config.mailerSendAccessToken) {
    throw createError(500, "MailerSend access token is not configured");
  }

  if (!config.mailerSendFromEmail) {
    throw createError(500, "MailerSend from email is not configured");
  }
};

const buildTokenizedLink = (baseUrl, token) => {
  if (!baseUrl) {
    return null;
  }

  if (baseUrl.includes("%token%")) {
    return baseUrl.replace(/%token%/g, token);
  }

  try {
    const url = new URL(baseUrl);
    url.searchParams.set("token", token);
    return url.toString();
  } catch (_error) {
    const separator = baseUrl.includes("?") ? "&" : "?";
    return `${baseUrl}${separator}token=${token}`;
  }
};

const buildResetLink = (token) =>
  buildTokenizedLink(config.passwordResetUrl, token);

const buildVerificationLink = (token) =>
  buildTokenizedLink(config.emailVerificationUrl, token);

const createEmailPayload = ({ toEmail, toName, subject, text, html }) => ({
  from: {
    email: config.mailerSendFromEmail,
    name: config.mailerSendFromName,
  },
  to: [
    {
      email: toEmail,
      name: toName || undefined,
    },
  ],
  subject,
  text,
  html,
});

const sendMailersendEmail = async ({
  toEmail,
  toName,
  subject,
  text,
  html,
}) => {
  ensureMailerSendConfig();

  try {
    await axios.post(
      MAILERSEND_EMAIL_ENDPOINT,
      createEmailPayload({
        toEmail,
        toName,
        subject,
        text,
        html,
      }),
      {
        headers: {
          Authorization: `Bearer ${config.mailerSendAccessToken}`,
          "Content-Type": "application/json",
        },
        timeout: config.defaultTimeout,
      }
    );
  } catch (error) {
    const status = error.response?.status;
    const message =
      error.response?.data?.message || "Failed to dispatch MailerSend email";

    console.error("MailerSend email error", {
      status,
      message,
      data: error.response?.data,
    });

    throw createError(502, "Unable to send transactional email");
  }
};

const sendPasswordResetEmail = async ({ toEmail, toName, token }) => {
  const resetLink = buildResetLink(token);
  const subject = "Password reset instructions";

  const text = resetLink
    ? `We received a request to reset your password. Use the link below within the next hour:\n${resetLink}\n\nIf you prefer to enter the token manually, use: ${token}`
    : `We received a request to reset your password. Use the following token within the next hour: ${token}`;

  const html = resetLink
    ? `<p>We received a request to reset your password.</p><p><a href="${resetLink}">Reset your password</a></p><p>If the button does not work, use this token within the next hour: <strong>${token}</strong></p>`
    : `<p>We received a request to reset your password.</p><p>Use this token within the next hour: <strong>${token}</strong></p>`;

  await sendMailersendEmail({
    toEmail,
    toName,
    subject,
    text,
    html,
  });
};

const sendEmailVerificationEmail = async ({ toEmail, toName, token }) => {
  const verificationLink = buildVerificationLink(token);
  const subject = "Verify your email address";

  const text = verificationLink
    ? `Please verify your email address by visiting the link below within the next 24 hours:\n${verificationLink}\n\nIf you need to enter the token manually, use: ${token}`
    : `Please verify your email address within the next 24 hours using this token: ${token}`;

  const html = verificationLink
    ? `<p>Please verify your email address.</p><p><a href="${verificationLink}">Verify email</a></p><p>If the button does not work, use this token within the next 24 hours: <strong>${token}</strong></p>`
    : `<p>Please verify your email address within the next 24 hours using this token: <strong>${token}</strong></p>`;

  await sendMailersendEmail({
    toEmail,
    toName,
    subject,
    text,
    html,
  });
};

module.exports = {
  sendPasswordResetEmail,
  sendEmailVerificationEmail,
};
