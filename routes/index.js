/*
 * Connect all of your endpoints together here.
 */
const express = require('express');
module.exports = function (app, router) {
    app.use('/api', require('./home.js')(router));
    app.use('/api/users', require('./users')(express.Router()));
    app.use('/api/tasks', require('./tasks')(express.Router()));
};
