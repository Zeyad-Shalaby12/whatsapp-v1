const express = require('express');
const { makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const path = require('path');
const fs = require('fs');
const qrcode = require('qrcode');
const cors = require('cors');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// تعديل مسارات الملفات لتتوافق مع Vercel
const sessionsDir = path.join('/tmp', 'sessions');
const uploadsDir = path.join('/tmp', 'uploads');

[path.join(__dirname, 'public'), sessionsDir, uploadsDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Multer configuration for file uploads
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `image-${Date.now()}${ext}`);
    }
  }),
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed!'), false);
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// Sessions management
const sessions = {};

async function connectToWhatsApp(sessionId) {
  const sessionPath = path.join(sessionsDir, sessionId);
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

  const socket = makeWASocket({
    auth: state,
    printQRInTerminal: true,
  });

  sessions[sessionId] = {
    socket,
    status: 'connecting',
    qr: null
  };

  socket.ev.on('connection.update', async (update) => {
    const { connection, qr } = update;

    if (qr) {
      sessions[sessionId].qr = qr;
      sessions[sessionId].status = 'qr';
      await qrcode.toFile(
        path.join(__dirname, 'public', `qrcode-${sessionId}.png`), 
        qr, { scale: 8 }
      );
    }

    if (connection === 'open') {
      sessions[sessionId].status = 'connected';
      sessions[sessionId].qr = null;
    } else if (connection === 'close') {
      sessions[sessionId].status = 'disconnected';
      setTimeout(() => connectToWhatsApp(sessionId), 5000); // Reconnect after 5s
    }
  });

  socket.ev.on('creds.update', saveCreds);

  return socket;
}

// API Routes
app.get('/api/sessions', (req, res) => {
  res.json(Object.keys(sessions).map(id => ({
    id,
    status: sessions[id].status
  })));
});

app.post('/api/sessions', async (req, res) => {
  const sessionId = req.body.id || `session-${Date.now()}`;
  if (sessions[sessionId]) {
    return res.status(400).json({ error: 'Session already exists' });
  }
  
  await connectToWhatsApp(sessionId);
  res.json({ id: sessionId, status: 'connecting' });
});

app.get('/api/sessions/:id/status', (req, res) => {
  const session = sessions[req.params.id];
  if (!session) return res.status(404).json({ error: 'Session not found' });
  
  res.json({
    status: session.status,
    qr: session.qr ? `/qrcode-${req.params.id}.png` : null
  });
});

app.post('/api/sessions/:id/send-message', async (req, res) => {
  const session = sessions[req.params.id];
  if (!session) return res.status(404).json({ error: 'Session not found' });
  if (session.status !== 'connected') {
    return res.status(400).json({ error: 'Session not connected' });
  }

  const { number, message } = req.body;
  const formattedNumber = number.replace(/\D/g, '') + '@s.whatsapp.net';

  try {
    await session.socket.sendMessage(formattedNumber, { text: message });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/sessions/:id/send-image', upload.single('image'), async (req, res) => {
  const session = sessions[req.params.id];
  if (!session) return res.status(404).json({ error: 'Session not found' });
  if (session.status !== 'connected') {
    return res.status(400).json({ error: 'Session not connected' });
  }

  const { number, caption } = req.body;
  const formattedNumber = number.replace(/\D/g, '') + '@s.whatsapp.net';

  try {
    await session.socket.sendMessage(formattedNumber, {
      image: { url: req.file.path },
      caption: caption || ''
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve React frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// تعديل طريقة تشغيل السيرفر
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;