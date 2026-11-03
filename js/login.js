import { supabase } from './supabase.js';
import { entrar, carregarPerfil, paginaInicial } from './auth.js';
import { toast, comCarregando } from './ui.js';
import './pwa.js';

const form = document.getElementById('form-login');
const botao = document.getElementById('btn-entrar');

// Já está logado? Vai direto para a página certa.
(async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  const perfil = await carregarPerfil(session.user);
  if (perfil) window.location.replace(paginaInicial(perfil.role));
})();

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const usuario = document.getElementById('usuario').value;
  const senha = document.getElementById('senha').value;
  if (!usuario.trim() || !senha) return toast('Preencha usuário e senha.', 'erro');

  await comCarregando(botao, async () => {
    try {
      const user = await entrar(usuario, senha);
      const perfil = await carregarPerfil(user);
      if (!perfil) throw new Error('Perfil não encontrado. Fale com o administrador.');
      window.location.href = paginaInicial(perfil.role);
    } catch (erro) {
      toast(erro.message, 'erro');
    }
  });
});
