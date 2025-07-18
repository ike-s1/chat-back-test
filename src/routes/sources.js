const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const sourcesController = require('../controllers/sourcesController');
const { addLinksValidation } = require('../validators/sourcesValidators');
const multer = require('multer');
const path = require('path');
const { body } = require('express-validator');
const os = require('os');
const Link = require('../models/LinksSchema');
const Assistant = require('../models/Assistant');


const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, os.tmpdir());
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const allowedExts = ['.pdf', '.doc', '.docx', '.txt'];
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${ext}`));
    }
  }
});

router.get('/links', auth, sourcesController.getLinks);
router.post('/links/add', addLinksValidation, auth, sourcesController.addLinks);
router.delete('/links/delete', auth, sourcesController.deleteLink);

router.delete('/linsk/delete-all', auth, async (req, res) => {
  const { assistantId } = req.body;

  if (!assistantId) {
    return res.status(400).json({ message: 'assistantId is required' });
  }

  try {
    const links = await Link.find({
      user_id: req.user._id,
      parent_id: assistantId
    });

    const assistant = await Assistant.findOne({
      _id: assistantId,
      user: req.user._id
    });

    for (const link of links) {
      if (link.r2_file_key) {
        try {
          await r2Service.deleteFile(link.r2_file_key);
        } catch (err) {
          console.warn(`Failed to delete R2 file: ${link.r2_file_key}`, err.message);
        }
      }
      if (link.openai_storage_key && assistant.vectorStoreId) {
        try {
          await openAIAgentService.deleteFileFromVectorStore(link.openai_vector_store_id, link.openai_file_id);
        } catch (err) {
          console.warn(`Failed to delete OpenAI file/vector: ${link.openai_file_id}`, err.message);
        }
      }
    }

    await Link.deleteMany({
      user_id: req.user._id,
      assistantId
    });

    res.json({ message: 'All links deleted successfully' });
  } catch (error) {
    console.error('Error deleting all links:', error);
    res.status(500).json({ message: 'Error deleting all links' });
  }
});

//TEXT
router.post('/text/add', auth, sourcesController.addText);
router.get('/text', auth, sourcesController.getText);

// QnA
router.post('/qna/add', [
  body('assistantId').notEmpty().withMessage('assistantId is required'),
  body('question').notEmpty().withMessage('question is required'),
  body('answer').notEmpty().withMessage('answer is required')
], auth, sourcesController.addQnA);


router.get('/qna', auth, sourcesController.getQnA);
// QnA endpoints
router.delete('/qna/delete', auth, sourcesController.deleteQnA);
router.delete('/qna/delete-all', auth, sourcesController.deleteAllQnA);
// File endpoints
router.get('/file', auth, sourcesController.getFiles);
router.post('/file/add', auth, upload.single('file'), sourcesController.addFile);
router.delete('/file/delete', auth, sourcesController.deleteFile);


module.exports = router;
