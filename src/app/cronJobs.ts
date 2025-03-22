import cron from 'node-cron';
import { Subscription } from './modules/subscription/subscription.model';
import { createSubscriptionNotification } from '../app/utils/notification.helper';

// Function to check for trial subscriptions ending soon
const checkTrialExpiries = async () => {
  try {
    console.log('Checking for trial subscriptions ending soon...');
    
    // Find subscriptions with trials ending in the next 2 days
    const usersWithTrialEndingSoon = await Subscription.find({
      trialActive: true,
      endDate: { $lte: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) }, // 2 days from now
    });

    console.log(`Found ${usersWithTrialEndingSoon.length} trials ending soon.`);

    // Create notifications for each user
    for (const sub of usersWithTrialEndingSoon) {
      await createSubscriptionNotification(sub.user, 'trial-ending', sub.endDate);
      console.log(`Notification created for user ${sub.user} - Trial ends on ${sub.endDate}`);
    }
  } catch (error: any) {
    console.error('Error in trial expiry check:', error.message);
  }
};

// Schedule the cron job to run every day at midnight
export const startCronJobs = () => {
  cron.schedule('0 0 * * *', () => {
    console.log('Running daily trial expiry check...');
    checkTrialExpiries();
  }, {
    scheduled: true,
    timezone: 'UTC', // Adjust timezone as needed
  });

  console.log('Cron jobs scheduled.');
};