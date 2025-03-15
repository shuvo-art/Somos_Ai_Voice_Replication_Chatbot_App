import mongoose, { Schema, Document } from 'mongoose';

export interface IChatContent {
  id: number;
  sent_by: 'User' | 'Bot';
  text_content: string;
  timestamp: Date;
  is_liked?: boolean;
}

export interface IChatHistory extends Document {
  userId: mongoose.Types.ObjectId;
  chat_name: string;
  chat_contents: IChatContent[];
}

const ChatContentSchema: Schema = new Schema({
  id: { type: Number, required: true },
  sent_by: { type: String, enum: ['User', 'Bot'], required: true },
  text_content: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  is_liked: { type: Boolean, default: false },
});

const ChatHistorySchema: Schema = new Schema(
  {
    userId: { type: mongoose.Types.ObjectId, ref: 'User', required: true },
    chat_name: { type: String, default: 'Untitled Chat' },
    chat_contents: [ChatContentSchema],
  },
  { timestamps: true }
);

export const ChatHistory = mongoose.model<IChatHistory>('ChatHistory', ChatHistorySchema);
