
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

  const imagePath = path.join(uploadDir, file.name);
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(imagePath, buffer);

  const pythonScriptPath = path.resolve(process.cwd(), '..', 'model', 'pipeline.py');

  return new Promise((resolve) => {
    exec(`python "${pythonScriptPath}" "${imagePath}"`, async (error, stdout, stderr) => {
      if (error) {
        console.error(`exec error: ${error}`);
        resolve(NextResponse.json({ error: 'Failed to process image' }, { status: 500 }));
        return;
      }
      if (stderr) {
        console.error(`stderr: ${stderr}`);
        resolve(NextResponse.json({ error: 'Failed to process image' }, { status: 500 }));
        return;
      }
      
      try {
        const result = JSON.parse(stdout);
        result.reportType = 'chest';

        // Save the report to MongoDB
        const report = new Report({
          userId,
          reportType: 'chest',
          predictedClass: result.predicted_class,
          confidenceScore: result.probabilities[['COVID', 'Normal', 'Viral Pneumonia', 'Lung_Opacity'].indexOf(result.predicted_class)],
          imageURL: `/uploads/${file.name}`, // Assuming images are served from /public/uploads
        });
        await report.save();

        resolve(NextResponse.json(result));
      } catch (e) {
        console.error(`Error parsing python script output or saving report: ${e}`);
        resolve(NextResponse.json({ error: 'Failed to parse prediction or save report' }, { status: 500 }));
      }
    });
  });
}
