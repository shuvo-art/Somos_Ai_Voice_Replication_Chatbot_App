import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  email: string;
  password: string;
  name: string;
  role: string;
  profileImage?: string;
  language?: string;
}

const UserSchema: Schema = new Schema(
  {
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: { type: String, required: true },
    role: { type: String, enum: ['admin', 'user'], default: 'user' },
    profileImage: { type: String },
    language: { type: String, default: null, nullable: true },
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>('User', UserSchema);