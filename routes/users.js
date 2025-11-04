const express = require('express');
const User = require('../models/user');
const Task = require('../models/task');
const { parseQueryParams, isValidObjectId } = require('./_utils');

const router = express.Router();

function parseJSONParam(val, name) {
  if (val === undefined) return undefined;
  try { return JSON.parse(val); }
  catch { const err = new Error(`Invalid JSON in '${name}'`); err.statusCode = 400; throw err; }
}

// GET /api/users
router.get('/', async (req, res, next) => {
  try {
    const rawWhere = req.query.where ?? req.query.filter;
    const where  = rawWhere ? parseJSONParam(rawWhere, rawWhere === req.query.where ? 'where' : 'filter') : {};
    let   select = parseJSONParam(req.query.select, 'select') || undefined;
    const sort   = parseJSONParam(req.query.sort, 'sort') || undefined;

    if (where && typeof where === 'object' && ('_id' in where) && (where._id === 1 || where._id === 0)) {
      select = { ...(select || {}), _id: where._id };
      delete where._id;
    }

    let skip  = Number.isFinite(+req.query.skip) ? Math.max(0, +req.query.skip) : 0;
    let limit = Number.isFinite(+req.query.limit) ? Math.max(0, +req.query.limit) : 0;
    const count = String(req.query.count).toLowerCase() === 'true';

    let q = User.find(where);
    if (sort)   q = q.sort(sort);
    if (select) q = q.select(select);
    if (skip)   q = q.skip(skip);
    if (limit)  q = q.limit(limit);

    if (count) {
      const c = await User.countDocuments(where);
      return res.status(200).json({ message: 'OK', data: { count: c } });
    }

    const users = await q.exec();
    return res.status(200).json({ message: 'OK', data: users });
  } catch (err) { next(err); }
});


// POST /api/users
router.post('/', async (req, res, next) => {
  try {
    const { name, email, pendingTasks } = req.body || {};
    if (!name || !email)
      return res.status(400).json({ message: 'name and email are required', data: null });

    const exists = await User.findOne({ email: String(email).toLowerCase() });
    if (exists)
      return res.status(400).json({ message: 'A user with that email already exists', data: null });

    const user = new User({
      name,
      email,
      pendingTasks: Array.isArray(pendingTasks) ? pendingTasks : [],
    });
    await user.save();

    // update referenced tasks
    if (user.pendingTasks.length) {
      const tasks = await Task.find({ _id: { $in: user.pendingTasks } });
      for (const t of tasks) {
        t.assignedUser = user._id;
        t.assignedUserName = user.name;
        await t.save();
      }
    }

    return res.status(201).json({ message: 'Created', data: user });
  } catch (err) { next(err); }
});

// GET /api/users/:id
router.get('/:id', async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id))
      return res.status(400).json({ message: 'Invalid user id', data: null });

    const { select } = parseQueryParams(req);
    const user = await User.findById(req.params.id).select(select || undefined);
    if (!user)
      return res.status(404).json({ message: 'User not found', data: null });

    return res.status(200).json({ message: 'OK', data: user });
  } catch (err) { next(err); }
});

// PUT /api/users/:id
router.put('/:id', async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id))
      return res.status(400).json({ message: 'Invalid user id', data: null });

    const { name, email, pendingTasks } = req.body || {};
    if (!name || !email)
      return res.status(400).json({ message: 'name and email are required', data: null });

    const user = await User.findById(req.params.id);
    if (!user)
      return res.status(404).json({ message: 'User not found', data: null });

    const dup = await User.findOne({ _id: { $ne: user._id }, email: String(email).toLowerCase() });
    if (dup)
      return res.status(400).json({ message: 'A user with that email already exists', data: null });

    const newTaskIds = Array.isArray(pendingTasks) ? pendingTasks : [];
    const prevTaskIds = user.pendingTasks.map(String);
    const newSet = new Set(newTaskIds.map(String));
    const prevSet = new Set(prevTaskIds);
    const toRemove = prevTaskIds.filter(id => !newSet.has(id));
    const toAdd = newTaskIds.filter(id => !prevSet.has(String(id)));

    user.name = name;
    user.email = email;
    user.pendingTasks = newTaskIds;
    await user.save();

    if (toRemove.length) {
      const tasks = await Task.find({ _id: { $in: toRemove }, assignedUser: user._id });
      for (const t of tasks) {
        t.assignedUser = null;
        t.assignedUserName = 'unassigned';
        await t.save();
      }
    }
    if (toAdd.length) {
      const tasks = await Task.find({ _id: { $in: toAdd } });
      for (const t of tasks) {
        t.assignedUser = user._id;
        t.assignedUserName = user.name;
        await t.save();
      }
    }

    return res.status(200).json({ message: 'OK', data: user });
  } catch (err) { next(err); }
});

// DELETE /api/users/:id
router.delete('/:id', async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id))
      return res.status(400).json({ message: 'Invalid user id', data: null });

    const user = await User.findById(req.params.id);
    if (!user)
      return res.status(404).json({ message: 'User not found', data: null });

    await Task.updateMany(
      { assignedUser: user._id },
      { $set: { assignedUser: null, assignedUserName: 'unassigned' } }
    );

    await user.deleteOne();
    return res.status(204).json({ message: 'No Content', data: null });
  } catch (err) { next(err); }
});

module.exports = (r) => router;
