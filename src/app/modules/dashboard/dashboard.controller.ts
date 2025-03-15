import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { User, IUser } from '../user/user.model';
import { ChatHistory } from '../chatbot/chatHistory.model';
import { Subscription } from '../subscription/subscription.model';
import { Package } from '../subscription/package.model';
import { uploadImage } from '../../utils/cloudinary';
import fs from 'fs/promises';
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2024-12-18.acacia',
});

// Task 1: Get all users with subscription details
export const getAllUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const users = await User.find().select('name email role createdAt');
    const subscriptions = await Subscription.find().populate('package');

    const userData = users.map((user) => {
      const typedUser = user as IUser & { _id: mongoose.Types.ObjectId };
      const subscription = subscriptions.find((sub) => sub.user.toString() === typedUser._id.toString());
      const packageDetails = subscription?.package as any;
      const amount = subscription?.amountPaid || (packageDetails ? packageDetails.amount / 100 : 0);
      return {
        name: typedUser.name,
        email: typedUser.email,
        subscriptionType: packageDetails ? packageDetails.subscriptionType : 'None',
        status: subscription
          ? subscription.trialActive
            ? 'Trial'
            : subscription.endDate > new Date()
            ? 'Active'
            : 'Expired'
          : 'None',
        amount: `$${amount.toFixed(2)}`,
      };
    });

    // Task 2: Calculate total revenue, total users, active users
    const totalUsers = users.length;
    const totalActiveUsers = subscriptions.filter(
      (sub) => sub.endDate > new Date() && !sub.trialActive
    ).length;
    const totalRevenue = subscriptions.reduce((sum, sub) => {
      const pkg = sub.package as any;
      const amount = sub.amountPaid || (pkg.amount / 100);
      return sub.endDate > new Date() && !sub.trialActive ? sum + amount : sum;
    }, 0);

    // Task 2: Monthly revenue and user growth (filterable by year)
    const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();
    const monthlyRevenue = await Subscription.aggregate([
      { $match: { startDate: { $gte: new Date(`${year}-01-01`), $lte: new Date(`${year}-12-31`) } } },
      {
        $lookup: {
          from: 'packages',
          localField: 'package',
          foreignField: '_id',
          as: 'package',
        },
      },
      { $unwind: '$package' },
      {
        $group: {
          _id: { $month: '$startDate' },
          revenue: {
            $sum: {
              $cond: [
                { $and: [{ $gt: ['$endDate', new Date()] }, { $eq: ['$trialActive', false] }] },
                { $ifNull: ['$amountPaid', { $divide: ['$package.amount', 100] }] },
                0
              ]
            }
          },
        },
      },
      { $sort: { '_id': 1 } },
    ]);

    const monthlyUserGrowth = await User.aggregate([
      { $match: { createdAt: { $gte: new Date(`${year}-01-01`), $lte: new Date(`${year}-12-31`) } } },
      {
        $group: {
          _id: { $month: '$createdAt' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id': 1 } },
    ]);

    res.status(200).json({
      success: true,
      users: userData,
      totalRevenue: totalRevenue.toFixed(2),
      totalUsers,
      totalActiveUsers,
      revenueChart: monthlyRevenue,
      growth: monthlyUserGrowth,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};

// ... (rest of the controller remains unchanged)

// Task 1: Suspend a user's subscription
export const suspendUserSubscription = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    const subscription = await Subscription.findOne({ user: userId });
    if (!subscription) {
      res.status(404).json({ success: false, message: 'Subscription not found.' });
      return;
    }

    if (subscription.trialActive) {
      res.status(400).json({ success: false, message: 'Cannot suspend a subscription in trial period.' });
      return;
    }

    // Suspend by setting endDate to now
    subscription.endDate = new Date();
    await subscription.save();

    res.status(200).json({ success: true, message: 'Subscription suspended successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};

// Get user details with chat history
export const getUserDetails = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).select('-password');
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found.' });
      return;
    }

    const chatHistory = await ChatHistory.find({ userId }).select('chat_name chat_contents timestamps');
    const subscription = await Subscription.findOne({ user: userId }).populate('package');

    res.status(200).json({
      success: true,
      user: {
        ...user.toObject(),
        subscription: subscription
          ? {
              subscriptionType: (subscription.package as any).subscriptionType,
              status: subscription.trialActive
                ? 'Trial'
                : subscription.endDate > new Date()
                ? 'Active'
                : 'Expired',
              amount: `$${(subscription.package as any).amount / 100}`,
              startDate: subscription.startDate,
              endDate: subscription.endDate,
              trialActive: subscription.trialActive,
            }
          : null,
      },
      chatHistory,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};

// Delete a conversation
export const deleteConversation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { conversationId } = req.params;

    const conversation = await ChatHistory.findById(conversationId);
    if (!conversation) {
      res.status(404).json({ success: false, message: 'Conversation not found.' });
      return;
    }

    await ChatHistory.findByIdAndDelete(conversationId);

    res.status(200).json({ success: true, message: 'Conversation deleted successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};

// Task 3: Upload hero section image
export const uploadHeroImage = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, message: 'No file uploaded' });
      return;
    }

    const result = await uploadImage(req.file.path); // Upload to Cloudinary
    await fs.unlink(req.file.path); // Clean up local file

    const heroImageUrl = result.secure_url;

    res.status(200).json({ success: true, heroImageUrl });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};