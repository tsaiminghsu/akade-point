import type { Metadata } from 'next';
import { ARIPPageShell } from '@/components/arip/ARIPPageShell';
import { ARIPComingSoon } from '@/components/arip/ARIPComingSoon';

export const metadata: Metadata = { title: 'AI Agents' };

export default function AIPage() {
  return (
    <ARIPPageShell
      title="AI Agent Manager"
      description="Configure AI providers and deploy intelligent agents"
    >
      <ARIPComingSoon
        module="AI Agent Manager"
        description="Connect OpenAI, Claude, Gemini, Ollama, or any OpenAI-compatible provider. Deploy agents with memory, RAG, tool calling, and multi-agent coordination."
      />
    </ARIPPageShell>
  );
}
