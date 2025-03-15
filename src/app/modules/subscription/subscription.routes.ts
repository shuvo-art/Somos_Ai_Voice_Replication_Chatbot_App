import express, { Request, Response, RequestHandler } from 'express';
import Stripe from 'stripe';
import { Subscription, ISubscription } from './subscription.model';
import { User } from '../user/user.model';
import { Package } from './package.model';
import jwt from 'jsonwebtoken';
import { authenticate } from '../auth/auth.middleware';

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2024-12-18.acacia',
});

interface Params {
  userId: string;
}

// Initialize Free Subscription
router.post('/initialize', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id; // Extract userId from the authenticated user

    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized: Missing user ID.' });
      return;
    }

    const existingSubscription = await Subscription.findOne({ user: userId });
    if (existingSubscription) {
      res.status(400).json({ success: false, message: 'User already has a subscription.' });
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found.' });
      return;
    }

    const freePackage = await Package.findOne({ subscriptionType: 'Monthly', status: 'Active', amount: 0 });
    if (!freePackage) {
      res.status(500).json({ success: false, message: 'No active free package available.' });
      return;
    }

    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(startDate.getMonth() + 1);

    const subscription = new Subscription({
      user: userId,
      package: freePackage._id,
      startDate,
      endDate,
      trialActive: false
    });

    await subscription.save();

    res.status(201).json({ success: true, subscription });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create Stripe session with one-day free trial
router.post('/stripe-session', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { packId } = req.body;

    if (!userId) {
      res.status(400).json({ success: false, message: 'User ID is missing.' });
      return;
    }

    const selectedPackage = await Package.findOne({ packId, status: 'Active' });
    if (!selectedPackage) {
      res.status(404).json({ success: false, message: 'Package not found or suspended.' });
      return;
    }

    if (!selectedPackage.stripePriceId || !selectedPackage.stripePriceId.startsWith('price_')) {
      res.status(500).json({ success: false, message: 'Package does not have a valid Stripe Price ID.' });
      return;
    }

    if (!process.env.BASE_URL) {
      res.status(500).json({ success: false, message: 'Server configuration error: BASE_URL is not set.' });
      return;
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: selectedPackage.stripePriceId, // ✅ Using Stripe's predefined Price ID
          quantity: 1,
        },
      ],
      mode: 'subscription',
      subscription_data: {
        trial_period_days: selectedPackage.freeTrialDays || 0,
      },
      billing_address_collection: 'auto',
      success_url: `${process.env.BASE_URL}/api/subscription/stripe-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.BASE_URL}/api/subscription/stripe-cancel`,
      metadata: { userId: String(userId), packId: selectedPackage.packId },
    });

    res.status(200).json({ success: true, sessionId: session.id, url: session.url });
  } catch (error: any) {
    console.error('Stripe session error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});


// Stripe success handler
router.get('/stripe-success', async (req: Request, res: Response): Promise<void> => {
  try {
    const { session_id } = req.query;
    const session = await stripe.checkout.sessions.retrieve(session_id as string, {
      expand: ['subscription'],
    });

    const userId = session.metadata?.userId;
    const packId = session.metadata?.packId;
    if (!userId || !packId) {
      res.status(400).json({ success: false, message: 'User ID or Package ID not found.' });
      return;
    }

    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      res.status(401).json({ success: false, message: 'No token provided.' });
      return;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
    if (decoded.userId !== userId) {
      res.status(403).json({ success: false, message: 'Unauthorized access.' });
      return;
    }

    const selectedPackage = await Package.findOne({ packId, status: 'Active' });
    if (!selectedPackage) {
      res.status(404).json({ success: false, message: 'Package not found or suspended.' });
      return;
    }

    const stripeSubscription = session.subscription as Stripe.Subscription;
    const stripeSubscriptionId = stripeSubscription?.id;

    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(startDate.getMonth() + (selectedPackage.subscriptionType === 'Yearly' ? 12 : 1));

    // Set trialActive based on Stripe's subscription status
    const isTrialActive = stripeSubscription.status === 'trialing';

    await Subscription.findOneAndUpdate(
      { user: userId },
      {
        user: userId,
        package: selectedPackage._id,
        startDate,
        endDate,
        trialActive: isTrialActive, // Use Stripe's status to determine trial
        stripeSubscriptionId,
      },
      { upsert: true, new: true }
    );

    res.status(200).json({ success: true, message: `Subscription started${isTrialActive ? ' with trial period' : ''}!` });
  } catch (error: any) {
    console.error('Stripe success error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});


// Cancel subscription during trial
router.post('/cancel', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized: No user ID.' });
      return;
    }

    const subscription = await Subscription.findOne({ user: userId }).populate('package') as ISubscription & { _id: string };
    if (!subscription) {
      res.status(404).json({ success: false, message: 'No active subscription found.' });
      return;
    }

    if (!subscription.stripeSubscriptionId) {
      res.status(400).json({ success: false, message: 'No valid Stripe subscription found to cancel.' });
      return;
    }

    const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
    if (stripeSubscription.status === 'trialing') {
      await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
      await Subscription.deleteOne({ user: userId });
      res.status(200).json({ success: true, message: 'Trial subscription canceled successfully.' });
    } else {
      res.status(400).json({ success: false, message: 'Cannot cancel: Trial period has ended or subscription is active.' });
    }
  } catch (error: any) {
    console.error('Cancel error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Renew subscription (updated to reflect package type)
router.put('/renew', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized: No user ID.' });
      return;
    }

    const subscription = await Subscription.findOne({ user: userId }).populate('package');
    if (!subscription) {
      res.status(404).json({ success: false, message: 'Subscription not found.' });
      return;
    }

    const currentDate = new Date();
    if (subscription.endDate > currentDate) {
      res.status(400).json({ success: false, message: 'Subscription is still active.' });
      return;
    }

    const selectedPackage = subscription.package as any;
    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(startDate.getMonth() + (selectedPackage.subscriptionType === 'Yearly' ? 12 : 1));

    subscription.startDate = startDate;
    subscription.endDate = endDate;
    subscription.trialActive = false;
    await subscription.save();

    res.status(200).json({ success: true, subscription });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get subscription details
router.get('/details', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized: No user ID.' });
      return;
    }

    const subscription = await Subscription.findOne({ user: userId }).populate('package');
    if (!subscription) {
      res.status(404).json({ success: false, message: 'No subscription found for this user.' });
      return;
    }

    const selectedPackage = subscription.package as any;
    res.status(200).json({
      success: true,
      subscription: {
        amount: `$${(selectedPackage.amount / 100).toFixed(2)}`,
        begins: subscription.startDate.toISOString().split('T')[0],
        ends: subscription.endDate.toISOString().split('T')[0],
        type: selectedPackage.subscriptionType,
        trialActive: subscription.trialActive,
      },
    });
  } catch (error: any) {
    console.error('Error fetching subscription:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;