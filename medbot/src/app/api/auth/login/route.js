import connectDB from '@/utils/db';
import User from '@/models/User';
import bcrypt from 'bcryptjs';
import { generateToken } from '@/utils/auth';
import { NextResponse } from 'next/server';

export async function POST(req) {
  await connectDB();

  const { email, password } = await req.json();

  if (!email || !password) {
    return new NextResponse('Email and password are required', { status: 400 });
  }

  const user = await User.findOne({ email });

  if (!user) {
    return new NextResponse('Invalid credentials', { status: 401 });
  }

  const isMatch = await bcrypt.compare(password, user.password);

  if (!isMatch) {
    return new NextResponse('Invalid credentials', { status: 401 });
  }

  const token = generateToken(user);

  const response = NextResponse.json({ 
    message: 'Login successful',
    token: token // Also return token in response for localStorage
  });
  response.cookies.set('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 1 week
    path: '/',
  });
  return response;
}
