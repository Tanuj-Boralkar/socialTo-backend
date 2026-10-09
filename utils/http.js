exports.ok = (res, data = {}, message = "Operation successful", status = 200) =>
  res.status(status).json({ success: true, message, data })
exports.fail = (status, message) =>
  Object.assign(new Error(message), { status })
exports.page = (req) => ({
  page: Math.max(1, parseInt(req.query.page) || 1),
  limit: Math.min(40, Math.max(1, parseInt(req.query.limit) || 12)),
})
