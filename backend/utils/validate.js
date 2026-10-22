const { HttpError } = require("./response");

const PHONE_RE = /^\+?[0-9][0-9\s\-()]{6,19}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OBJECT_ID_RE = /^[a-f\d]{24}$/i;

const isObjectId = (v) => typeof v === "string" && OBJECT_ID_RE.test(v);

/** Required trimmed string within [min,max]; throws HttpError(400). */
const reqString = (v, field, { min = 1, max = 200 } = {}) => {
  if (typeof v !== "string") throw new HttpError(400, `${field} is required`);
  const s = v.trim();
  if (s.length < min || s.length > max)
    throw new HttpError(400, `${field} must be between ${min} and ${max} characters`);
  return s;
};

const optString = (v, field, { max = 1000 } = {}) => {
  if (v === undefined || v === null || v === "") return "";
  if (typeof v !== "string") throw new HttpError(400, `${field} must be text`);
  const s = v.trim();
  if (s.length > max) throw new HttpError(400, `${field} must be at most ${max} characters`);
  return s;
};

const phone = (v, field = "Phone number") => {
  const s = reqString(v, field, { min: 7, max: 20 });
  if (!PHONE_RE.test(s)) throw new HttpError(400, `${field} is not a valid phone number`);
  return s;
};

const oneOf = (v, allowed, field) => {
  if (typeof v !== "string" || !allowed.includes(v))
    throw new HttpError(400, `${field} must be one of: ${allowed.join(", ")}`);
  return v;
};

const int = (v, field, { min = 0, max = 1e6 } = {}) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isInteger(n) || n < min || n > max)
    throw new HttpError(400, `${field} must be a whole number between ${min} and ${max}`);
  return n;
};

const objectId = (v, field) => {
  if (!isObjectId(v)) throw new HttpError(400, `${field} is not a valid id`);
  return v;
};

module.exports = { PHONE_RE, EMAIL_RE, isObjectId, reqString, optString, phone, oneOf, int, objectId };
