// Sources Controller
const logger = require('../logger');
const CustomError = require('../middleware/CustomError');
const sourcesService = require('../services/sourcesService');
const { validationResult } = require('express-validator');

exports.getLinks = async (req, res, next) => {
  try {
    const links = await sourcesService.getLinks(req.user._id, req.query.assistantId);
    res.json(links);
  } catch (error) {
    logger.error('Error fetching links:', error);
    next(error);
  }
};

exports.addLinks = async (req, res, next) => {
  try {
    const result = await sourcesService.addLinks(
      req.user._id,
      req.body.assistantId,
      req.body.link,
      req.body.mode
    );
    if (!result) {
      return res.status(200).json({ message: 'No new links to add' });
    }
    res.status(201).json(result);
  } catch (error) {
    logger.error('Error adding links:', error);
    next(error);
  }
};

exports.deleteLink = async (req, res, next) => {
  try {
    await sourcesService.deleteLink(req.user._id, req.body.assistantId, req.body.linkId);
    res.json({ message: 'Link deleted successfully' });
  } catch (error) {
    logger.error('Error deleting link:', error);
    next(error);
  }
};

exports.deleteQnA = async (req, res, next) => {
  try {
    await sourcesService.deleteQnA(req.user._id, req.body.assistantId, req.body.qnaId);
    res.json({ message: 'QnA entry deleted and vector store updated' });
  } catch (error) {
    logger.error('Error deleting QnA:', error);
    next(error);
  }
};

exports.deleteAllQnA = async (req, res, next) => {
  try {
    await sourcesService.deleteAllQnA(req.user._id, req.body.assistantId);
    res.json({ message: 'All QnA entries deleted successfully' });
  } catch (error) {
    logger.error('Error deleting all QnA entries:', error);
    next(error);
  }
};

exports.getFiles = async (req, res, next) => {
  try {
    const files = await sourcesService.getFiles(req.user._id, req.query.assistantId);
    res.status(200).json(files);
  } catch (error) {
    logger.error('Error fetching assistant files:', error);
    next(error);
  }
};

exports.addFile = async (req, res, next) => {
  try {
    const fileEntry = await sourcesService.addFile(
      req.user._id,
      req.body.assistantId,
      req.file,
      req.file.path
    );
    res.status(201).json(fileEntry);
  } catch (error) {
    logger.error('Error saving file:', error);
    next(error);
  }
};

exports.deleteFile = async (req, res, next) => {
  try {
    await sourcesService.deleteFile(req.user._id, req.body.assistantId, req.body.fileId);
    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    logger.error('Error deleting file:', error);
    next(error);
  }
};

exports.addText = async (req, res, next) => {
  try {
    const textEntry = await sourcesService.addText(
      req.user._id,
      req.body.assistantId,
      req.body.content
    );
    res.status(201).json(textEntry);
  } catch (error) {
    logger.error('Error saving text:', error);
    next(error);
  }
};

exports.getText = async (req, res, next) => {
  try {
    const text = await sourcesService.getText(
      req.user._id,
      req.query.assistantId
    );
    if (!text) {
      return res.status(200).json({ text: null });
    }
    res.json(text);
  } catch (error) {
    logger.error('Error fetching text:', error);
    next(error);
  }
};

exports.addQnA = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { assistantId, question, answer } = req.body;
    const qnaEntry = await sourcesService.addQnA(
      req.user._id,
      assistantId,
      question,
      answer
    );
    res.status(201).json(qnaEntry);
  } catch (error) {
    logger.error('Error saving qna:', error);
    next(error);
  }
};

exports.getQnA = async (req, res, next) => {
  try {
    const texts = await sourcesService.getQnA(
      req.user._id,
      req.query.assistantId
    );
    res.json(texts);
  } catch (error) {
    logger.error('Error fetching qna:', error);
    next(error);
  }
}; 