import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { createServer } from 'http';
import mongoose from 'mongoose';
import { initializeSocketIO } from './socketIO';
import appRoutes from './app/server';
import subscriptionWebhook from './app/modules/subscription/subscription.controller';

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 5001;

// Use raw middleware only for the Stripe webhook
app.use('/api/subscription/stripe', express.raw({ type: 'application/json' }), subscriptionWebhook);

// Apply JSON parsing globally for other routes
app.use(express.json());
app.use('/api', appRoutes);

initializeSocketIO(server);

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI as string)
  .then(() => console.log('Database connected'))
  .catch((err) => console.error('Database connection error:', err));

// Start the server
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
