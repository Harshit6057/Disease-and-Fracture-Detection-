
import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import jwt from 'jsonwebtoken';
import Report from '@/models/Report';
import connectDB from '@/utils/db';

const uploadDir = path.join(process.cwd(), 'public', 'uploads');

async function ensureUploadDirExists() {
  try {
    await fs.access(uploadDir);
  } catch {
    await fs.mkdir(uploadDir, { recursive: true });
  }
}

export async function POST(req) {
  await connectDB();

  const token = req.cookies.get('token')?.value;

  if (!token) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  let userId;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    userId = decoded.id;
  } catch (error) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  await ensureUploadDirExists();

  const data = await req.formData();
  const file = data.get('image');

  if (!file) {
    return NextResponse.json({ error: 'No image provided' }, { status: 400 });
  }

  // Generate unique filename to avoid conflicts
  const timestamp = Date.now();
  const uniqueFileName = `${timestamp}_${file.name}`;
  const imagePath = path.join(uploadDir, uniqueFileName);
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(imagePath, buffer);

  // Get absolute paths
  const model1Dir = path.resolve(process.cwd(), '..', 'model1');
  const pythonScriptPath = path.join(model1Dir, 'pipeline_mura.py');

  // Verify script exists
  try {
    await fs.access(pythonScriptPath);
  } catch (error) {
    console.error(`Python script not found at: ${pythonScriptPath}`);
    return NextResponse.json({ error: 'Python script not found. Please check model1 folder.' }, { status: 500 });
  }

  return new Promise((resolve) => {
    // Use the script path directly and set cwd to model1Dir
    // This ensures the model file can be found with relative path
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const command = `"${pythonCmd}" "${pythonScriptPath}" "${imagePath}"`;
    
    exec(command, { cwd: model1Dir }, async (error, stdout, stderr) => {
      if (error) {
        console.error(`exec error: ${error}`);
        console.error(`stdout: ${stdout}`);
        console.error(`stderr: ${stderr}`);
        resolve(NextResponse.json({ 
          error: 'Failed to process image', 
          details: error.message,
          stdout: stdout,
          stderr: stderr
        }, { status: 500 }));
        return;
      }

      // TensorFlow/Keras often outputs warnings to stderr that aren't errors
      // Only fail if stdout is empty or doesn't contain JSON
      if (!stdout || stdout.trim().length === 0) {
        console.error(`No output from Python script. stderr: ${stderr}`);
        resolve(NextResponse.json({ 
          error: 'Python script produced no output',
          details: stderr || 'Unknown error'
        }, { status: 500 }));
        return;
      }
      
      try {
        // Extract JSON from stdout (in case there are warnings before/after)
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('No JSON found in output');
        }
        
        const result = JSON.parse(jsonMatch[0]);
        
        // Add reportType to result
        result.reportType = 'fracture';
        result.fractureLocation = result.predicted_class;
        result.imageURL = `/uploads/${uniqueFileName}`;

        // Get confidence score for the predicted class
        const muraClasses = ['XR_ELBOW', 'XR_FINGER', 'XR_FOREARM', 'XR_HAND', 'XR_HUMERUS', 'XR_SHOULDER', 'XR_WRIST'];
        const classIndex = muraClasses.indexOf(result.predicted_class);
        const confidenceScore = classIndex >= 0 ? result.probabilities[classIndex] : result.probabilities[0];

        // Save the report to MongoDB
        const report = new Report({
          userId,
          reportType: 'fracture',
          predictedClass: result.predicted_class,
          confidenceScore: confidenceScore,
          imageURL: `/uploads/${uniqueFileName}`,
          fractureLocation: result.predicted_class,
        });
        await report.save();

        resolve(NextResponse.json(result));
      } catch (e) {
        console.error(`Error parsing python script output or saving report: ${e}`);
        console.error(`stdout was: ${stdout}`);
        console.error(`stderr was: ${stderr}`);
        resolve(NextResponse.json({ 
          error: 'Failed to parse prediction or save report',
          details: e.message,
          stdout: stdout
        }, { status: 500 }));
      }
    });
  });
}

