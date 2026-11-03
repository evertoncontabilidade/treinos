// Edge Function: criar-aluno
// Só um admin logado consegue chamar. Usa a chave secreta do projeto (que nunca vai para o navegador)
// para criar o usuário no Auth e o perfil, e desfaz tudo se algo der errado.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

// Chave secreta do projeto: formato novo (sb_secret_...) ou, se não existir, o antigo (service_role).
function chaveSecreta(): string {
  try {
    const mapa = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}');
    if (mapa?.default) return mapa.default;
  } catch { /* cai para a chave antiga */ }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
}

async function tratar(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ erro: 'Método não permitido' }, 405);

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const secreta = chaveSecreta();
  if (!url || !secreta) return json({ erro: 'A função não encontrou as chaves do projeto' }, 500);

  const admin = createClient(url, secreta, { auth: { persistSession: false, autoRefreshToken: false } });

  // 1) Quem está chamando? (valida o token do usuário logado)
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ erro: 'Não autenticado' }, 401);
  const { data: dadosUser, error: erroUser } = await admin.auth.getUser(token);
  const user = dadosUser?.user;
  if (erroUser || !user) return json({ erro: 'Sessão inválida. Saia e entre de novo.' }, 401);

  // 2) É admin?
  const { data: perfilChamador } = await admin.from('perfis').select('role').eq('id', user.id).single();
  if (perfilChamador?.role !== 'admin') return json({ erro: 'Apenas administradores' }, 403);

  // 3) Valida os dados
  let corpo: Record<string, string>;
  try { corpo = await req.json(); } catch { return json({ erro: 'Corpo inválido' }, 400); }

  const nome = String(corpo.nome ?? '').trim();
  const nick = String(corpo.nick ?? '').trim().toLowerCase();
  const senha = String(corpo.senha ?? '');
  const foto_url = String(corpo.foto_url ?? '').trim();
  const frase = String(corpo.frase ?? '').trim();

  if (nome.length < 2 || nome.length > 80) return json({ erro: 'Informe o nome (2 a 80 caracteres)' }, 400);
  if (!/^[a-z0-9_.-]{3,30}$/.test(nick)) return json({ erro: 'Nickname: 3 a 30 caracteres (letras minúsculas, números, _ . -)' }, 400);
  if (senha.length < 8) return json({ erro: 'A senha precisa ter pelo menos 8 caracteres' }, 400);
  if (foto_url && !/^https:\/\//i.test(foto_url)) return json({ erro: 'A foto precisa ser um link https://' }, 400);

  // 4) Cria o usuário (já confirmado) e o perfil
  const { data: criado, error: erroCriar } = await admin.auth.admin.createUser({
    email: `${nick}@academia.com`,
    password: senha,
    email_confirm: true,
  });
  if (erroCriar || !criado.user) {
    const jaExiste = /already|registered|exists/i.test(erroCriar?.message ?? '');
    return json({ erro: jaExiste ? 'Esse nickname já está em uso' : (erroCriar?.message ?? 'Erro ao criar usuário') }, 400);
  }

  const { error: erroPerfil } = await admin.from('perfis').insert({
    id: criado.user.id,
    nome,
    nickname: nick,
    role: 'usuario',
    foto_url: foto_url || null, // sem foto: o app mostra o avatar local; o aluno escolhe a dele depois
    frase: frase || 'Foco na missão!',
  });
  if (erroPerfil) {
    await admin.auth.admin.deleteUser(criado.user.id); // não deixa usuário órfão
    return json({ erro: erroPerfil.message }, 400);
  }

  return json({ ok: true, id: criado.user.id });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    return await tratar(req);
  } catch (e) {
    // Qualquer falha inesperada volta como JSON (com CORS), em vez de um erro genérico no navegador.
    console.error(e);
    return json({ erro: `Erro interno: ${e instanceof Error ? e.message : String(e)}` }, 500);
  }
});
