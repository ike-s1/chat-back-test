const OpenAI = require('openai');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Assistant = require('../models/Assistant');
const CustomError = require('../middleware/CustomError');
const { ASSISTANT_INSTRUCTION } = require('../constants/asistant');
const logger = require('../logger');
const config = require('../config');

class OpenAIAgentService {
  constructor() {
    this.client = new OpenAI({
      apiKey: config.openaiApiKey,
    });
    this.AGENT_ID = config.openaiAgentId;
  }

  async createVectorStoreWithFiles(filePath) {
    try {
      const vectorStore = await this.client.vectorStores.create({ name: 'Document Store' });
      const file = await this.client.files.create({
        file: fs.createReadStream(filePath),
        purpose: 'assistants',
      });
      await this.client.vectorStores.files.createAndPoll(vectorStore.id, {
        file_id: file.id,
      });
      return vectorStore;
    } catch (error) {
      logger.error('Error creating vector store:', error);
      throw error;
    }
  }

  async createVectorStoreFromBuffer(buffer, filename) {
    const tmpPath = await this.writeBufferToTempFile(buffer, filename);
    try {
      const vectorStore = await this.createVectorStoreWithFiles(tmpPath);
      return vectorStore;
    } finally {
      await fs.promises.unlink(tmpPath).catch(() => {});
    }
  }

  async addFileToVectorStore(vectorStoreId, filePath) {
    try {
      const stats = await fs.promises.stat(filePath);
      if (stats.size === 0) {
        logger.warn(`Skipping adding file to vector store: file is empty (${filePath})`);
        return null;
      }
  
      const file = await this.client.files.create({
        file: fs.createReadStream(filePath),
        purpose: 'assistants',
      });
      await this.client.vectorStores.files.createAndPoll(vectorStoreId, {
        file_id: file.id,
      });
      return file.id;
    } catch (error) {
      logger.error('Error adding file to vector store:', error);
      throw error;
    }
  }
  async deleteFileFromVectorStore(vectorStoreId, fileId) {
    try {
      await this.client.vectorStores.files.del(vectorStoreId, fileId);
      await this.client.files.del(fileId);
    } catch (error) {
      logger.error(`Error deleting file ${fileId} from vector store ${vectorStoreId}:`, error);
      throw error;
    }
  }

  async updateAssistantWithVectorStore(vectorStoreId, assistantId) {
    try {
      await this.client.beta.assistants.update(assistantId, {
        instructions: ASSISTANT_INSTRUCTION,
        tool_resources: {
          file_search: {
            vector_store_ids: [vectorStoreId],
          },
        },
      });
    } catch (error) {
      logger.error('Error updating assistant:', error);
      throw error;
    }
  }

  async uploadFile(filePath) {
    try {
      const uploadedFile = await this.client.files.create({
        file: fs.createReadStream(filePath),
        purpose: 'assistants',
      });
      return uploadedFile.id;
    } catch (error) {
      logger.error('Error uploading file:', error);
      throw error;
    }
  }

  async uploadFileFromBuffer(buffer, filename) {
    const tmpPath = path.join(os.tmpdir(), filename);
    await fs.promises.writeFile(tmpPath, buffer);
    const fileId = await this.uploadFile(tmpPath);
    await fs.promises.unlink(tmpPath);
    return fileId;
  }

  async writeBufferToTempFile(buffer, filename) {
    const tmpPath = path.join(os.tmpdir(), `${Date.now()}-${filename}`);
    await fs.promises.writeFile(tmpPath, buffer);
    return tmpPath;
  }

  async createAssistant(userId, name, instructions) {
    const existing = await Assistant.findOne({ user: userId });
    if (existing) {
      throw new CustomError('User already has an assistant', 400);
    }

    const assistant = await this.client.beta.assistants.create({
      name,
      instructions: instructions || ASSISTANT_INSTRUCTION,
      model: "gpt-4o",
      tools: [{ type: "file_search" }]
    });

    const vectorStore = await this.client.vectorStores.create({
      name: `${name}'s Knowledge Base`
    });

    const newAssistant = new Assistant({
      user: userId,
      name,
      openaiAssistantId: assistant.id,
      vectorStoreId: vectorStore.id
    });

    await newAssistant.save();
    return newAssistant;
  }

  async chatWithAssistant(assistantId, message, threadId) {
    const assistant = await Assistant.findOne({ _id: assistantId });
    if (!assistant) {
      throw new CustomError('Assistant not found', 404);
    }

    let thread;
    if (threadId) {
      try {
        thread = await this.client.beta.threads.retrieve(threadId);
      } catch (e) {
        thread = await this.client.beta.threads.create();
        threadId = thread.id;
      }
    } else {
      thread = await this.client.beta.threads.create();
      threadId = thread.id;
    }

    await this.client.beta.threads.messages.create(thread.id, {
      role: "user",
      content: message
    });

    const run = await this.client.beta.threads.runs.create(thread.id, {
      assistant_id: assistant.openaiAssistantId
    });

    let runStatus = await this.client.beta.threads.runs.retrieve(thread.id, run.id);
    while (runStatus.status === 'in_progress' || runStatus.status === 'queued') {
      await new Promise(resolve => setTimeout(resolve, 1000));
      runStatus = await this.client.beta.threads.runs.retrieve(thread.id, run.id);
    }

    const messages = await this.client.beta.threads.messages.list(thread.id);
    const lastMessage = messages.data[0];
    let cleanedResponse = lastMessage.content[0].text.value;

    const tokenUsage = runStatus.usage?.total_tokens || 0;
    assistant.tokenUsed += tokenUsage;
    assistant.save();

    return { cleanedResponse, threadId, userId: assistant?.user };
  }

  async getThreadMessages(threadId) {
    try {
      const response = await this.client.beta.threads.messages.list(threadId);

      return response.data
        .reverse() 
        .map(msg => ({
          sender: msg.role === 'user' ? 'user' : 'assistant',
          text: msg.content?.[0]?.text?.value || '',
          createdAt: msg.created_at,
        }));
    } catch (error) {
      logger.error('Error fetching thread messages:', error);
      throw new CustomError('Failed to fetch thread messages', 500);
    }
  }
}

const openAIAgentService = new OpenAIAgentService();
module.exports = openAIAgentService;
