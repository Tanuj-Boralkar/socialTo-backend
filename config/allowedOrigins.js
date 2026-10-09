const configuredOrigins = (process.env.CLIENT_URL || "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);

const allowedOrigins = [
  ...new Set([
    "http://localhost:5173",
    "https://social-to-frontend.vercel.app",
    ...configuredOrigins,
  ]),
];

module.exports = allowedOrigins;