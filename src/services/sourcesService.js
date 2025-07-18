const Link = require('../models/LinksSchema');
const LINK_MODES = require('../constants/linkModes');
const { crawlLinksFromPages, extractLinksFromSitemap } = require('../utils/crawl');
const Assistant = require('../models/Assistant');
const r2Service = require('./r2Service');
const openAIAgentService = require('./openaiAgent');
const QnA = require('../models/QnA');
const File = require('../models/Files');
const Text = require('../models/Text');
const fs = require('fs/promises');
const path = require('path');
const CustomError = require('../middleware/CustomError');

exports.getLinks = async (userId, assistantId) => {
  if (!assistantId) throw new CustomError('assistantId is required', 400);
  return await Link.find({ user_id: userId, assistantId }).sort({ created_at: -1 });
};

exports.addLinks = async (userId, assistantId, link, mode) => {
  if (!assistantId || !link || !mode) throw new CustomError('assistantId, mode and link are required', 400);
  let finalLinks = [];
  if (mode === LINK_MODES.INDIVIDUAL) {
    finalLinks = Array.isArray(link) ? link : [link];
  } else if (mode === LINK_MODES.CRAWL) {
    finalLinks = await crawlLinksFromPages(link);
  } else if (mode === LINK_MODES.SITEMAP) {
    finalLinks = await extractLinksFromSitemap(link);
  }
  const existingLinks = await Link.find({ name: { $in: finalLinks } }, { name: 1 }).lean();
  const existingNames = new Set(existingLinks.map(l => l.name));
  const linksToInsert = finalLinks.filter(linkUrl => !existingNames.has(linkUrl));
  if (linksToInsert.length === 0) return null;
  return await Link.insertMany(
    linksToInsert.map((linkUrl) => ({
      url: linkUrl,
      name: linkUrl,
      type: mode.toLowerCase(),
      user_id: userId,
      assistantId
    }))
  );
};

exports.deleteLink = async (userId, assistantId, linkId) => {
  if (!assistantId || !linkId) throw new CustomError('assistantId and linkId are required', 400);
  const link = await Link.findOne({ _id: linkId, user_id: userId });
  if (!link) throw new CustomError('Link not found', 404);
  const assistant = await Assistant.findOne({ _id: assistantId, user: userId });
  if (link.r2_file_key) {
    try { await r2Service.deleteFile(link.r2_file_key); } catch {}
  }
  if (link.openai_storage_key && assistant.vectorStoreId) {
    try { await openAIAgentService.deleteFileFromVectorStore(assistant.vectorStoreId, link.openai_storage_key); } catch {}
  }
  await link.deleteOne();
};

exports.deleteQnA = async (userId, assistantId, qnaId) => {
  if (!assistantId || !qnaId) throw new CustomError('assistantId and qnaId are required', 400);
  const assistant = await Assistant.findOne({ _id: assistantId, user: userId });
  if (!assistant) throw new CustomError('Assistant not found', 404);
  const qnaToDelete = await QnA.findOne({ _id: qnaId, user_id: userId, assistantId });
  if (!qnaToDelete) throw new CustomError('QnA entry not found', 404);
  await qnaToDelete.deleteOne();
  const remainingQnAs = await QnA.find({ assistantId, user_id: userId });
  if (remainingQnAs.length === 0) {
    if (assistant.vectorStoreId && qnaToDelete.openai_storage_key) {
      try { await openAIAgentService.deleteFileFromVectorStore(assistant.vectorStoreId, qnaToDelete.openai_storage_key); } catch {}
    }
  } else {
    // Optionally: processQnA(assistant, remainingQnAs)
  }
};

exports.deleteAllQnA = async (userId, assistantId) => {
  if (!assistantId) throw new CustomError('assistantId is required', 400);
  const qnas = await QnA.find({ user_id: userId, assistantId });
  const assistant = await Assistant.findOne({ _id: assistantId, user: userId });
  for (const qna of qnas) {
    if (qna.openai_storage_key && assistant && assistant.vectorStoreId) {
      try { await openAIAgentService.deleteFileFromVectorStore(assistant.vectorStoreId, qna.openai_storage_key); } catch {}
    }
  }
  await QnA.deleteMany({ user_id: userId, assistantId });
};

exports.getFiles = async (userId, assistantId) => {
  if (!assistantId) throw new CustomError('Missing assistantId', 400);
  return await File.find({ user_id: userId, assistantId }).sort({ created_at: -1 });
};

exports.addFile = async (userId, assistantId, file, filePath) => {
  if (!file) throw new CustomError('No file uploaded', 400);
  const fileBuffer = await fs.readFile(filePath);
  const ext = path.extname(file.originalname).slice(1).toLowerCase() || 'bin';
  const r2Key = r2Service.generateUniqueId(ext);
  await r2Service.uploadFile(fileBuffer, r2Key, file.mimetype);
  const fileEntry = new File({
    name: file.originalname,
    r2_file_key: r2Key,
    size: file.size,
    sourceType: 'file',
    user_id: userId,
    assistantId,
    status: 'fetched',
    mark: 'new',
    created_at: new Date(),
    updated_at: new Date(),
  });
  await fileEntry.save();
  await fs.unlink(filePath);
  return fileEntry;
};

exports.deleteFile = async (userId, assistantId, fileId) => {
  if (!assistantId || !fileId) throw new CustomError('assistantId and fileId are required', 400);
  const file = await File.findOne({ _id: fileId, user_id: userId, assistantId });
  if (!file) throw new CustomError('File not found', 404);
  const assistant = await Assistant.findOne({ _id: assistantId, user: userId });
  if (file.r2_file_key) {
    try { await r2Service.deleteFile(file.r2_file_key); } catch {}
  }
  if (file.openai_storage_key && assistant?.vectorStoreId) {
    try { await openAIAgentService.deleteFileFromVectorStore(assistant.vectorStoreId, file.openai_storage_key); } catch {}
  }
  await file.deleteOne();
};

exports.addText = async (userId, assistantId, content) => {
  if (!assistantId || !content) throw new CustomError('assistantId and content are required', 400);
  let textEntry = await Text.findOne({ assistantId, user_id: userId });
  if (textEntry) {
    await r2Service.updateFile(
      textEntry.r2_file_key,
      Buffer.from(content, 'utf8'),
      'text/plain'
    );
    textEntry.size = Buffer.byteLength(content, 'utf8');
    textEntry.updated_at = new Date();
    textEntry.status = 'fetched';
    textEntry.mark = 'new';
    await textEntry.save();
  } else {
    const r2Key = r2Service.generateUniqueId('txt');
    await r2Service.uploadFile(Buffer.from(content, 'utf8'), r2Key, 'text/plain');
    textEntry = new Text({
      name: 'assistant_text_data',
      r2_file_key: r2Key,
      size: Buffer.byteLength(content, 'utf8'),
      sourceType: 'text',
      user_id: userId,
      assistantId,
      status: 'fetched',
      mark: 'new',
      created_at: new Date(),
      updated_at: new Date(),
    });
    await textEntry.save();
  }
  return textEntry;
};

exports.getText = async (userId, assistantId) => {
  if (!assistantId) throw new CustomError('assistantId is required', 400);
  const textRecord = await Text.findOne({ user_id: userId, assistantId }).sort({ created_at: -1 });
  if (!textRecord) return null;
  const exists = await r2Service.exists(textRecord.r2_file_key);
  if (!exists) throw new CustomError('File not found in storage', 404);
  const { buffer, contentType } = await r2Service.readFile(textRecord.r2_file_key);
  const textContent = buffer.toString('utf8');
  return {
    id: textRecord._id,
    name: textRecord.name,
    assistantId: textRecord.assistantId,
    size: textRecord.size,
    sourceType: textRecord.sourceType,
    status: textRecord.status,
    mark: textRecord.mark,
    created_at: textRecord.created_at,
    updated_at: textRecord.updated_at,
    contentType,
    text: textContent,
  };
};

exports.addQnA = async (userId, assistantId, question, answer) => {
  if (!assistantId || !question || !answer) throw new CustomError('assistantId, question, and answer are required', 400);
  const content = `Q: ${question}\nA: ${answer}`;
  const size = Buffer.from(content, 'utf-8').length; 

  const qnaEntry = new QnA({
    name: question,
    question,
    answer,
    assistantId,
    user_id: userId,
    size
  });
  await qnaEntry.save();
  return qnaEntry;
};

exports.getQnA = async (userId, assistantId) => {
  if (!assistantId) throw new CustomError('assistantId is required', 400);
  return await QnA.find({ user_id: userId, assistantId }).sort({ created_at: -1 });
}; 