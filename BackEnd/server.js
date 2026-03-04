require('dotenv').config();
const { botResponse } = require('./chatServer.js');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const corsOptions = {
  origin: [
    // Local development
    'http://127.0.0.1:5500',
    'http://localhost:5500',
    'http://127.0.0.1:3000',
    'http://localhost:3000',
    // Production — Vercel
    'https://kelir786.vercel.app',
    'https://kelir786-srigobu247-2315s-projects.vercel.app',
    // Production — Custom domain
    'https://www.kelir.sg247.dev',
    'https://kelir.sg247.dev'
  ],
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

const app = express();
app.use(express.json());
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

// ─── Schemas ──────────────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  name:      { type: String, required: true },
  email:     { type: String, required: true, unique: true },
  password:  { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const chatSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  messages:  [{
    role:      { type: String, enum: ['user', 'bot'] },
    content:   String,
    timestamp: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Chat = mongoose.model('Chat', chatSchema);

// ─── Request-Limit Schema ─────────────────────────────────────────────────────
const requestLimitSchema = new mongoose.Schema({
  userId:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  dailyCount:     { type: Number, default: 0 },
  monthlyCount:   { type: Number, default: 0 },
  lastResetDay:   { type: String, default: '' },  // 'YYYY-MM-DD'
  lastResetMonth: { type: String, default: '' },  // 'YYYY-MM'
});

const RequestLimit = mongoose.model('RequestLimit', requestLimitSchema);

// ─── Auth Middleware ──────────────────────────────────────────────────────────
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer '))
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

// ─── Rate-Limiter Middleware ─────────────────────────────────────────────────
const DAILY_LIMIT   = 32;
const MONTHLY_LIMIT = 960;

const rateLimiter = async (req, res, next) => {
  try {
    const now        = new Date();
    const todayStr   = now.toISOString().slice(0, 10);          // 'YYYY-MM-DD'
    const monthStr   = now.toISOString().slice(0, 7);           // 'YYYY-MM'

    let record = await RequestLimit.findOne({ userId: req.user.id });
    if (!record) {
      record = new RequestLimit({
        userId:         req.user.id,
        dailyCount:     0,
        monthlyCount:   0,
        lastResetDay:   todayStr,
        lastResetMonth: monthStr,
      });
    }

    // ── Reset daily count when the day has changed ──
    if (record.lastResetDay !== todayStr) {
      record.dailyCount   = 0;
      record.lastResetDay = todayStr;
    }

    // ── Reset monthly count when the month has changed ──
    if (record.lastResetMonth !== monthStr) {
      record.monthlyCount   = 0;
      record.lastResetMonth = monthStr;
    }

    // ── Enforce limits ──
    if (record.dailyCount >= DAILY_LIMIT) {
      await record.save();
      return res.status(429).json({
        success: false,
        message: `Daily request limit of ${DAILY_LIMIT} reached. Resets tomorrow.`,
        dailyCount:   record.dailyCount,
        monthlyCount: record.monthlyCount,
      });
    }

    if (record.monthlyCount >= MONTHLY_LIMIT) {
      await record.save();
      return res.status(429).json({
        success: false,
        message: `Monthly request limit of ${MONTHLY_LIMIT} reached. Resets next month.`,
        dailyCount:   record.dailyCount,
        monthlyCount: record.monthlyCount,
      });
    }

    // ── Increment counts ──
    record.dailyCount   += 1;
    record.monthlyCount += 1;
    await record.save();

    // Attach usage info so routes can forward it if needed
    req.usageStats = {
      dailyCount:    record.dailyCount,
      monthlyCount:  record.monthlyCount,
      dailyLimit:    DAILY_LIMIT,
      monthlyLimit:  MONTHLY_LIMIT,
    };

    next();
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Routes ───────────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.send('Server is Running'));

// Register
app.post('/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ success: false, message: 'All fields required' });

    const exists = await User.findOne({ email });
    if (exists)
      return res.status(400).json({ success: false, message: 'Email already registered' });

    const hashed = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email, password: hashed });
    const token = jwt.sign({ id: user._id, name: user.name, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({ success: true, token, user: { id: user._id, name: user.name, email: user.email } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Login
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ success: false, message: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ success: false, message: 'Invalid credentials' });

    const token = jwt.sign({ id: user._id, name: user.name, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, token, user: { id: user._id, name: user.name, email: user.email } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Chat
app.post('/user', authMiddleware, rateLimiter, async (req, res) => {
  try {
    const { userMessage, sessionId } = req.body;
    if (!userMessage || typeof userMessage !== 'string' || !userMessage.trim())
      return res.status(400).json({ success: false, message: 'Message is required' });

    const [botMsg] = await Promise.all([
      botResponse(userMessage),
      new Promise(r => setTimeout(r, 2000 + Math.random() * 1000))
    ]);

    let chat;
    if (sessionId) {
      // ── Ownership check: only load the session if it belongs to this user ──
      chat = await Chat.findOne({ _id: sessionId, userId: req.user.id });
    }
    if (!chat) {
      chat = new Chat({ userId: req.user.id, messages: [] });
    }
    chat.messages.push({ role: 'user', content: userMessage.trim() });
    chat.messages.push({ role: 'bot',  content: botMsg });
    await chat.save();

    res.json({ success: true, userMessage, botMessage: botMsg, sessionId: chat._id, usage: req.usageStats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get chat history (list of sessions)
app.get('/history', authMiddleware, async (req, res) => {
  try {
    const chats = await Chat.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json({ success: true, chats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get a single chat session
app.get('/history/:id', authMiddleware, async (req, res) => {
  try {
    const chat = await Chat.findOne({ _id: req.params.id, userId: req.user.id });
    if (!chat) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, chat });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delete a chat session
app.delete('/history/:id', authMiddleware, async (req, res) => {
  try {
    await Chat.deleteOne({ _id: req.params.id, userId: req.user.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});

// ─── MongoDB + Server Startup ─────────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
.then(() => {
  console.log('MongoDB connected → chatbot database');
})
.catch(err => {
  console.error('MongoDB connection error:', err.message);
  process.exit(1);
});