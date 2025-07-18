// Assistant Controller
const logger = require('../logger');
const CustomError = require('../middleware/CustomError');
const openaiAgent = require('../services/openaiAgent');
const Assistant = require('../models/Assistant');
const { processAssistantData } = require('../services/chatBot');
const Thread = require('../models/Thread');

exports.createAssistant = async (req, res, next) => {
  try {
    const newAssistant = await openaiAgent.createAssistant(
      req.user._id,
      req.body.name,
      req.body.instructions
    );
    res.status(201).json(newAssistant);
  } catch (error) {
    logger.error('Error creating assistant:', error);
    next(error);
  }
};

exports.getAssistants = async (req, res, next) => {
  try {
    const assistants = await Assistant.find({ user: req.user._id });
    res.json(assistants);
  } catch (error) {
    next(new CustomError('Error fetching assistants', 500));
  }
};

exports.getAssistantById = async (req, res, next) => {
  try {
    const assistant = await Assistant.findOne({
      _id: req.params.id,
      user: req.user._id
    });
    if (!assistant) {
      return next(new CustomError('Assistant not found', 404));
    }
    res.json(assistant);
  } catch (error) {
    next(new CustomError('Error fetching assistant', 500));
  }
};

exports.getTrainingStatus = async (req, res, next) => {
  try {
    const assistant = await Assistant.findOne({
      _id: req.params.id,
      user: req.user._id
    });
    if (!assistant) {
      return next(new CustomError('Assistant not found', 404));
    }
    res.json({ status: assistant.trainingStatus });
  } catch (error) {
    next(new CustomError('Error fetching training status', 500));
  }
};

exports.chatWithAssistant = async (req, res, next) => {
  try {
    const { message, threadId, assistantId } = req.body;
    const {
      cleanedResponse,
      threadId: usedThreadId,
      userId
    } = await openaiAgent.chatWithAssistant(assistantId, message, threadId);


    let thread = await Thread.findOne({ threadId: usedThreadId });
    if (!thread) {
      thread = new Thread({
        threadId: usedThreadId,
        userId,
        assistantId
      });
      await thread.save();
    }

    res.json({ message: cleanedResponse, threadId: usedThreadId });
  } catch (error) {
    logger.error('Error in chat:', error);
    next(error);
  }
};


exports.trainAssistant = async (req, res, next) => {
  try {
    const { assistantId } = req.params;
    const assistant = await Assistant.findOne({ _id: assistantId, user: req.user._id });
    if (!assistant) return next(new CustomError('Assistant not found', 404));
    assistant.trainingStatus = 'training';
    await assistant.save();
    try {
      await processAssistantData(assistant);
      assistant.trainingStatus = 'done';
      await assistant.save();
      res.json({ message: 'Training completed successfully' });
    } catch (error) {
      assistant.trainingStatus = 'error';
      await assistant.save();
      logger.error('Error during assistant training:', error);
      return next(new CustomError(error.message || 'Failed to train assistant', 500));
    }
  } catch (error) {
    next(new CustomError('Failed to train assistant', 500));
  }
}; 