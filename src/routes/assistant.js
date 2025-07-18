const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const assistantController = require('../controllers/assistantController');
const { createAssistantValidation } = require('../validators/assistantValidators');
const Thread = require('../models/Thread');
const openAIAgentService = require('../services/openaiAgent');

router.post('/create', createAssistantValidation, auth, assistantController.createAssistant);
router.get('/', auth, assistantController.getAssistants);
router.get('/:id', auth, assistantController.getAssistantById);
router.get('/:id/training-status', auth, assistantController.getTrainingStatus);
router.post('/:id/chat',  assistantController.chatWithAssistant);
router.post('/:assistantId/train', auth, assistantController.trainAssistant);
router.get('/:id/thread/:threadId',  async (req, res) => {
  try {
    const thread = await Thread.findOne({
      threadId: req.params.threadId,
      assistantId: req.params.id,
    });

    if (!thread) return res.status(404).json({ messages: [] });

    const messages = await openAIAgentService.getThreadMessages(req.params.threadId);
    res.json({ messages });
  } catch (err) {
    console.error("Failed to load conversation from OpenAI:", err);
    res.status(500).json({ error: 'Failed to load conversation' });
  }
});


module.exports = router; 