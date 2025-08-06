import express from 'express';
import authRoutes from './modules/auth/auth.routes';
import subscriptionRoutes from './modules/subscription/subscription.routes';
import packageRoutes from './modules/subscription/package.routes';
import userRoutes from './modules/user/user.routes';
import voiceRecordingRoutes from './modules/voiceRecording/voiceRecording.routes';
import messageRoutes from './modules/messages/messages.routes';
import chatRoutes from './modules/chat/chats.routes';
import policyRoutes from './modules/policy/policy.routes';
import dashboardRoutes from './modules/dashboard/dashboard.routes';
import chatbotRoutes from './modules/chatbot/chatbot.routes';
import problemRoutes from './modules/problem/problem.routes';
import notificationRoutes from './modules/notification/notification.routes';
import { authenticate } from './modules/auth/auth.middleware';
import mongoose from 'mongoose';

const router = express.Router();

// Health check endpoints
router.get('/health', (req, res) => {
  console.log(`Health check requested at ${new Date().toISOString()}`);
  res.status(200).json({ status: 'ok' });
});

router.get('/health/db', async (req, res) => {
  try {
    // Check MongoDB connection state
    if (mongoose.connection.readyState === 1) {
      res.status(200).send('Database connection healthy');
    } else {
      console.log('Health check failed: MongoDB not connected');
      res.status(200).send('Application starting');
    }
  } catch (error) {
    console.error('Health check error:', error);
    res.status(200).send('Application starting');
  }
});

// Public routes
router.use('/auth', authRoutes);

// Authenticated routes
router.use('/user', authenticate, userRoutes);
router.use('/voice', authenticate, voiceRecordingRoutes)

router.use('/messages', authenticate, messageRoutes);
router.use('/chats', authenticate, chatRoutes);

router.use('/subscription', authenticate, subscriptionRoutes);
router.use('/package', authenticate, packageRoutes);

router.use('/notification', authenticate, notificationRoutes);

// Admin-only routes
router.use('/policy', authenticate, policyRoutes);
router.use('/dashboard', authenticate, dashboardRoutes);

// Chatbot routes for authenticated users
router.use('/chatbot', authenticate, chatbotRoutes);
router.use('/problem', problemRoutes);
export default router;
