const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
  name: { type: String, required: true },    
  r2_file_key: { type: String, required: true },
  openai_storage_key: { type: String, required: false },        
  size: { type: Number, default: 0 },     
  sourceType: { type: String, enum: ['file'], default: 'file' }, 
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assistantId: { type: String, required: true },
  mark: { type: String, enum: ['new', 'trained', 'failed'], default: 'new' },
  status: { type: String, enum: ['fetched', 'pending', 'error'], default: 'pending' },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

const File = mongoose.model('File', fileSchema);

module.exports = File;
