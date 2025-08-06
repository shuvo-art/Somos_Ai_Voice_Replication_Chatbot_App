import express, { Request, Response } from 'express';
import { VoiceRecording } from './voiceRecording.model';
import { authenticate } from '../auth/auth.middleware';
import multer from 'multer';
import { uploadImage, uploadAudio } from '../../utils/cloudinary';
import { exec, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';

const router = express.Router();
const execPromise = promisify(exec);

// Multer Storage Configuration to set file permissions
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, '/app/uploads'); // অ্যাবসোলিউট পাথ
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

// Multer File Filter for Audio: Validates MP3 and WAV files
const audioFileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedAudioTypes = ['audio/mpeg', 'audio/wav', 'audio/mp3', 'application/octet-stream'];
  const allowedExtensions = ['.mp3', '.wav'];
  const fileExtension = path.extname(file.originalname).toLowerCase();

  console.log(`Step 0: audioFileFilter called for file: ${file.originalname}, MIME type: ${file.mimetype}, Extension: ${fileExtension}`);

  if (!file.mimetype || !file.originalname) {
    console.log(`Step 0.1: Missing MIME type or original name for file: ${file.originalname}`);
    cb(new Error(`Invalid file metadata for ${file.originalname}. Ensure file is properly uploaded.`));
    return;
  }

  if (allowedAudioTypes.includes(file.mimetype)) {
    if (file.mimetype === 'audio/mpeg' && fileExtension !== '.mp3') {
      console.log(`Warning: File ${file.originalname} has audio/mpeg MIME type but ${fileExtension} extension.`);
    }
    if (file.mimetype === 'audio/wav' && fileExtension !== '.wav') {
      console.log(`Warning: File ${file.originalname} has audio/wav MIME type but ${fileExtension} extension.`);
    }
    if (file.mimetype === 'application/octet-stream') {
      console.log(`Step 0.2: File ${file.originalname} has generic MIME type (application/octet-stream). Accepting based on extension: ${fileExtension}`);
      if (!allowedExtensions.includes(fileExtension)) {
        console.log(`Step 0.3: Invalid extension for ${file.originalname}. Expected .mp3 or .wav.`);
        cb(new Error(`Invalid file extension for ${file.originalname}. Only .mp3 and .wav files are allowed.`));
        return;
      }
    }
    cb(null, true);
  } else {
    console.log(`Step 0.4: Invalid MIME type for ${file.originalname}: ${file.mimetype}. Allowed types: ${allowedAudioTypes.join(', ')}`);
    cb(new Error(`Invalid file type for ${file.originalname}. Only MP3 and WAV files are allowed. Detected MIME type: ${file.mimetype}`));
  }
};

// Multer File Filter for Images: Validates PNG and JPEG files
const imageFileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedImageTypes = ['image/png', 'image/jpeg', 'image/jpg'];
  const allowedExtensions = ['.png', '.jpg', '.jpeg'];
  const fileExtension = path.extname(file.originalname).toLowerCase();

  console.log(`Step 0: imageFileFilter called for file: ${file.originalname}, MIME type: ${file.mimetype}, Extension: ${fileExtension}`);

  if (!file.mimetype || !file.originalname) {
    console.log(`Step 0.1: Missing MIME type or original name for file: ${file.originalname}`);
    cb(new Error(`Invalid file metadata for ${file.originalname}. Ensure file is properly uploaded.`));
    return;
  }

  if (allowedImageTypes.includes(file.mimetype)) {
    if (!allowedExtensions.includes(fileExtension)) {
      console.log(`Step 0.2: Invalid extension for ${file.originalname}: ${fileExtension}. Allowed extensions: ${allowedExtensions.join(', ')}`);
      cb(new Error(`Invalid file extension for ${file.originalname}. Only .png, .jpg, and .jpeg files are allowed.`));
      return;
    }
    cb(null, true);
  } else {
    console.log(`Step 0.3: Invalid MIME type for ${file.originalname}: ${file.mimetype}. Allowed types: ${allowedImageTypes.join(', ')}`);
    cb(new Error(`Invalid file type for ${file.originalname}. Only PNG and JPEG files are allowed. Detected MIME type: ${file.mimetype}`));
  }
};

// Multer Configuration with storage
const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'audio') {
      audioFileFilter(req, file, cb);
    } else if (file.fieldname === 'image') {
      imageFileFilter(req, file, cb);
    } else {
      cb(new Error(`Unexpected field ${file.fieldname}`));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit for both audio and image
  },
}).fields([{ name: 'audio', maxCount: 1 }, { name: 'image', maxCount: 1 }]);

// ফাইল পারমিশন সেট করার ফাংশন
function setFilePermissions(filePath: string) {
  try {
    fs.chmodSync(filePath, '755');
    console.log(`Set permissions to 755 for file: ${filePath}`);
  } catch (error) {
    console.error(`Failed to set permissions for ${filePath}:`, error);
  }
}

// Find Python Executable
function getPythonExecutable(): string {
  const executables = ['python3', 'python', 'py','/app/venv/bin/python3', '/usr/bin/python3', '/usr/local/bin/python3'];
  for (const executable of executables) {
    try {
      execSync(`${executable} --version`, { stdio: 'ignore' });
      return executable;
    } catch {
      continue;
    }
  }
  throw new Error('Python executable not found. Please ensure Python is installed and in PATH.');
}

// Resolve Python Directory
function resolvePythonDir(scriptName: string): string {
  const possiblePaths = [
    path.resolve(__dirname, '../../../../python', scriptName),
    path.resolve(process.cwd(), 'python', scriptName),
  ];

  const foundPath = possiblePaths.find(p => fs.existsSync(p));
  if (!foundPath) throw new Error(`❌ ${scriptName} not found in known locations.`);
  return path.dirname(foundPath);
}

// Task 1: Get all recorded voices for the home page with a configurable limit and optional title filter
router.get('/recordings', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const limitParam = req.query.limit as string;
    const titleParam = req.query.title as string;

    let limit = 5;
    if (limitParam) {
      const parsedLimit = parseInt(limitParam);
      if (!isNaN(parsedLimit) && parsedLimit > 0) {
        limit = parsedLimit;
      } else {
        console.log('Step 4: Invalid limit provided, using default value of 5');
        res.status(400).json({ success: false, message: 'Limit must be a positive integer' });
        return;
      }
    }

    const query: any = { user: userId };
    if (titleParam) {
      query.title = { $regex: titleParam, $options: 'i' };
    }

    console.log('Step 6: Running query with filters:', query);

    const recordings = await VoiceRecording.find(query).limit(limit);
    res.status(200).json({ success: true, recordings });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});


// Task 1: Add a new voice recording (new or uploaded)
router.post(
  '/add-voice',
  authenticate,
  upload,
  async (req: Request, res: Response): Promise<void> => {
    let files: { [fieldname: string]: Express.Multer.File[] } = {};
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
      let parsedPersonalizationData = { ...personalizationData };
      if (personalizationData.customQuestions && typeof personalizationData.customQuestions === 'string') {
        try {
          parsedPersonalizationData.customQuestions = JSON.parse(personalizationData.customQuestions);
        } catch (e) {
          console.log('Step 4.5: Failed to parse customQuestions:', e);
          parsedPersonalizationData.customQuestions = [];
        }
      }

      files = req.files as { [fieldname: string]: Express.Multer.File[] };
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

      const tempAudioPath = path.join('/app/uploads', path.basename(files.audio[0].path)).replace(/\\/g, '/');
      setFilePermissions(tempAudioPath);
      console.log('Step 7.5: Validating audio file format:', tempAudioPath, 'Original name:', files.audio[0].originalname, 'MIME type:', files.audio[0].mimetype);
      const ffprobeCommand = `ffprobe -v quiet -print_format json -show_streams "${tempAudioPath}"`;
      let ffprobeOutput;
      try {
        ffprobeOutput = await execPromise(ffprobeCommand);
        const streamInfo = JSON.parse(ffprobeOutput.stdout);
        console.log('Step 7.6: ffprobe output:', streamInfo);
        if (!streamInfo.streams.some((stream: any) => stream.codec_type === 'audio')) {
          throw new Error(`Uploaded file (${files.audio[0].originalname}) is not a valid audio file. Detected format: ${streamInfo.streams[0]?.codec_type || 'unknown'}.`);
        }
      } catch (error: any) {
        console.log('Step 7.6: Audio validation failed:', error.message);
        throw new Error(`Invalid audio file format for ${files.audio[0].originalname}. Please upload a valid MP3 or WAV file. Error: ${error.message}`);
      }

      console.log('Step 8: Uploading audio to Cloudinary:', tempAudioPath);
      const audioResult = await uploadAudio(tempAudioPath);
      const audioUrl = audioResult.secure_url;
      console.log('Step 9: Audio uploaded, URL:', audioUrl);

      let imageUrl = '';
      if (files.image && files.image.length > 0) {
        console.log('Step 10: Uploading image to Cloudinary:', files.image[0].path);
        const imageResult = await uploadImage(files.image[0].path);
        imageUrl = imageResult.secure_url;
        console.log('Step 11: Image uploaded, URL:', imageUrl);
      }

      const audioPythonDir = resolvePythonDir('audio_cloning.py');
      const pythonScriptPath = path.join(audioPythonDir, 'audio_cloning.py');
      const cloneName = `${title}-${userId}`.replace(/ /g, '_');
      console.log('Step 12: Preparing to call Python script:', { pythonScriptPath, tempAudioPath, cloneName });

      const pythonExec = getPythonExecutable();
      const command = `${pythonExec} -u "${pythonScriptPath}" "${tempAudioPath}" "${cloneName}"`;
      console.log('Step 12.5: Executing command:', command);

      let stdout, stderr;
      try {
        const result = await execPromise(command, {
          cwd: audioPythonDir,
          env: { ...process.env, PYTHONPATH: audioPythonDir },
        });
        stdout = result.stdout;
        stderr = result.stderr;
      } catch (error: any) {
        stdout = error.stdout || '';
        stderr = error.stderr || error.message || 'Unknown error';
        console.error('Step 12.6: Python script execution failed:', { stdout, stderr });
        throw new Error(`Python script failed: ${stderr}`);
      }

      console.log('Step 13: Python script executed, stdout:', stdout);
      console.log('Step 14: Python script stderr:', stderr);

      const voiceIdMatch = stdout.match(/Cloned voice ID: (.+)/);
      const voiceId = voiceIdMatch ? voiceIdMatch[1].trim() : null;
      console.log('Step 16: Extracted voiceId:', voiceId);
      if (!voiceId) {
        console.log('Step 17: No voiceId extracted, stderr:', stderr);
        throw new Error(`Failed to extract cloned voice ID: ${stderr || 'No stderr output'}`);
      }

      const clonedVoiceId = voiceId;
      console.log('Step 18: Cloned voice ID obtained:', clonedVoiceId);

      console.log('Step 19: Cleaning up temp audio file:', tempAudioPath);
      fs.unlinkSync(tempAudioPath);
      if (files.image && files.image[0]?.path) {
        console.log('Step 20: Cleaning up temp image file:', files.image[0].path);
        fs.unlinkSync(files.image[0].path);
      }

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
      if (files.audio && files.audio[0]?.path && fs.existsSync(files.audio[0].path)) {
        fs.unlinkSync(files.audio[0].path);
      }
      if (files.image && files.image[0]?.path && fs.existsSync(files.image[0].path)) {
        fs.unlinkSync(files.image[0].path);
      }
      res.status(500).json({ success: false, message: `Failed to process voice: ${error.message}` });
    }
  }
);


// Multer configuration for single image upload
const uploadSingleImage = multer({
  storage: storage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});


// Task 2: Update personalization data and profile picture for a voice recording
router.put(
  '/:recordingId/personalization',
  authenticate,
  uploadSingleImage.single('image'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { recordingId } = req.params;
      const { personalizationData } = req.body;
      const file = req.file;

      if (!userId) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
      }

      const voiceRecording = await VoiceRecording.findOne({ _id: recordingId, user: userId });
      if (!voiceRecording) {
        res.status(404).json({ success: false, message: 'Voice recording not found' });
        return;
      }

      const updateFields: { [key: string]: any } = {};

      if (personalizationData) {
        let parsedPersonalizationData = personalizationData;
        if (typeof personalizationData === 'string') {
          try {
            parsedPersonalizationData = JSON.parse(personalizationData);
          } catch (e) {
            console.log('Failed to parse personalizationData:', e);
            parsedPersonalizationData = {};
          }
        }
        for (const key in parsedPersonalizationData) {
          if (parsedPersonalizationData.hasOwnProperty(key)) {
            updateFields[`personalizationData.${key}`] = parsedPersonalizationData[key];
          }
        }
      }

      if (file) {
        console.log('Uploading new profile image to Cloudinary:', file.path);
        const imageResult = await uploadImage(file.path);
        updateFields.imageUrl = imageResult.secure_url;
        console.log('New image URL:', imageResult.secure_url);
        fs.unlinkSync(file.path);
      }

      if (Object.keys(updateFields).length === 0) {
        res.status(400).json({ success: false, message: 'No updates provided' });
        return;
      }

      const updatedRecording = await VoiceRecording.findOneAndUpdate(
        { _id: recordingId, user: userId },
        { $set: updateFields },
        { new: true, runValidators: true }
      );

      if (!updatedRecording) {
        res.status(404).json({ success: false, message: 'Voice recording not found' });
        return;
      }

      res.status(200).json({ success: true, voiceRecording: updatedRecording });
    } catch (error: any) {
      console.error('Error in update personalization:', error.message);
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// Task 3: Talk to AI with selected voice
router.post(
  '/talk-to-ai',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    let tempFilePath: string = '';
    let generatedAudioPath: string = '';
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

      // File paths resolved to: /app/uploads
      tempFilePath = '/app/uploads/temp_user_data.json';
      fs.writeFileSync(tempFilePath, JSON.stringify(voiceRecording.personalizationData));
      console.log('Step 4: Wrote userData to temporary file:', tempFilePath);

      const aiPythonDir = resolvePythonDir('generate_ai_response.py');
      console.log('Step 5: AI Python directory resolved to:', aiPythonDir);
      const pythonScriptPath = path.join(aiPythonDir, 'generate_ai_response.py');
      console.log('Step 5.5: Python script path:', pythonScriptPath);
      const outputAudioPath = '/app/uploads/generated_audio.wav';
      console.log('Step 6: Output audio path:', outputAudioPath);
      if (fs.existsSync(outputAudioPath)) {
        fs.unlinkSync(outputAudioPath);
        console.log('Step 7: Cleaned up existing output audio file:', outputAudioPath);
      }
      const pythonExec = getPythonExecutable();
      const command = `${pythonExec} -u "${pythonScriptPath}" "${userInput.replace(/"/g, '\\"')}" "${voiceRecording.clonedVoiceId}" "${tempFilePath}" "${outputAudioPath}"`;
      console.log('Step 5: Executing command:', command);

      const { stdout } = await execPromise(command, {
        cwd: aiPythonDir,
        env: { ...process.env, PYTHONPATH: aiPythonDir },
      });

      console.log('Step 6: Python script executed, stdout:', stdout);
      const audioPathMatch = stdout.match(/Generated audio saved at: (.+)/);
      const audioPath = audioPathMatch ? audioPathMatch[1].trim() : null;
      console.log('Step 10: Extracted audioPath:', audioPath);
      if (!audioPath) {
        console.log('Step 11: No audioPath extracted, throwing error. Full stdout:', stdout);
        throw new Error('Failed to extract generated audio path');
      }

      generatedAudioPath = audioPath;

      fs.unlinkSync(tempFilePath);
      console.log('Step 12: Cleaned up temporary userData file');

      console.log('Step 13: Uploading generated audio to Cloudinary:', generatedAudioPath);
      const audioResult = await uploadAudio(generatedAudioPath);
      console.log('Step 14: Audio uploaded, URL:', audioResult.secure_url);
      fs.unlinkSync(generatedAudioPath);
      console.log('Step 15: Cleaned up temporary audio file');

      res.status(200).json({ success: true, audioUrl: audioResult.secure_url });
    } catch (error: any) {
      console.error('Step 16: Error in /talk-to-ai:', error.message);
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
      if (generatedAudioPath && fs.existsSync(generatedAudioPath)) {
        fs.unlinkSync(generatedAudioPath);
      }
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// Task 1: Delete a voice recording by ID
router.delete(
  '/:recordingId',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { recordingId } = req.params;

      if (!userId) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
      }

      const voiceRecording = await VoiceRecording.findOneAndDelete({
        _id: recordingId,
        user: userId,
      });

      if (!voiceRecording) {
        res.status(404).json({ success: false, message: 'Voice recording not found or you do not have permission to delete it' });
        return;
      }

      res.status(200).json({ success: true, message: 'Voice recording deleted successfully' });
    } catch (error: any) {
      console.error('Error in delete recording:', error.message);
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

export default router;