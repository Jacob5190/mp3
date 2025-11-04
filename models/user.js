// Load required packages
var mongoose = require('mongoose');

// Define our user schema
const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'User name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'User email is required'],
    trim: true,
    lowercase: true,
    unique: true
  },
  pendingTasks: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    default: []
  }],
  dateCreated: {
    type: Date,
    default: Date.now
  }
}, { versionKey: false });

// Export the Mongoose model
module.exports = mongoose.model('User', UserSchema);
