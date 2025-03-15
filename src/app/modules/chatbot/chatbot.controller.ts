import { RequestHandler } from 'express';
import { ChatHistory } from './chatHistory.model';
import axios from 'axios';

// Define interfaces for user input and response
interface UserInputData {
    user_input: string;
}

interface ResponseData {
    response: string; // Structure of the response data from the doctor_assist API
}

// Function to send user input to the server and receive a response
async function sendUserInput(userInput: string): Promise<ResponseData> {
    const url = 'http://192.168.10.208:5500/api/doctor_assist/';
    const data: UserInputData = { user_input: userInput };

    try {
        const response = await axios.post<ResponseData>(url, data);
        return response.data; // Return the response data
    } catch (error) {
        throw new Error('Error occurred while sending request: ' + (error as any).message);
    }
}

// Handle chat message route
export const handleChatMessage: RequestHandler = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { userMessage, chatId } = req.body; // Extract userMessage and chatId from the request body

        // Validate required fields
        if (!userId || !userMessage) {
            res.status(400).json({ success: false, message: 'Missing required data.' });
            return;
        }

        let chatHistory = chatId ? await ChatHistory.findById(chatId) : null;

        // Start a new chat session if not found
        if (!chatHistory) {
            chatHistory = new ChatHistory({
                userId,
                chat_contents: [],
            });
        }

        // Generate unique message IDs
        const userMessageId = getNextMessageId(chatHistory.chat_contents);

        // Call the sendUserInput function to get the bot's response
        const botResponse = await sendUserInput(userMessage);

        // Save the user message and bot response to the chat history
        const botMessageId = userMessageId + 1;

        // Push both messages to the chat history
        chatHistory.chat_contents.push(
            { id: userMessageId, sent_by: 'User', text_content: userMessage, timestamp: new Date() },
            { id: botMessageId, sent_by: 'Bot', text_content: botResponse.response, timestamp: new Date(), is_liked: false }
        );

        // Save the chat history to the database
        await chatHistory.save();

        // Respond with the updated chat history
        res.status(201).json({ success: true, chatHistory });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Generate a unique message ID for each new message
const getNextMessageId = (chatContents: any[]): number => {
    return chatContents.length > 0 ? chatContents[chatContents.length - 1].id + 1 : 1;
};
// Handle creating or continuing a chat session

// Fetch all chat histories for a user
export const getAllChats: RequestHandler = async (req, res) => {
  try {
    const userId = req.user?.id;

    const chatHistories = await ChatHistory.find({ userId }).select('chat_name timestamps');
    res.status(200).json({ success: true, chatHistories });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Fetch a specific chat history by ID
export const getChatHistory: RequestHandler = async (req, res) => {
  try {
    const chatId = req.params.chatId;

    const chatHistory = await ChatHistory.findById(chatId).populate('userId', 'name');
    if (!chatHistory) {
      res.status(404).json({ success: false, message: 'Chat not found.' });
      return;
    }

    res.status(200).json({ success: true, chatHistory });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};


// Update chat name
export const updateChatName: RequestHandler = async (req, res) => {
    try {
      const { chatId } = req.params;
      const { newChatName } = req.body;
  
      if (!newChatName) {
        res.status(400).json({ success: false, message: 'New chat name is required.' });
        return;
      }
  
      const chatHistory = await ChatHistory.findByIdAndUpdate(
        chatId,
        { chat_name: newChatName },
        { new: true }
      );
  
      if (!chatHistory) {
        res.status(404).json({ success: false, message: 'Chat not found.' });
        return;
      }
  
      res.status(200).json({ success: true, chatHistory });
    } catch (error) {
      const err = error as Error;
      res.status(500).json({ success: false, message: err.message });
    }
  };
  
  // Toggle the is_liked status for bot messages
  export const toggleBotResponseLikeStatus: RequestHandler = async (req, res) => {
    try {
      const { chatId, messageId } = req.params;
  
      const chatHistory = await ChatHistory.findById(chatId);
      if (!chatHistory) {
        res.status(404).json({ success: false, message: 'Chat not found.' });
        return;
      }
  
      const message = chatHistory.chat_contents.find(
        (content) => content.id === parseInt(messageId) && content.sent_by === 'Bot'
      );
  
      if (!message) {
        res.status(404).json({ success: false, message: 'Bot message not found.' });
        return;
      }
  
      message.is_liked = !message.is_liked; // Toggle the like status
  
      await chatHistory.save();
      res.status(200).json({ success: true, message: 'Bot response like status updated.', chatHistory });
    } catch (error) {
        const err = error as Error;
        res.status(500).json({ success: false, message: err.message });
      }
  };
  
  // Delete chat by ID
  export const deleteChat: RequestHandler = async (req, res) => {
    try {
      const { chatId } = req.params;
  
      const chatHistory = await ChatHistory.findByIdAndDelete(chatId);
      if (!chatHistory) {
        res.status(404).json({ success: false, message: 'Chat not found.' });
        return;
      }
  
      res.status(200).json({ success: true, message: 'Chat deleted successfully.' });
    } catch (error) {
        const err = error as Error;
        res.status(500).json({ success: false, message: err.message });
      }
  };