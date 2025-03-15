import express from 'express';
import { 
  handleChatMessage, 
  getAllChats, 
  getChatHistory, 
  updateChatName, 
  toggleBotResponseLikeStatus, 
  deleteChat 
} from './chatbot.controller';
import { authenticate } from '../auth/auth.middleware';

const router = express.Router();

// Existing routes
router.post('/message', authenticate, handleChatMessage);
router.get('/all-chats', authenticate, getAllChats);
router.get('/history/:chatId', authenticate, getChatHistory);

// New routes
router.put('/update-chat-name/:chatId', authenticate, updateChatName); // Update chat name
router.patch('/toggle-like/:chatId/:messageId', authenticate, toggleBotResponseLikeStatus); // Change bot response like status
router.delete('/delete-chat/:chatId', authenticate, deleteChat); // Delete chat by ID

export default router;
