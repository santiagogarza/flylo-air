import { defaultContext } from '@/server/http';
import { handleVoiceSession } from '@/server/voice-session';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return handleVoiceSession(request, defaultContext());
}
