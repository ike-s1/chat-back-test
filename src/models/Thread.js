const mongoose = require('mongoose');


const threadSchema = new mongoose.Schema({
  threadId: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assistantId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Thread = mongoose.model('Thread', threadSchema);

module.exports = Thread; 