import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const TOKEN_SECRET = process.env.TOKEN_SECRET || 'default-secret-change-in-production';

async function verifyToken(token: string): Promise<boolean> {
  try {
    const parts = token.split(':');
    if (parts.length !== 3) return false;
    
    const [randomData, timestamp, signature] = parts;
    const data = `${randomData}:${timestamp}`;
    
    // Verify HMAC signature using Web Crypto API
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(TOKEN_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify']
    );
    
    const expectedSignature = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(data)
    );
    
    // Convert to hex string
    const expectedHex = Array.from(new Uint8Array(expectedSignature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    // Check if signature matches
    if (signature !== expectedHex) return false;
    
    // Check if token is not expired (7 days)
    const tokenAge = Date.now() - parseInt(timestamp, 10);
    const maxAge = 60 * 60 * 24 * 7 * 1000; // 7 days in milliseconds
    
    return tokenAge < maxAge;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  // Allow access to login page and API endpoints
  if (request.nextUrl.pathname === '/login' || 
      request.nextUrl.pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }

  // Check if user is authenticated
  const authToken = request.cookies.get('auth-token');
  
  if (!authToken || !(await verifyToken(authToken.value))) {
    // Redirect to login page
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

// Configure which routes to protect
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
