const mongoose = require('mongoose');

function parseJSONParam(val, name) {
  if (val === undefined) return undefined;
  try { return JSON.parse(val); }
  catch { const err = new Error(`Invalid JSON in '${name}'`); err.statusCode = 400; throw err; }
}

function parseQueryParams(req, defaults = {}) {
  const rawWhere = req.query.where ?? req.query.filter; // alias support
  const where = rawWhere ? JSON.parse(rawWhere) : {};

  const sort   = parseJSONParam(req.query.sort, 'sort') || undefined;
  const select = parseJSONParam(req.query.select, 'select') || undefined;

  let skip  = Number.isFinite(+req.query.skip) ? Math.max(0, +req.query.skip) : 0;
  let limit = Number.isFinite(+req.query.limit) ? Math.max(0, +req.query.limit) : (defaults.limit ?? 0);
  const count = String(req.query.count).toLowerCase() === 'true';

  return { where, sort, select, skip, limit, count };
}

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

module.exports = { parseQueryParams, isValidObjectId };
