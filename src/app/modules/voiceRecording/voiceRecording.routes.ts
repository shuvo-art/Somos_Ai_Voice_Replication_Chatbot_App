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
      console.log('Step 1: Starting /add-voice route');
      const userId = req.user?.id;
      console.log('Step 2: Extracted userId:', userId);
      if (!userId) {
        console.log('Step 3: No userId found, returning 401');
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
      }

      const { title, relation, ...personalizationData } = req.body;
      console.log('Step 4: Extracted title, relation, and personalizationData:', { title, relation, personalizationData });
      // Parse customQuestions if it's a string
      let parsedPersonalizationData = { ...personalizationData };
      if (personalizationData.customQuestions && typeof personalizationData.customQuestions === 'string') {
        try {
          parsedPersonalizationData.customQuestions = JSON.parse(personalizationData.customQuestions);
        } catch (e) {
          console.log('Step 4.5: Failed to parse customQuestions:', e);
          parsedPersonalizationData.customQuestions = [];
        }
      }

      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      console.log('Step 5: Extracted files:', files);

      if (!title || !relation) {
        console.log('Step 6: Missing title or relation, returning 400');
        res.status(400).json({ success: false, message: 'Title and relation are required' });
        return;
      }

      if (!files.audio || files.audio.length === 0) {
        console.log('Step 7: No audio file provided, returning 400');
        res.status(400).json({ success: false, message: 'Audio file is required' });
        return;
      }

      // Upload audio to Cloudinary
      console.log('Step 8: Uploading audio to Cloudinary:', files.audio[0].path);
      const audioResult = await uploadAudio(files.audio[0].path);
      const audioUrl = audioResult.secure_url;
      console.log('Step 9: Audio uploaded, URL:', audioUrl);

      // Upload image to Cloudinary (optional)
      let imageUrl = '';
      if (files.image && files.image.length > 0) {
        console.log('Step 10: Uploading image to Cloudinary:', files.image[0].path);
        const imageResult = await uploadImage(files.image[0].path);
        imageUrl = imageResult.secure_url;
        console.log('Step 11: Image uploaded, URL:', imageUrl);
      }

      // Call Python script to clone the voice
      const pythonScriptPath = path.join(__dirname, '../../../../python/audio_cloning.py');
      const tempAudioPath = files.audio[0].path.replace(/\\/g, '/'); // Convert backslashes to forward slashes for compatibility
      const cloneName = `${title}-${userId}`.replace(/ /g, '_'); // Replace spaces with underscores to avoid shell issues
      console.log('Step 12: Preparing to call Python script:', { pythonScriptPath, tempAudioPath, cloneName });

      const clonedVoiceId = await new Promise<string>((resolve, reject) => {
        const command = `python -u "${pythonScriptPath}" "${tempAudioPath}" "${cloneName}"`; // Add -u to disable buffering
        console.log('Step 12.5: Executing command:', command);
        exec(command, { shell: 'cmd.exe' }, (error, stdout, stderr) => {
          console.log('Step 13: Python script executed, stdout:', stdout);
          console.log('Step 14: Python script executed, stderr:', stderr);
          if (error) {
            console.log('Step 15: Python script execution error:', error);
            reject(new Error(`Voice cloning failed: ${stderr || error.message}`));
            return;
          }
          const voiceIdMatch = stdout.match(/Cloned voice ID: (.+)/);
          const voiceId = voiceIdMatch ? voiceIdMatch[1].trim() : null;
          console.log('Step 16: Extracted voiceId:', voiceId);
          if (!voiceId) {
            console.log('Step 17: No voiceId extracted, rejecting promise');
            reject(new Error('Failed to extract cloned voice ID'));
            return;
          }
          resolve(voiceId);
        });
      });

      console.log('Step 18: Cloned voice ID obtained:', clonedVoiceId);

      // Clean up temporary files
      console.log('Step 19: Cleaning up temp audio file:', tempAudioPath);
      fs.unlinkSync(tempAudioPath);
      if (files.image) {
        console.log('Step 20: Cleaning up temp image file:', files.image[0].path);
        fs.unlinkSync(files.image[0].path);
      }

      // Save the voice recording
      console.log('Step 21: Saving voice recording to database');
      const voiceRecording = new VoiceRecording({
        user: userId,
        title,
        relation,
        imageUrl,
        audioUrl,
        clonedVoiceId,
        personalizationData: parsedPersonalizationData,
      });

      await voiceRecording.save();
      console.log('Step 22: Voice recording saved:', voiceRecording);

      res.status(201).json({ success: true, voiceRecording });
    } catch (error: any) {
      console.error('Step 23: Error in /add-voice:', error.message);
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
      const { personalizationData } = req.body; // Extract personalizationData from the request body

      if (!userId) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
      }

      if (!personalizationData) {
        res.status(400).json({ success: false, message: 'Personalization data is required' });
        return;
      }

      // Flatten the personalizationData object to update individual fields
      const updateFields: { [key: string]: any } = {};
      for (const key in personalizationData) {
        if (personalizationData.hasOwnProperty(key)) {
          updateFields[`personalizationData.${key}`] = personalizationData[key];
        }
      }

      const voiceRecording = await VoiceRecording.findOneAndUpdate(
        { _id: recordingId, user: userId },
        { $set: updateFields }, // Use $set to update only the provided fields
        { new: true, runValidators: true } // Return the updated document and run schema validators
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
      console.log('Step 1: Extracted userId:', userId);
      if (!userId) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
      }

      const { recordingId, userInput } = req.body;
      console.log('Step 2: Received recordingId and userInput:', { recordingId, userInput });
      if (!recordingId || !userInput) {
        res.status(400).json({ success: false, message: 'Recording ID and user input are required' });
        return;
      }

      const voiceRecording = await VoiceRecording.findOne({ _id: recordingId, user: userId });
      console.log('Step 3: Fetched voiceRecording:', voiceRecording);
      if (!voiceRecording || !voiceRecording.clonedVoiceId) {
        res.status(404).json({ success: false, message: 'Voice recording or cloned voice not found' });
        return;
      }

      // Create a temporary file for userData to avoid shell quoting issues
      const tempFilePath = path.join(__dirname, '../../../../uploads/temp_user_data.json');
      fs.writeFileSync(tempFilePath, JSON.stringify(voiceRecording.personalizationData));
      console.log('Step 4: Wrote userData to temporary file:', tempFilePath);

      // Call Python script to generate AI response and audio
      const pythonScriptPath = path.join(__dirname, '../../../../python/generate_ai_response.py');
      const outputAudioPath = path.join(__dirname, '../../../../uploads/generated_audio.wav');
      const command = `python -u "${pythonScriptPath}" "${userInput}" ${voiceRecording.clonedVoiceId} "${tempFilePath}" "${outputAudioPath}"`;
      console.log('Step 5: Executing command:', command);

      const generatedAudioPath = await new Promise<string>((resolve, reject) => {
        exec(
          command,
          { shell: 'cmd.exe' },
          (error, stdout, stderr) => {
            console.log('Step 6: Python script executed, stdout:', stdout);
            console.log('Step 7: Python script executed, stderr:', stderr);
            if (error) {
              console.log('Step 8: Python script execution error:', error);
              reject(new Error(`AI response generation failed: ${stderr || error.message}`));
              return;
            }
            const audioPath = stdout.split('Generated audio saved at: ')[1]?.trim();
            console.log('Step 9: Extracted audioPath:', audioPath);
            if (!audioPath) {
              console.log('Step 10: No audioPath extracted, rejecting promise');
              reject(new Error('Failed to extract generated audio path'));
              return;
            }
            resolve(audioPath);
          }
        );
      });

      // Clean up the temporary file
      fs.unlinkSync(tempFilePath);
      console.log('Step 11: Cleaned up temporary userData file');

      // Upload generated audio to Cloudinary
      console.log('Step 12: Uploading generated audio to Cloudinary:', generatedAudioPath);
      const audioResult = await uploadAudio(generatedAudioPath);
      console.log('Step 13: Audio uploaded, URL:', audioResult.secure_url);
      fs.unlinkSync(generatedAudioPath);
      console.log('Step 14: Cleaned up temporary audio file');

      res.status(200).json({ success: true, audioUrl: audioResult.secure_url });
    } catch (error: any) {
      console.error('Step 15: Error in /talk-to-ai:', error.message);
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

export default router;