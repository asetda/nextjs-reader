import { NextRequest, NextResponse } from 'next/server';
import { createHash, createHmac, randomBytes } from 'crypto';

const EXPECTED_USERNAME = 'abc';
const EXPECTED_PASSWORD_HASH = 'd3981f82aea12b4b0863a8e4c22ddf7fc8102c5582ed114352b9f9c9d429974f';

// Secret for signing tokens (in production, use environment variable)
const TOKEN_SECRET = process.env.TOKEN_SECRET || 'default-secret-change-in-production';

// Generate a secure session token
function generateSessionToken(): string {
  const randomData = randomBytes(32).toString('hex');
  const timestamp = Date.now().toString();
  const data = `${randomData}:${timestamp}`;
  
  // Create HMAC signature
  const signature = createHmac('sha256', TOKEN_SECRET)
    .update(data)
    .digest('hex');
  
  return `${data}:${signature}`;
}

function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      );
    }

    // Hash the provided password
    const passwordHash = hashPassword(password);

    // Verify credentials
    if (username !== EXPECTED_USERNAME || passwordHash !== EXPECTED_PASSWORD_HASH) {
      return NextResponse.json(
        { error: 'Invalid username or password' },
        { status: 401 }
      );
    }

    // Create response with auth cookie
    const response = NextResponse.json({ success: true });
    
    // Set authentication cookie with secure signed token
    const sessionToken = generateSessionToken();
    
    response.cookies.set('auth-token', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'An error occurred during login' },
      { status: 500 }
    );
  }
}

export { TOKEN_SECRET };
