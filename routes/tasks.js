const express = require('express');
const Task = require('../models/task');
const User = require('../models/user');
const mongoose = require('mongoose');
const { isValidObjectId } = require('./_utils');

const router = express.Router();

function parseJSONParam(val, name) {
  if (val === undefined) return undefined;
  try { return JSON.parse(val); }
  catch {
    const err = new Error(`Invalid JSON in '${name}'`);
    err.statusCode = 400;
    throw err;
  }
}

function parseQueryWithFilterAlias(req, defaults = {}) {
  const rawWhere = req.query.where ?? req.query.filter;
  const where  = rawWhere ? parseJSONParam(rawWhere, rawWhere === req.query.where ? 'where' : 'filter') : {};
  const sort   = parseJSONParam(req.query.sort, 'sort') || undefined;
  const select = parseJSONParam(req.query.select, 'select') || undefined;

  let skip  = Number.isFinite(+req.query.skip) ? Math.max(0, +req.query.skip) : 0;
  let limit = Number.isFinite(+req.query.limit) ? Math.max(0, +req.query.limit) : (defaults.limit ?? 0);
  const count = String(req.query.count).toLowerCase() === 'true';

  return { where, sort, select, skip, limit, count };
}

function coerceCompleted(val, fallback = false) {
  if (typeof val === 'boolean') return val;
  if (val == null) return fallback;
  const s = String(val).toLowerCase();
  if (s === 'true') return true;
  if (s === 'false') return false;
  return fallback;
}

function coerceDeadline(val) {
  if (val instanceof Date) return val;
  const n = Number(val);
  const d = isNaN(n) ? new Date(val) : new Date(n);
  if (isNaN(d.getTime())) {
    const e = new Error('deadline must be a valid date or epoch milliseconds');
    e.statusCode = 400;
    throw e;
  }
  return d;
}

async function applyAssignment(task, assignedUserId) {
  if (assignedUserId === '' || assignedUserId == null) {
    task.assignedUser = null;
    task.assignedUserName = 'unassigned';
    return null;
  }

  if (!mongoose.Types.ObjectId.isValid(assignedUserId)) {
    const e = new Error('assignedUser is not a valid id'); e.statusCode = 400; throw e;
  }
  const user = await User.findById(assignedUserId);
  if (!user) { const e = new Error('assignedUser does not exist'); e.statusCode = 400; throw e; }

  task.assignedUser = user._id;
  task.assignedUserName = user.name;
  return user._id;
}

function parseJSONParam(val, name) {
  if (val === undefined) return undefined;
  try { return JSON.parse(val); }
  catch {
    const err = new Error(`Invalid JSON in '${name}'`);
    err.statusCode = 400;
    throw err;
  }
}

// GET /api/tasks
router.get('/', async (req, res, next) => {
  try {
    const rawWhere = req.query.where ?? req.query.filter;
    const where  = rawWhere ? parseJSONParam(rawWhere, rawWhere === req.query.where ? 'where' : 'filter') : {};
    let   select = parseJSONParam(req.query.select, 'select') || undefined;
    const sort   = parseJSONParam(req.query.sort, 'sort') || undefined;

    if (where && typeof where === 'object' && Object.prototype.hasOwnProperty.call(where, '_id')) {
      if (where._id === 1 || where._id === 0) {
        select = { ...(select || {}), _id: where._id };
        delete where._id;
      }
    }

    const skip  = Number.isFinite(+req.query.skip) ? Math.max(0, +req.query.skip) : 0;
    const limit = Number.isFinite(+req.query.limit) ? Math.max(0, +req.query.limit) : 100;
    const count = String(req.query.count).toLowerCase() === 'true';

    let q = Task.find(where);
    if (sort)   q = q.sort(sort);
    if (select) q = q.select(select);
    if (skip)   q = q.skip(skip);
    if (limit)  q = q.limit(limit);

    if (count) {
      const c = await Task.countDocuments(where);
      return res.status(200).json({ message: 'OK', data: { count: c } });
    }

    const tasks = await q.exec();
    return res.status(200).json({ message: 'OK', data: tasks });
  } catch (err) { next(err); }
});


// POST /api/tasks
router.post('/', async (req, res, next) => {
  try {
    const { name, description, deadline } = req.body || {};
    if (!name || deadline == null)
      return res.status(400).json({ message: 'name and deadline are required', data: null });

    const task = new Task({
      name: name,
      description: description ?? '',
      deadline: coerceDeadline(deadline),
      completed: coerceCompleted(req.body.completed, false)
    });

    const assignedUserId = await applyAssignment(task, req.body.assignedUser);

    await task.save();

    if (assignedUserId) {
      await User.updateOne(
        { _id: assignedUserId, pendingTasks: { $ne: task._id } },
        { $push: { pendingTasks: task._id } }
      );
    }

    return res.status(201).json({ message: 'Created', data: task });
  } catch (err) { next(err); }
});

// GET /api/tasks/:id  (supports ?select=)
router.get('/:id', async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id))
      return res.status(400).json({ message: 'Invalid task id', data: null });

    const { select } = parseQueryWithFilterAlias(req);
    const task = await Task.findById(req.params.id).select(select || undefined);
    if (!task)
      return res.status(404).json({ message: 'Task not found', data: null });

    return res.status(200).json({ message: 'OK', data: task });
  } catch (err) { next(err); }
});

// PUT /api/tasks/:id  (full replace + two-way integrity)
router.put('/:id', async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id))
      return res.status(400).json({ message: 'Invalid task id', data: null });

    const existing = await Task.findById(req.params.id);
    if (!existing)
      return res.status(404).json({ message: 'Task not found', data: null });

    const { name, description, deadline } = req.body || {};
    if (!name || deadline == null)
      return res.status(400).json({ message: 'name and deadline are required', data: null });

    const prevAssignedUser = existing.assignedUser ? String(existing.assignedUser) : null;

    existing.name = name;
    existing.description = description ?? '';
    existing.deadline = coerceDeadline(deadline);
    existing.completed = coerceCompleted(req.body.completed, false);

    const newAssignedUserId = await applyAssignment(existing, req.body.assignedUser);

    await existing.save();

    const currAssignedUser = newAssignedUserId ? String(newAssignedUserId) : null;

    if (prevAssignedUser && prevAssignedUser !== currAssignedUser) {
      await User.updateOne({ _id: prevAssignedUser }, { $pull: { pendingTasks: existing._id } });
    }
    if (currAssignedUser && prevAssignedUser !== currAssignedUser) {
      await User.updateOne(
        { _id: currAssignedUser, pendingTasks: { $ne: existing._id } },
        { $push: { pendingTasks: existing._id } }
      );
    }

    return res.status(200).json({ message: 'OK', data: existing });
  } catch (err) { next(err); }
});

// DELETE /api/tasks/:id  (also pull from assigned user's pendingTasks)
router.delete('/:id', async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id))
      return res.status(400).json({ message: 'Invalid task id', data: null });

    const task = await Task.findById(req.params.id);
    if (!task)
      return res.status(404).json({ message: 'Task not found', data: null });

    const assignedUser = task.assignedUser ? String(task.assignedUser) : null;

    await task.deleteOne();

    if (assignedUser) {
      await User.updateOne({ _id: assignedUser }, { $pull: { pendingTasks: task._id } });
    }

    return res.status(204).json({ message: 'No Content', data: null });
  } catch (err) { next(err); }
});

module.exports = (r) => router;
