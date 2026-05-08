import { createClient } from 'jsr:@supabase/supabase-js@2';

// ============================================================
// HTCB AI PROXY — Edge Function v3
// Hooks: beforePrompt → cacheRead → callHaiku → validateResponse
//        → validateScripture → validateTone → cacheWrite → afterResponse
//
// callTypes:
//   scripture — daily verse, cache key scripture_<YYYY-MM-DD>, TTL 24h
//   qotw      — weekly Bible-study questions for 7 groups, cache key
//               qotw_<week-start-YYYY-MM-DD>, TTL 168h
//   outreach  — 5 growth ideas, cache key outreach_<YYYY-MM-DD>, TTL 24h
//
// QOTW groups (must match the 7 panels in index.html):
//   men, women, ya (Young Adults 18–35),
//   joshua (Joshua Generation — Ministers; ministry-growth focus: shepherding,
//           calling, leading the flock),
//   family, senior, youth (teens 13–17)
//
// Scripture variety: hook_beforePrompt pulls the last 14 days of refs from
// ht_ai_cache and tells Haiku "avoid these." Without that injection Haiku
// has no memory of prior days and gravitates toward famous verses (e.g.
// John 3:16) every day. With it, the daily verse actually rotates.
// ============================================================

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
// Per CLAUDE.md: prefer the new SB_SECRET_KEY, fall back to the legacy name.
const SUPABASE_SERVICE_KEY =
  Deno.env.get('SB_SECRET_KEY') ||
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, apikey, Authorization',
};

async function getRecentScriptureRefs(days = 14): Promise<string[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const { data } = await sb
    .from('ht_ai_cache')
    .select('response_json, created_at')
    .eq('call_type', 'scripture')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })
    .limit(days);
  if (!data) return [];
  return data
    .map((row: { response_json: { ref?: string } }) =>
      String(row.response_json?.ref || '')
    )
    .filter(Boolean);
}

async function hook_beforePrompt(
  callType: string,
  userPrompt: string,
): Promise<{ system: string; prompt: string }> {
  const system = `You are the AI ministry assistant for Harvest Time Church of Baytown (HTCB),
a Spirit-filled Christian church in Baytown, Texas under Bishop Tonya L. Kearney.

STRICT DOCTRINE RULES — never violate these:
- All scripture MUST come from the Holy Bible only (KJV, NKJV, NIV, ESV, or AMP)
- Never fabricate, paraphrase, or approximate a Bible verse — use exact canonical text
- Scripture references must follow exact format: Book Chapter:Verse (Translation)
- Never reference other religions, philosophies, cults, or secular ideologies
- Never generate content that contradicts orthodox Christian doctrine
- Tone is always warm, pastoral, faith-filled, and appropriate for all ages
- If you are uncertain about a verse, choose a well-known, verifiable one
- This content will be displayed in a church app seen by the entire congregation
- For Senior questions: honor the wisdom, life experience, and legacy of seasoned saints 55+
  Use warm, dignified language. Focus on faith legacy, gratitude, and enduring hope.

CHURCH CONTEXT:
- Pastor: Bishop Tonya L. Kearney
- Location: 308 Graham Street, Baytown Texas 77520
- Services: Sunday 10am, Wednesday Bible Study 7:30pm, Friday Prayer 7:30pm
- Mission: Love all, transform lives regardless of race, age, or social status`;

  let prompt = userPrompt;

  if (callType === 'scripture') {
    const recent = await getRecentScriptureRefs(14);
    if (recent.length) {
      prompt =
        `${userPrompt}\n\nAVOID these recently-used references — pick a different book, chapter, AND theme. Vary translation across KJV/NKJV/NIV/ESV/AMP. Do not repeat any of these:\n` +
        recent.map((r) => `- ${r}`).join('\n');
    }
  }

  return { system, prompt };
}

async function hook_cacheRead(
  cacheKey: string,
): Promise<Record<string, unknown> | null> {
  const { data } = await sb
    .from('ht_ai_cache')
    .select('response_json, expires_at')
    .eq('cache_key', cacheKey)
    .single();
  if (!data) return null;
  if (new Date(data.expires_at) < new Date()) return null;
  return data.response_json;
}

async function hook_callHaiku(system: string, prompt: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      system,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Haiku API error: ${res.status}`);
  const data = await res.json();
  return (
    data.content
      ?.map((b: { type: string; text?: string }) => b.text || '')
      .join('') || ''
  );
}

const QOTW_GROUPS = [
  'men',
  'women',
  'ya',
  'joshua',
  'family',
  'senior',
  'youth',
] as const;

function hook_validateResponse(
  raw: string,
  callType: string,
): Record<string, unknown> {
  const cleaned = raw.replace(/```json|```/g, '').trim();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('AI returned invalid JSON — blocked before reaching congregation');
  }
  if (callType === 'scripture') {
    if (!parsed.verse || !parsed.ref || !parsed.decl)
      throw new Error('Scripture response missing required fields: verse, ref, decl');
  }
  if (callType === 'qotw') {
    const missing = QOTW_GROUPS.filter((g) => !parsed[g]);
    if (missing.length)
      throw new Error(`QOTW response missing required fields: ${missing.join(', ')}`);
  }
  if (callType === 'outreach') {
    if (!parsed.suggestions || !Array.isArray(parsed.suggestions))
      throw new Error('Outreach response missing suggestions array');
  }
  return parsed;
}

function hook_validateScripture(
  parsed: Record<string, unknown>,
  callType: string,
): void {
  if (callType !== 'scripture') return;
  const ref = String(parsed.ref || '');
  // Allow multi-word book names like "Song of Solomon" — \w+ followed by
  // optional " of \w+" (covers Song of Solomon / Song of Songs).
  const refPattern =
    /^[1-3]?\s?[A-Za-z]+(?:\s+of\s+[A-Za-z]+)?\s+\d+:\d+(-\d+)?\s*\((KJV|NKJV|NIV|ESV|AMP)\)$/;
  if (!refPattern.test(ref))
    throw new Error(`Scripture reference failed validation: "${ref}"`);
  const verse = String(parsed.verse || '').toLowerCase();
  const blockedPhrases = [
    'god helps those who help themselves',
    'cleanliness is next to godliness',
    'money is the root of all evil',
  ];
  for (const phrase of blockedPhrases)
    if (verse.includes(phrase)) throw new Error(`Blocked Bible misquote: "${phrase}"`);
}

function hook_validateTone(parsed: Record<string, unknown>): void {
  const allText = JSON.stringify(parsed).toLowerCase();
  const blockedWords = [
    'allah',
    'buddha',
    'krishna',
    'quran',
    'torah',
    'synagogue',
    'mosque',
    'astrology',
    'horoscope',
    'karma',
    'reincarnation',
    'universe as god',
    'manifesting',
    'law of attraction',
    'chakra',
    'meditation as enlightenment',
  ];
  for (const word of blockedWords)
    if (allText.includes(word)) throw new Error(`Tone validation failed: "${word}" detected`);
}

async function hook_cacheWrite(
  cacheKey: string,
  callType: string,
  responseJson: Record<string, unknown>,
): Promise<void> {
  const ttlHours = callType === 'qotw' ? 168 : 24;
  const expiresAt = new Date(
    Date.now() + ttlHours * 60 * 60 * 1000,
  ).toISOString();
  await sb.from('ht_ai_cache').upsert(
    {
      cache_key: cacheKey,
      call_type: callType,
      response_json: responseJson,
      expires_at: expiresAt,
    },
    { onConflict: 'cache_key' },
  );
}

async function hook_afterResponse(
  callType: string,
  cacheHit: boolean,
  responseJson: Record<string, unknown>,
): Promise<void> {
  const preview =
    callType === 'scripture'
      ? String((responseJson as { ref?: string }).ref || '')
      : callType === 'qotw'
        ? String((responseJson as { youth?: string }).youth || '').slice(0, 80)
        : `${((responseJson as { suggestions?: unknown[] }).suggestions || []).length} suggestions`;
  await sb.from('ht_ai_logs').insert({
    call_type: callType,
    cache_hit: cacheHit,
    response_preview: preview,
  });
}

function getFallback(callType: string): Record<string, unknown> {
  if (callType === 'scripture') {
    return {
      verse: 'I can do all things through Christ who strengthens me.',
      ref: 'Philippians 4:13 (NKJV)',
      decl:
        'Today you are not limited by what you feel — you are empowered by what He promised.',
    };
  }
  if (callType === 'qotw') {
    return {
      men:
        'Where is God calling you to lead with humility — at home, at work, or in this church family?',
      women:
        'What is one place in your life where God is asking you to trust Him more deeply this season?',
      ya:
        'What is one thing God is calling you to step into this season that fear has been holding you back from?',
      joshua:
        'Where is God growing your ministry assignment right now — and what is He asking you to surrender so the flock can flourish?',
      family:
        'What faith habit do you want to build into your family this year, and what is standing in the way?',
      senior:
        'What is the greatest lesson your walk with God has taught you — and who needs to hear it from you today?',
      youth:
        'What is something you sense God speaking to you about that nobody else knows yet?',
    };
  }
  return {
    suggestions: [
      {
        group: 'Young Adults',
        idea:
          'Host a Friday night worship event — invite through Instagram Reels showing real testimonies.',
      },
      {
        group: 'Families',
        idea:
          'Partner with Baytown schools for back-to-school drives — serve first, invite second.',
      },
      {
        group: 'Seniors',
        idea:
          'Launch a monthly phone prayer chain for sick and shut-in members — personal outreach builds loyalty.',
      },
    ],
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS });
  }

  try {
    const { callType, prompt } = await req.json();
    if (!callType || !prompt)
      return new Response(
        JSON.stringify({ error: 'callType and prompt are required' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );

    const today = new Date().toISOString().slice(0, 10);
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekKey = weekStart.toISOString().slice(0, 10);
    const cacheKey =
      callType === 'qotw' ? `${callType}_${weekKey}` : `${callType}_${today}`;

    const cached = await hook_cacheRead(cacheKey);
    if (cached) {
      await hook_afterResponse(callType, true, cached);
      return new Response(JSON.stringify(cached), {
        headers: {
          ...CORS,
          'Content-Type': 'application/json',
          'X-Cache': 'HIT',
        },
      });
    }

    const { system, prompt: enrichedPrompt } = await hook_beforePrompt(
      callType,
      prompt,
    );

    let raw: string;
    try {
      raw = await hook_callHaiku(system, enrichedPrompt);
    } catch (err) {
      console.error('Haiku call failed:', err);
      const fallback = getFallback(callType);
      return new Response(JSON.stringify(fallback), {
        headers: {
          ...CORS,
          'Content-Type': 'application/json',
          'X-Cache': 'FALLBACK',
        },
      });
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = hook_validateResponse(raw, callType);
    } catch (err) {
      console.error('Validation failed:', err);
      const fallback = getFallback(callType);
      await hook_afterResponse(callType, false, fallback);
      return new Response(JSON.stringify(fallback), {
        headers: {
          ...CORS,
          'Content-Type': 'application/json',
          'X-Cache': 'FALLBACK',
        },
      });
    }

    try {
      hook_validateScripture(parsed, callType);
    } catch (err) {
      console.error('Scripture validation failed:', err);
      const fallback = getFallback(callType);
      await hook_afterResponse(callType, false, fallback);
      return new Response(JSON.stringify(fallback), {
        headers: {
          ...CORS,
          'Content-Type': 'application/json',
          'X-Cache': 'FALLBACK',
        },
      });
    }

    try {
      hook_validateTone(parsed);
    } catch (err) {
      console.error('Tone validation failed:', err);
      const fallback = getFallback(callType);
      await hook_afterResponse(callType, false, fallback);
      return new Response(JSON.stringify(fallback), {
        headers: {
          ...CORS,
          'Content-Type': 'application/json',
          'X-Cache': 'FALLBACK',
        },
      });
    }

    await hook_cacheWrite(cacheKey, callType, parsed);
    await hook_afterResponse(callType, false, parsed);

    return new Response(JSON.stringify(parsed), {
      headers: {
        ...CORS,
        'Content-Type': 'application/json',
        'X-Cache': 'MISS',
      },
    });
  } catch (err) {
    console.error('HTCB AI Proxy error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
