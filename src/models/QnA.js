const mongoose = require('mongoose');

const QnASchema = new mongoose.Schema({
  name: { type: String, required: true },    
  question: { type: String, required: true },
  answer: { type: String, required: true },   
  size: { type: Number, default: 0 },     
  sourceType: { type: String, enum: ['text'], default: 'text' }, 
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assistantId: { type: String, required: true },
  openai_storage_key: { type: String, required: false },   
  mark: { type: String, enum: ['new', 'trained', 'failed'], default: 'new' },
  status: { type: String, enum: ['fetched', 'pending', 'error'], default: 'pending' },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});


const QnA = mongoose.model('QnA', QnASchema);

module.exports = QnA;;
