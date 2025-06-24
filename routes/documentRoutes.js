const express = require('express');
const { sql, pool, poolConnect } = require('../config/db');
const {BlobServiceClient} = require('@azure/storage-blob');
const { QueueServiceClient } = require("@azure/storage-queue");
const {v4: uuidv4} = require('uuid');
const { sendEmail } = require('../agents/routerAgent');
const router = express.Router();

const blobServiceClient= BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
const containerClient=blobServiceClient.getContainerClient('documents');


const queueServiceClient = QueueServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
const ocrQueueClient = queueServiceClient.getQueueClient('ocr-queue');
const classifyQueueClient = queueServiceClient.getQueueClient('classify-queue');

router.post('/upload', async (req, res) => {
    const {userId} = req.body;
    const file=req.files?.document;
    if(!file || !userId) return res.status(400).json({message: 'File and userId are required'});
    const documentId = uuidv4();
    try{
        await poolConnect;
        const blobname=documentId+ '%' + file.name;
        const blockBlobClient = containerClient.getBlockBlobClient(blobname);
        await blockBlobClient.uploadData(file.data);
        const blobUrl = blockBlobClient.url;

        const request=pool.request();
        request.input('DocumentId',sql.UniqueIdentifier, documentId);
        request.input('UserId', sql.UniqueIdentifier, userId);
        request.input('FileName', sql.NVarChar, file.name);
        request.input('BlobUrl', sql.NVarChar, blobUrl);
        request.input('Source',sql.NVarChar, 'API');
        request.input('Status',sql.NVarChar, 'Ingested');
        request.input('IngestedAt',sql.DateTime, new Date());
        request.input('UploadDate', sql.DateTime, new Date());

        await request.query('INSERT INTO Documents (DocumentID,UserId, FileName, BlobUrl, Source, Status,IngestedAt, UploadDate) VALUES (@DocumentId, @UserId, @FileName, @BlobUrl, @Source, @Status, @IngestedAt, @UploadDate)');

        await ocrQueueClient.createIfNotExists();
        const message = Buffer.from(JSON.stringify({ documentId, blobUrl })).toString('base64');
        await ocrQueueClient.sendMessage(message);

        res.status(201).json({message: 'File uploaded successfully',blobUrl, documentId});
    }
    catch(err)
    {
        res.status(500).json({message: 'File upload failed', error: err.message});
        console.error(err);
    }
});
router.put('/:id/extracted', async (req, res) => {
    const documentId = req.params.id;
    const { ocrTimeSeconds,extractedText } = req.body;
    if (!ocrTimeSeconds && ocrTimeSeconds !== 0) {
        return res.status(400).json({ message: 'ocrTimeSeconds is required' });
    }

    try {
        await poolConnect;
        const request = pool.request();
        request.input('DocumentId', sql.UniqueIdentifier, documentId);
        request.input('ExtractedAt', sql.DateTime, new Date());
        request.input('Status', sql.NVarChar, 'Extracted');
        request.input('ExtractedText',sql.NVarChar,extractedText)
        request.input('OcrTimeSeconds', sql.Float, ocrTimeSeconds);
        request.input('LastUpdated', sql.DateTime, new Date());

        await request.query(`
            UPDATE Documents
            SET ExtractedAt = @ExtractedAt,
                Status = @Status,
                OcrTimeSeconds = @OcrTimeSeconds,
                ExtractedText = @ExtractedText,
                LastUpdated = @LastUpdated
            WHERE DocumentId = @DocumentId
        `);

        res.status(200).json({ message: 'Document marked as Extracted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Extraction update failed', error: err.message });
    }
});

router.put('/:id/classified', async (req, res) => {
    const documentId = req.params.id;
    const {type,confidence,agentTime } = req.body;

    if (agentTime === undefined || confidence === undefined || !type) {
        return res.status(400).json({ message: 'agentTime, confidence, and type are required' });
    }

    try {
        await poolConnect;
        const request = pool.request();
        request.input('DocumentId', sql.UniqueIdentifier, documentId);
        request.input('ClassifiedAt', sql.DateTime, new Date());
        request.input('Status', sql.NVarChar, 'Classified');
        request.input('AgentTime', sql.Float, agentTime);
        request.input('Confidence', sql.Float, confidence);
        request.input('Type', sql.NVarChar, type);
        request.input('LastUpdated', sql.DateTime, new Date());

        await request.query(`
            UPDATE Documents
            SET ClassifiedAt = @ClassifiedAt,
                Status = @Status,
                AgentTime = @AgentTime,
                Confidence = @Confidence,
                Type = @Type,
                LastUpdated = @LastUpdated
            WHERE DocumentId = @DocumentId
        `);

        res.status(200).json({ message: 'Document marked as Classified' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Classification update failed', error: err.message });
    }
});

router.put('/:id/routed', async (req, res) => {
    const documentId = req.params.id;

    try {
        await poolConnect;
        const request = pool.request();
        request.input('DocumentId', sql.UniqueIdentifier, documentId);
        request.input('RoutedAt', sql.DateTime, new Date());
        request.input('Status', sql.NVarChar, 'Routed');
        request.input('LastUpdated', sql.DateTime, new Date());

        await request.query(`
            UPDATE Documents
            SET RoutedAt = @RoutedAt,
                Status = @Status,
                LastUpdated = @LastUpdated
            WHERE DocumentId = @DocumentId
        `);

        res.status(200).json({ message: 'Document marked as Routed' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Routing update failed', error: err.message });
    }
});
router.put('/:id/error', async (req, res) => {
    const documentId = req.params.id;
    const { errorMessage } = req.body;

    try {
        await poolConnect;
        const request = pool.request();
        request.input('DocumentId', sql.UniqueIdentifier, documentId);
        request.input('Status', sql.NVarChar, 'error');
        request.input('ErrorMessage',sql.NVarChar, errorMessage);
        request.input('LastUpdated', sql.DateTime, new Date());

        await request.query(`
            UPDATE Documents
            SET Status = @Status,
                ErrorMessage = @ErrorMessage,
                LastUpdated = @LastUpdated
            WHERE DocumentId = @DocumentId
        `);

        res.status(200).json({ message: 'Document marked as Routed' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error update failed', error: err.message });
    }
});

router.get('/:id/bloburl', async(req,res)=>{
    const documentId= req.params.id;
    try{
        await poolConnect;
        const request=pool.request();
        request.input('DocumentId',sql.UniqueIdentifier, documentId);
        const result=await request.query('SELECT * FROM Documents WHERE DocumentId = @DocumentId');
        if(result.recordset.length==0)
        {
            return res.status(404).json({message:'Document not found'});
        }
        const document=result.recordset[0];
        res.status(200).json({
            blobUrl: document.BlobUrl,
            fileName: document.FileName,
        });
    }
    catch(err)
    {
        res.status(500).json({message: 'Failed to fetch document', error: err.message});
        console.error(err);
    }

});

//getAllDetails

router.get('/getAllDetails',async(req,res)=>{
    try{
        await poolConnect;
        const request=pool.request();
        const result = await request.query('SELECT * FROM Documents');
        if(result.recordset.length === 0) {
            return res.status(404).json({message: 'No documents found'});
        }
        res.status(200).json(result.recordset);
    }
    catch(err)
    {
        res.status(500).json({message: 'Failed to fetch the Document details',error: err.message});
    }

});

//post by DocumentId to reextarct

router.post('/:id/reextract',async(req,res)=>{
    const documentId =req.params.id;
    const { blobUrl }=req.body;
    if(!blobUrl) return res.status(400).json({message: 'Blob URL is required'});
    try{
        await ocrQueueClient.createIfNotExists();
        const message = Buffer.from(JSON.stringify({ documentId, blobUrl })).toString('base64');
        await ocrQueueClient.sendMessage(message);
        return res.status(200).json({message: 'Re-extraction request sent successfully'});
    }
    catch(err)
    {
        return res.status(500).json({message: 'Failed to re-extract the document', error: err.message});
    }
});

router.post('/:id/reclassify',async(req,res)=>{
    const documentId=req.params.id;
    const {extractedText} = req.body;
    if(!extractedText) return res.status(400).json({message: 'Extracted text is required for reclassification'});
    try{
        await classifyQueueClient.createIfNotExists();
        const message = Buffer.from(JSON.stringify({ documentId, extractedText })).toString('base64');
        await classifyQueueClient.sendMessage(message);
        return res.status(200).json({message: 'Re-classification request sent successfully'});
    }
    catch(err)
    {
        return res.status(500).json({message: 'Failed to re-classify the document', error: err.message});
    }
});

router.put('/:id/ManualRoute',async(req,res)=>{
    const documentId = req.params.id;
    const { type,blobUrl,fileName } = req.body;
    if (!type || !blobUrl || !fileName) {
        return res.status(400).json({ message: 'Type, blobUrl, and fileName are required' });
    }
    try{
        await poolConnect;
        const request = pool.request();
        request.input('DocumentId', sql.UniqueIdentifier, documentId);
        request.input('Status', sql.NVarChar, 'ManualRouting');
        request.input('Type', sql.NVarChar, type);
        request.input('LastUpdated', sql.DateTime, new Date());
        const resultString = await sendEmail(type,undefined,blobUrl,fileName);
        if (resultString !== "Succeeded") {
          throw new Error("Email sending failed");
        }
        await request.query(`update Documents set Status = @Status, Type=@Type, LastUpdated = @LastUpdated where DocumentId = @DocumentId`);
        res.status(200).json({ message: 'Email sent for manual routing' });
    }
    catch(err)
    {
        return res.status(500).json({message: 'Failed to send email for manual routing', error: err.message});
    }

});

//get document Details by DocumentId
router.get('/:id',async(req,res)=>{
    const documentId = req.params.id;
    try{
        await poolConnect;
        const request=pool.request();
        request.input('DocumentId', sql.UniqueIdentifier, documentId);
        const result= await request.query('Select * from Documents where DocumentId = @DocumentId');
        if(result.recordset.length ===0)
        {
            return res.status(404).json({message: 'Document not found'});
        }
        return res.status(200).json(result.recordset[0]);
    }
    catch(err)
    {
        return res.status(500).json({message: 'Failed to fetch document details', error: err.message});
    }
});

//get document by userId
router.get('/user/:userId', async (req, res) => {
  const userId = req.params.userId;
  try {
    await poolConnect;
    const request = pool.request();
    request.input('UserId', sql.UniqueIdentifier, userId);
    
    const result = await request.query('SELECT * FROM Documents WHERE UserId = @UserId');

    if (!result.recordset || result.recordset.length === 0) {
      return res.status(404).json({ message: 'No documents found for this user' });
    }

    res.status(200).json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch documents for user', error: err.message });
  }
});
//get fileDetails for admin portal

router.get('/getDetails', async (req, res) => {
  try {
    await poolConnect;
    const request = pool.request();

    const result = await request.query(`
      SELECT 
        DocumentId,
        FileName,
        Source,
        Status,
        Type,
        Confidence,
        BlobUrl
      FROM Documents
    `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'No documents found' });
    }

    res.status(200).json(result.recordset);
  } catch (err) {
    res.status(500).json({
      message: 'Failed to fetch document details',
      error: err.message,
    });
  }
});


module.exports = router;