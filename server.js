require('dotenv').config();
const express = require('express');
const cors= require('cors');
const fileUpload = require('express-fileupload');
const authRoutes = require('./routes/authRoutes');
const documentRoutes = require('./routes/documentRoutes');
const dbAgent=require("./workers/dbWorker")
const emailRoutes=require('./email');


const app = express();

app.use(express.json());
app.use(fileUpload());
app.use(cors({
  origin: 'http://localhost:4200',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));


app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/bot',dbAgent);

require('./workers/ocrworker');
require('./workers/classifyWorker');
require('./workers/routerworker');

app.get('/', (req, res) => {
  res.send('📄 Document Ingestion API is running...');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});