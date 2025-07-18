// r2Service.js
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const crypto = require('crypto');
const logger = require('../logger');
const config = require('../config');

const r2Client = new S3Client({
  region: 'auto',
  endpoint: config.r2.endpoint,
  credentials: {
    accessKeyId: config.r2.accessKeyId,
    secretAccessKey: config.r2.secretAccessKey,
  },
});

const BUCKET = config.r2.bucket;

async function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', (err) => reject(err));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

module.exports = {
  generateUniqueId(ext = 'bin') {
    return crypto.randomBytes(16).toString('hex') + '.' + ext;
  },

  async uploadFile(data, key = null, contentType = 'application/octet-stream') {
    if (!data || (Buffer.isBuffer(data) && data.length === 0) || data.length === 0) {
      logger.warn('Skipping upload to R2: file is empty');
      return null; 
    }
  
    if (!key) key = this.generateUniqueId();
    const params = {
      Bucket: BUCKET,
      Key: key,
      Body: data,
      ContentType: contentType,
    };
    try {
      await r2Client.send(new PutObjectCommand(params));
      return key;
    } catch (error) {
      logger.error('Error uploading file to R2:', error);
      throw error;
    }
  },

  async readFile(key) {
    const params = {
      Bucket: BUCKET,
      Key: key,
    };
    try {
      const response = await r2Client.send(new GetObjectCommand(params));
      const buffer = await streamToBuffer(response.Body);
      const contentType = response.ContentType || 'application/octet-stream';
      return { buffer, contentType };
    } catch (error) {
      logger.error('Error reading file from R2:', error);
      throw error;
    }
  },

  async updateFile(key, newData, contentType = 'application/octet-stream') {
    const params = {
      Bucket: BUCKET,
      Key: key,
      Body: newData,
      ContentType: contentType,
    };
    try {
      await r2Client.send(new PutObjectCommand(params));
    } catch (error) {
      logger.error('Error updating file in R2:', error);
      throw error;
    }
  },

  async deleteFile(key) {
    const params = {
      Bucket: BUCKET,
      Key: key,
    };
    try {
      await r2Client.send(new DeleteObjectCommand(params));
    } catch (error) {
      logger.error('Error deleting file from R2:', error);
      throw error;
    }
  },

  async exists(key) {
    const params = {
      Bucket: BUCKET,
      Key: key,
    };
    try {
      await r2Client.send(new HeadObjectCommand(params));
      return true;
    } catch (error) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      logger.error('Error checking file existence in R2:', error);
      throw error;
    }
  },
};
