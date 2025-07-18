const mongoose = require('mongoose');
const { ASSISTANT_INSTRUCTION } = require('../constants/asistant');

const assistantSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  name: {
    type: String,
    required: true,
    trim: true
  },

  openaiAssistantId: {
    type: String,
    required: true,
    unique: true
  },

  vectorStoreId: {
    type: String
  },

  model: {
    type: String,
    default: 'gpt-4o mini',
  },

  temperature: {
    type: Number,
    default: 0.7,
    min: 0,
    max: 1
  },

  introMessage: {
    type: String,
    default: ''
  },

  suggestedMessages: {
    type: String,
    default: ''
  },

  rateLimit: {
    type: Number, 
    default: 100,
  },

  visibility: {
    type: String,
    enum: ['private', 'public'],
    default: 'public'
  },

  basePrompt: {
    type: String,
    default: ASSISTANT_INSTRUCTION
  },

  trainingStatus: {
    type: String,
    enum: ['idle', 'training', 'done', 'error'],
    default: 'idle'
  },
  tokenUsed: {
    type: Number,
    default: 0,
  },

  lastTrainedAt: {
    type: Date,
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Assistant = mongoose.model('Assistant', assistantSchema);

module.exports = Assistant;
