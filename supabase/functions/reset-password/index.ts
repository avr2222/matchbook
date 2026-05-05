import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { phone, answer1, answer2, newPassword } = await req.json()

    if (!phone || !answer1 || !answer2 || !newPassword) {
      return Response.json({ error: 'Missing required fields' }, { status: 400, headers: corsHeaders })
    }
    if (newPassword.length < 6) {
      return Response.json({ error: 'Password must be at least 6 characters' }, { status: 400, headers: corsHeaders })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: signup, error: fetchErr } = await supabase
      .from('user_signups')
      .select('auth_user_id, security_answer_1, security_answer_2, status')
      .eq('phone', phone.replace(/\D/g, ''))
      .maybeSingle()

    if (fetchErr || !signup) {
      return Response.json({ error: 'No account found for this number' }, { status: 404, headers: corsHeaders })
    }
    if (signup.status !== 'approved') {
      return Response.json({ error: 'Account not yet approved' }, { status: 403, headers: corsHeaders })
    }
    if (!signup.auth_user_id) {
      return Response.json({ error: 'Account not fully set up — contact admin' }, { status: 400, headers: corsHeaders })
    }

    const a1Match = (signup.security_answer_1 ?? '').trim().toLowerCase() === answer1.trim().toLowerCase()
    const a2Match = (signup.security_answer_2 ?? '').trim().toLowerCase() === answer2.trim().toLowerCase()

    if (!a1Match || !a2Match) {
      return Response.json({ error: 'Answers do not match. Contact admin if you need help.' }, { status: 401, headers: corsHeaders })
    }

    const { error: updateErr } = await supabase.auth.admin.updateUserById(signup.auth_user_id, {
      password: newPassword,
    })
    if (updateErr) {
      return Response.json({ error: updateErr.message }, { status: 500, headers: corsHeaders })
    }

    return Response.json({ ok: true }, { headers: corsHeaders })
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500, headers: corsHeaders })
  }
})
