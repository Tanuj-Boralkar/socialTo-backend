const jwt = require("jsonwebtoken")
exports.sign = (User, type = "access") =>
  jwt.sign(
    { sub: String(User._id), ver: User.tokenVersion, type },
    process.env.JWT_SECRET,
    {
      expiresIn:
        type === "refresh"
          ? process.env.JWT_EXPIRES_IN || "7d"
          : process.env.ACCESS_TOKEN_EXPIRES_IN || "15m",
      issuer: "socialgram",
      audience: "socialgram-web",
    }
  )
exports.verify = (token) =>
  jwt.verify(token, process.env.JWT_SECRET, {
    issuer: "socialgram",
    audience: "socialgram-web",
    algorithms: ["HS256"]
  })
exports.cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.COOKIE_SAME_SITE || "lax",
  path: "/api/v1/auth",

})