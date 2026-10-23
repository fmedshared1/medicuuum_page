// Standard Vercel Node function. No third-party dependencies.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Use POST.' });
  }

  const { DEEPSEEK_API_KEY } = process.env;
  if (!DEEPSEEK_API_KEY) {
    return res.status(503).json({ error: 'Set DEEPSEEK_API_KEY in Vercel, then redeploy.' });
  }

  // Expect { messages: [{ role: 'user', content: '...' }, ...] }
  const messages = req.body?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Send a non-empty messages array.' });
  }

  const model = process.env.DEEPSEEK_MODEL?.trim() || 'deepseek-v4-pro';
  // 'disabled' = faster replies (better for voice). Set DEEPSEEK_THINKING=enabled to turn thinking on.
  const thinking = process.env.DEEPSEEK_THINKING?.trim() === 'enabled' ? 'enabled' : 'disabled';

  try {
    const upstream = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages,
        thinking: { type: thinking },
        stream: false
      }),
      signal: AbortSignal.timeout(30000)
    });

    if (!upstream.ok) {
      // Do not reflect raw upstream bodies or secrets into browser error messages.
      const hints = {
        401: 'DeepSeek rejected DEEPSEEK_API_KEY. Check the key and redeploy.',
        402: 'Check your DeepSeek balance.',
        429: 'DeepSeek rate limit reached. Retry later.'
      };
      return res.status(502).json({
        error: hints[upstream.status] || `DeepSeek request failed (HTTP ${upstream.status}).`
      });
    }

    const data = await upstream.json();
    const reply = data?.choices?.[0]?.message?.content;
    if (typeof reply !== 'string') {
      return res.status(502).json({ error: 'DeepSeek returned an unexpected response.' });
    }

    return res.status(200).json({ reply });
  } catch (error) {
    return res.status(502).json({
      error: error?.name === 'TimeoutError'
        ? 'DeepSeek request timed out. Please retry.'
        : 'Could not reach DeepSeek. Check connectivity and retry.'
    });
  }
}
