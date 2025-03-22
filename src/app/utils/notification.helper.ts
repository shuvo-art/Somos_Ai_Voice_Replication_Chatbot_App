import { Notification } from '../modules/notification/notification.model';
import { Types } from 'mongoose';

export const createSubscriptionNotification = async (
  userId: Types.ObjectId,
  type: 'trial-ending' | 'subscription-canceled',
  date?: Date
): Promise<void> => {
  try {
    let title = '';
    let message = '';

    if (type === 'trial-ending') {
      title = 'Your trial is ending soon';
      message = `Your free trial will end on ${date?.toDateString()}. Upgrade now to avoid interruption.`;
    } else if (type === 'subscription-canceled') {
      title = 'Your subscription was canceled';
      message = 'You no longer have an active subscription. Please renew to regain access.';
    }

    await Notification.create({
      user: userId,
      title,
      message,
      type: 'subscription',
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Failed to create notification:', error);
  }
};
