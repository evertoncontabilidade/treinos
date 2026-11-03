// Login, logout e "guard" de páginas (redireciona quem não pode estar ali).
// O guard é só conforto de navegação: a proteção real dos dados é o RLS no Supabase.
import { supabase } from './supabase.js';

const CHAVE_PERFIL = 'tdd:perfil';

export function nickParaEmail(entrada) {
  const valor = entrada.trim().toLowerCase();
  return valor.includes('@') ? valor : `${valor}@academia.com`;
}

export async function entrar(entrada, senha) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: nickParaEmail(entrada),
    password: senha,
  });
  if (error) throw new Error('Nickname ou senha incorretos.');
  return data.user;
}

export async function sair() {
  localStorage.removeItem(CHAVE_PERFIL);
  await supabase.auth.signOut();
  window.location.href = 'index.html';
}

function lerPerfilCache(userId) {
  try {
    const p = JSON.parse(localStorage.getItem(CHAVE_PERFIL) || 'null');
    return p && p.id === userId ? p : null;
  } catch {
    return null;
  }
}

/** Busca o perfil do usuário. Sem internet, usa a última cópia guardada no aparelho. */
export async function carregarPerfil(user) {
  const { data, error } = await supabase
    .from('perfis')
    .select('id, nome, nickname, role, foto_url, frase')
    .eq('id', user.id)
    .single();

  if (!error && data) {
    localStorage.setItem(CHAVE_PERFIL, JSON.stringify(data));
    return data;
  }
  if (!navigator.onLine || /fetch|network/i.test(error?.message || '')) {
    const cache = lerPerfilCache(user.id);
    if (cache) return cache;
  }
  return null;
}

export function paginaInicial(role) {
  return role === 'admin' ? 'admin.html' : 'aluno.html';
}

/**
 * Chame no topo de cada página protegida.
 * papel: 'admin' | 'usuario'. Retorna { user, perfil } ou redireciona e devolve null.
 */
export async function exigirPapel(papel) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.replace('index.html');
    return null;
  }
  const perfil = await carregarPerfil(session.user);
  if (!perfil) {
    await sair();
    return null;
  }
  if (perfil.role !== papel) {
    window.location.replace(paginaInicial(perfil.role));
    return null;
  }
  return { user: session.user, perfil };
}
