const mongoose = require('mongoose');

const childLinkSchema = new mongoose.Schema({
  name: { type: String, required: true },     
  num_of_characters: { type: Number, default: 0 },
  size: { type: Number, default: 0 },          
  type: { type: String, enum: ['link', 'file'], required: true }, 
  mark: { type: String, enum: ['new', 'trained', 'failed'], default: 'new' },                              
  status: { type: String, enum: ['new', 'updated', 'deleted'], default: 'new' },
  parent_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Link', required: true }, 
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
  total_count: { type: Number, default: 0 },
  assistant_file_id:{ type: String, default: null },
});

const ChildLink = mongoose.model('ChildLink', childLinkSchema);

module.exports = ChildLink; 
