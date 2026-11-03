// Edge Function: criar-aluno
// Só um admin logado consegue chamar. Usa a service_role (que nunca vai para o navegador)
// para criar o usuário no Auth e o perfil, e desfaz tudo se algo der errado.
//
// Deploy:  supabase functions deploy criar-aluno
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ erro: 'Método não permitido' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // 1) Quem está chamando?
  const authorization = req.headers.get('Authorization') ?? '';
  const chamador = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
  const { data: { user }, error: erroUser } = await chamador.auth.getUser();
  if (erroUser || !user) return json({ erro: 'Não autenticado' }, 401);

  // 2) É admin?
  const admin = createClient(url, service);
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
    foto_url: foto_url || 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
    frase: frase || 'Foco na missão!',
  });
  if (erroPerfil) {
    await admin.auth.admin.deleteUser(criado.user.id); // não deixa usuário órfão
    return json({ erro: erroPerfil.message }, 400);
  }

  return json({ ok: true, id: criado.user.id });
});
