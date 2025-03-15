import express, { Request, Response } from 'express';
import { getUserProfile, updateUserProfile } from './user.controller';
import { authenticate } from '../auth/auth.middleware';
import multer from 'multer';
import { uploadImage } from '../../utils/cloudinary';
import { User } from './user.model';

const router = express.Router();

const upload = multer({ dest: 'uploads/' });

router.post('/upload-profile-image', authenticate, upload.single('image'), async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, message: 'No file uploaded' });
        return;
      }
  
      const result = await uploadImage(req.file.path);
  
      // Update user profile with the new image URL
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
      }
  
      const user = await User.findByIdAndUpdate(
        userId,
        { profileImage: result.secure_url },
        { new: true }
      ).select('-password');
  
      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }
  
      res.status(200).json({ success: true, user });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });
  
  router.get('/profile', authenticate, getUserProfile); 
  router.put('/profile', authenticate, updateUserProfile); 
export default router;
