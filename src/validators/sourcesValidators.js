const { body } = require('express-validator');

exports.addLinksValidation = [
  body('assistantId').notEmpty().withMessage('assistantId is required'),
  body('link').notEmpty().withMessage('link is required'),
  body('mode').notEmpty().withMessage('mode is required')
]; 