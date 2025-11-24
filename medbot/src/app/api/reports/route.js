import { NextResponse } from 'next/server';
import connectDB from '@/utils/db';
import Report from '@/models/Report';
import jwt from 'jsonwebtoken';

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

  try {
    const { reportType, predictedClass, confidenceScore, imageURL, fractureLocation } = await req.json();

    if (!reportType || !predictedClass || !confidenceScore || !imageURL) {
      return new NextResponse('Report type, predicted class, confidence score, and image URL are required', { status: 400 });
    }

    const reportData = {
      userId,
      reportType,
      predictedClass,
      confidenceScore,
      imageURL,
    };

    if (reportType === 'fracture' && fractureLocation) {
      reportData.fractureLocation = fractureLocation;
    }

    const report = new Report(reportData);

    await report.save();
    return new NextResponse('Report saved successfully', { status: 201 });
  } catch (error) {
    console.error('Error saving report:', error);
    return new NextResponse('Error saving report', { status: 500 });
  }
}

export async function GET(req) {
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

  try {
    const reports = await Report.find({ userId }).sort({ createdAt: -1 });
    return NextResponse.json(reports);
  } catch (error) {
    console.error('Error fetching reports:', error);
    return new NextResponse('Error fetching reports', { status: 500 });
  }
}
