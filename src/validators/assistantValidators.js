const { body } = require('express-validator');

exports.createAssistantValidation = [
  body('name').notEmpty().withMessage('Name is required'),
  body('instructions').optional().isString()
]; 