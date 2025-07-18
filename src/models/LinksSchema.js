const mongoose = require('mongoose');

const linkSchema = new mongoose.Schema({
  name: { type: String, required: true},        
  num_of_characters: { type: Number, default: 0 },
  size: { type: Number, default: 0 },            
  type: { type: String, enum: ['individual', 'sitemap', 'crawl'], required: true },
  mark: { type: String, enum: ['new', 'trained', 'failed'], default: 'new' },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['fetched', 'pending', 'error'], default: 'pending' },
  isParent: { type: Boolean, default: true }, 
  lastCrawled: { type: Date },                 
  numberOfLinks: { type: Number, default: 0 },                
  parent_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Link', default: null },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
  r2_file_key: { type: String, required: false },
  openai_storage_key: { type: String, required: false },
  assistantId: { type: String, required: true },
});

const Link = mongoose.model('Link', linkSchema);

module.exports = Link; 