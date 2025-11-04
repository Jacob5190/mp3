// Load required packages
var mongoose = require('mongoose');

// Define our task schema
const TaskSchema = new mongoose.Schema({
  name: { type: String, required: [true, 'Task name is required'], trim: true },
  description: { type: String, default: '' },
  deadline: { type: Date, required: [true, 'Task deadline is required'] },
  completed: { type: Boolean, default: false },
  assignedUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  assignedUserName: {
    type: String,
    default: 'unassigned'
  },
  dateCreated: { type: Date, default: Date.now }
}, { versionKey: false });

// Export the Mongoose model
module.exports = mongoose.model('Task', TaskSchema);