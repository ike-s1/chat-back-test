const File = require('../models/Files');
const Link = require('../models/LinksSchema');
const QnA = require('../models/QnA');
const Text = require('../models/Text');
const r2Service = require('./r2Service');
const openAIAgentService = require('./openaiAgent');
const { extractTextFromUrl } = require('../utils/crawl');
const fs = require('fs');
const { MAX_TOTAL_LINKS } = require('../constants/limits');


async function getNewData(assistantId) {
  const [newFiles, allLinks, newQnAs, newTexts] = await Promise.all([
    File.find({ assistantId, mark: 'new' }),
    Link.find({ assistantId }), 
    QnA.find({ assistantId, mark: 'new' }),
    Text.find({ assistantId, mark: 'new' }),
  ]);

  const totalLinksCount = allLinks.length;

  if (totalLinksCount > MAX_TOTAL_LINKS) {
    throw new Error(
      `Link limit exceeded: ${totalLinksCount}/${MAX_TOTAL_LINKS} links exist. Please delete some before adding more.`
    );
  }

  const newLinks = allLinks.filter(link => link.mark === 'new');

  return { newFiles, newLinks, newQnAs, newTexts };
}

async function processAssistantData(assistant) {
  const { newFiles, newLinks, newQnAs, newTexts } = await getNewData(assistant._id);
  const errors = [];

  for (const file of newFiles) {
    try {
      let fileKey = await processFile(assistant, file);
      file.mark = 'trained';
      file.openai_storage_key = fileKey;
      await file.save();
    } catch (e) {
      file.mark = 'failed';
      await file.save();
      console.error('File error:', e);
      errors.push(e);
    }
  }

  for (const link of newLinks) {
    try {
      let result = await processLink(assistant, link);
      link.mark =  result?.failed ? 'failed' :'trained';
      link.r2_file_key = result.r2key;
      link.openai_storage_key = result.linkFileId;
      await link.save();
    } catch (e) {
      link.mark = 'failed';
      await link.save();
      console.error('Link error:', e);
      errors.push(e);
    }
  }

  try {
    await processQnA(assistant, newQnAs);
  } catch (e) {
    for (const qna of newQnAs) {
      qna.mark = 'failed';
      await qna.save();
    }
    console.error('QnA error:', e);
    errors.push(e);
  }

  for (const text of newTexts) {
    try {
      let textFileId = await processText(assistant, text);
      text.mark = 'trained';
      text.openai_storage_key = textFileId;
      await text.save();
    } catch (e) {
      text.mark = 'failed';
      await text.save();
      console.error('Text error:', e);
      errors.push(e);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Processing failed for ${errors.length} item(s). Check logs for details.`);
  }
}

async function processFile(assistant, fileDoc) {
  const { buffer } = await r2Service.readFile(fileDoc.r2_file_key);
  fileDoc.size = buffer.length;
  const tmpPath = await openAIAgentService.writeBufferToTempFile(buffer, fileDoc.name);
  let fileStorageId;

  try {
    if (!assistant.vectorStoreId) {
      const vectorStore = await openAIAgentService.createVectorStoreWithFiles(tmpPath);
      assistant.vectorStoreId = vectorStore.id;
      await assistant.save();
    } else {
      fileStorageId = await openAIAgentService.addFileToVectorStore(assistant.vectorStoreId, tmpPath);
    }

    await openAIAgentService.updateAssistantWithVectorStore(assistant.vectorStoreId, assistant.openaiAssistantId);
    return fileStorageId;
  } finally {
    await fs.promises.unlink(tmpPath).catch(() => {});
  }
}

async function processLink(assistant, link) {
  const page = await extractTextFromUrl(link?.name);
  if (!page || !page.content || !page.url) {
    return {
      link: link?.name || null,
      failed: true
    };
  }

  let vectorStoreId = assistant.vectorStoreId;
  let linkFileId;

  const filename = `page-${sanitizeFilename(page.url)}.txt`;
  const contentBuffer = Buffer.from(page.content, 'utf8');
  link.size = contentBuffer.length;
  const r2Key = r2Service.generateUniqueId('txt');
  let r2Result = await r2Service.uploadFile(contentBuffer, r2Key, 'text/plain');

  const tmpPath = await openAIAgentService.writeBufferToTempFile(contentBuffer, filename);

  try {
    if (!vectorStoreId) {
      const vectorStore = await openAIAgentService.createVectorStoreWithFiles(tmpPath);
      vectorStoreId = vectorStore.id;
      assistant.vectorStoreId = vectorStoreId;
      await assistant.save();
    } else {
      linkFileId = await openAIAgentService.addFileToVectorStore(vectorStoreId, tmpPath);
    }

    await openAIAgentService.updateAssistantWithVectorStore(vectorStoreId, assistant.openaiAssistantId);

    return {
      link: page.url,
      r2key: r2Key,
      failed: !r2Result,
      linkFileId: linkFileId,
    };
  } finally {
    await fs.promises.unlink(tmpPath).catch(() => {});
  }
}

async function processQnA(assistant, qnaDocs) {
  if (qnaDocs.length === 0) return;

  let allQnA = await QnA.find({ assistantId: assistant._id });
  const content = allQnA.map((qna) => `Q: ${qna.question}\nA: ${qna.answer}`).join('\n\n---\n\n');
  const buffer = Buffer.from(content, 'utf-8');
  const tmpPath = await openAIAgentService.writeBufferToTempFile(buffer, 'all_qnas.txt');

  const openaiStorageKey = allQnA.find(qna => qna.openai_storage_key)?.openai_storage_key || null;
  let vectorStoreId = assistant.vectorStoreId;
  let qnaFileId;

  try {
    if (!vectorStoreId) {
      const vectorStore = await openAIAgentService.createVectorStoreWithFiles(tmpPath);
      vectorStoreId = vectorStore.id;
      assistant.vectorStoreId = vectorStoreId;
      await assistant.save();
    } else {
      if (openaiStorageKey) {
        await openAIAgentService.deleteFileFromVectorStore(vectorStoreId, openaiStorageKey);
      }

      qnaFileId = await openAIAgentService.addFileToVectorStore(vectorStoreId, tmpPath);

      for (const qna of allQnA) {
        qna.openai_storage_key = qnaFileId;
        await qna.save();
      }
    }

    await openAIAgentService.updateAssistantWithVectorStore(vectorStoreId, assistant.openaiAssistantId);
  } finally {
    await fs.promises.unlink(tmpPath).catch(() => {});
  }

  for (const qna of qnaDocs) {
    qna.mark = 'trained';
    qna.openai_storage_key = qnaFileId;
    await qna.save();
  }
}

async function processText(assistant, textDoc) {
  const { buffer } = await r2Service.readFile(textDoc.r2_file_key);
  textDoc.size = buffer.length;
  const tmpPath = await openAIAgentService.writeBufferToTempFile(buffer, `${textDoc.name}.txt`);

  let vectorStoreId = assistant.vectorStoreId;
  let textFileId;

  try {
    if (!vectorStoreId) {
      const vectorStore = await openAIAgentService.createVectorStoreWithFiles(tmpPath);
      vectorStoreId = vectorStore.id;
      assistant.vectorStoreId = vectorStoreId;
      await assistant.save();
    } else {
      if (textDoc.openai_storage_key) {
        await openAIAgentService.deleteFileFromVectorStore(vectorStoreId, textDoc.openai_storage_key);
      }

      textFileId = await openAIAgentService.addFileToVectorStore(vectorStoreId, tmpPath);
    }

    await openAIAgentService.updateAssistantWithVectorStore(vectorStoreId, assistant.openaiAssistantId);
    return textFileId;
  } finally {
    await fs.promises.unlink(tmpPath).catch(() => {});
  }
}

function sanitizeFilename(url) {
  return url.replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

module.exports = {
  processAssistantData,
  processQnA
};
