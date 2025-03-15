import express, { Request, Response } from 'express';
import { VoiceRecording } from './voiceRecording.model';
import { authenticate } from '../auth/auth.middleware';
import multer from 'multer';
import { uploadImage, uploadAudio } from '../../utils/cloudinary';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

// Task 1: Get all recorded voices for the home page
router.get('/recordings', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const recordings = await VoiceRecording.find({ user: userId });
    res.status(200).json({ success: true, recordings });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Task 1: Add a new voice recording (new or uploaded)
router.post(
  '/add-voice',
  authenticate,
  upload.fields([{ name: 'audio', maxCount: 1 }, { name: 'image', maxCount: 1 }]),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
      }

      const { title, relation, ...personalizationData } = req.body;
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };

      if (!title || !relation) {
        res.status(400).json({ success: false, message: 'Title and relation are required' });
        return;
      }

      if (!files.audio || files.audio.length === 0) {
        res.status(400).json({ success: false, message: 'Audio file is required' });
        return;
      }

      // Upload audio to Cloudinary
      const audioResult = await uploadAudio(files.audio[0].path);
      const audioUrl = audioResult.secure_url;

      // Upload image to Cloudinary (optional)
      let imageUrl = '';
      if (files.image && files.image.length > 0) {
        const imageResult = await uploadImage(files.image[0].path);
        imageUrl = imageResult.secure_url;
      }

      // Call Python script to clone the voice
      const pythonScriptPath = path.join(__dirname, '../../../../python/audio_cloning.py');
      const tempAudioPath = files.audio[0].path;
      const cloneName = `${title}-${userId}`;

      const clonedVoiceId = await new Promise<string>((resolve, reject) => {
        exec(
          `python ${pythonScriptPath} ${tempAudioPath} ${cloneName}`,
          (error, stdout, stderr) => {
            if (error) {
              reject(new Error(`Voice cloning failed: ${stderr}`));
              return;
            }
            const voiceId = stdout.split('Cloned voice ID: ')[1]?.trim();
            if (!voiceId) {
              reject(new Error('Failed to extract cloned voice ID'));
              return;
            }
            resolve(voiceId);
          }
        );
      });

      // Clean up temporary files
      fs.unlinkSync(tempAudioPath);
      if (files.image) fs.unlinkSync(files.image[0].path);

      // Save the voice recording
      const voiceRecording = new VoiceRecording({
        user: userId,
        title,
        relation,
        imageUrl,
        audioUrl,
        clonedVoiceId,
        personalizationData,
      });

      await voiceRecording.save();

      res.status(201).json({ success: true, voiceRecording });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// Task 2: Update personalization data for a voice recording
router.put(
  '/:recordingId/personalization',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { recordingId } = req.params;
      const personalizationData = req.body;

      if (!userId) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
      }

      const voiceRecording = await VoiceRecording.findOneAndUpdate(
        { _id: recordingId, user: userId },
        { personalizationData },
        { new: true }
      );

      if (!voiceRecording) {
        res.status(404).json({ success: false, message: 'Voice recording not found' });
        return;
      }

      res.status(200).json({ success: true, voiceRecording });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// Task 3: Talk to AI with selected voice
router.post(
  '/talk-to-ai',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { recordingId, userInput } = req.body;

      if (!userId) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
      }

      if (!recordingId || !userInput) {
        res.status(400).json({ success: false, message: 'Recording ID and user input are required' });
        return;
      }

      const voiceRecording = await VoiceRecording.findOne({ _id: recordingId, user: userId });
      if (!voiceRecording || !voiceRecording.clonedVoiceId) {
        res.status(404).json({ success: false, message: 'Voice recording or cloned voice not found' });
        return;
      }

      // Call Python script to generate AI response and audio
      const pythonScriptPath = path.join(__dirname, '../../../../python/generate_ai_response.py');
      const outputAudioPath = path.join(__dirname, '../../../../uploads/generated_audio.wav');
      const userData = JSON.stringify(voiceRecording.personalizationData);

      const generatedAudioPath = await new Promise<string>((resolve, reject) => {
        exec(
          `python ${pythonScriptPath} "${userInput}" ${voiceRecording.clonedVoiceId} '${userData}' ${outputAudioPath}`,
          (error, stdout, stderr) => {
            if (error) {
              reject(new Error(`AI response generation failed: ${stderr}`));
              return;
            }
            const audioPath = stdout.split('Generated audio saved at: ')[1]?.trim();
            if (!audioPath) {
              reject(new Error('Failed to extract generated audio path'));
              return;
            }
            resolve(audioPath);
          }
        );
      });

      // Upload generated audio to Cloudinary
      const audioResult = await uploadAudio(generatedAudioPath);
      fs.unlinkSync(generatedAudioPath);

      res.status(200).json({ success: true, audioUrl: audioResult.secure_url });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

export default router;