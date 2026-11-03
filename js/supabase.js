// Cliente único do Supabase, usado por todas as páginas.
// A chave "publishable" é feita para ficar no navegador: quem protege os dados é o RLS (supabase/02_rls.sql).
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://qdmvlpnevvxvjdvgooeh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_r-__wMRaOzmh1AGM-tSkbQ_Kp5HkQUx';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
