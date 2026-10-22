// Small helpers so every endpoint answers in the same shape:
// { success: boolean, message?: string, ...payload, meta?: {...} }
class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const ok = (res, payload = {}, status = 200) =>
  res.status(status).json({ success: true, ...payload });

const fail = (res, status, message, extra = {}) =>
  res.status(status).json({ success: false, message, ...extra });

// Wrap async controllers so thrown HttpError / mongoose errors reach one place.
const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const paginate = (query, { defaultLimit = 20, maxLimit = 100 } = {}) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(
    maxLimit,
    Math.max(1, parseInt(query.limit, 10) || defaultLimit)
  );
  return { page, limit, skip: (page - 1) * limit };
};

const pageMeta = ({ page, limit }, total) => ({
  page,
  limit,
  total,
  pages: Math.max(1, Math.ceil(total / limit)),
});

module.exports = { HttpError, ok, fail, wrap, paginate, pageMeta };
