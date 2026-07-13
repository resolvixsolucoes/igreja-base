-- ═══════════════════════════════════════════════════════════════════════
-- SCHEMA BASE — LÓGICA (índices, funções, triggers, RLS, policies)
-- ═══════════════════════════════════════════════════════════════════════
-- Complementa schema-00-base.sql com todo o comportamento dinâmico
-- extraído da instalação em produção.
--
-- IMPORTANTE: rodar APÓS schema-00-base.sql. Depois disso, rodar todas as
-- schema-*.sql (migrations incrementais) em ordem alfabética.
-- ═══════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS disponibilidade_ministerio_id_data_idx ON public.disponibilidade USING btree (ministerio_id, data);
CREATE INDEX IF NOT EXISTS disponibilidade_voluntario_id_idx ON public.disponibilidade USING btree (voluntario_id);
CREATE UNIQUE INDEX IF NOT EXISTS filhos_unique_nome_nasc ON public.filhos USING btree (lower(nome), data_nascimento) WHERE (data_nascimento IS NOT NULL);
CREATE INDEX IF NOT EXISTS financeiro_categoria_id_idx ON public.financeiro USING btree (categoria_id);
CREATE UNIQUE INDEX IF NOT EXISTS financeiro_categorias_nome_uniq ON public.financeiro_categorias USING btree (lower(nome));
CREATE INDEX IF NOT EXISTS financeiro_conta_id_idx ON public.financeiro USING btree (conta_id);
CREATE UNIQUE INDEX IF NOT EXISTS financeiro_contas_nome_uniq ON public.financeiro_contas USING btree (lower(nome));
CREATE INDEX IF NOT EXISTS financeiro_excluido_em_idx ON public.financeiro USING btree (excluido_em) WHERE (excluido_em IS NULL);
CREATE INDEX IF NOT EXISTS financeiro_forma_pgto_id_idx ON public.financeiro USING btree (forma_pgto_id);
CREATE UNIQUE INDEX IF NOT EXISTS financeiro_formas_pgto_nome_uniq ON public.financeiro_formas_pgto USING btree (lower(nome));
CREATE INDEX IF NOT EXISTS financeiro_log_criado_em_idx ON public.financeiro_log USING btree (criado_em DESC);
CREATE INDEX IF NOT EXISTS financeiro_log_financeiro_id_idx ON public.financeiro_log USING btree (financeiro_id);
CREATE INDEX IF NOT EXISTS financeiro_recorrencia_id_idx ON public.financeiro USING btree (recorrencia_id);
CREATE INDEX IF NOT EXISTS financeiro_recorrencias_ativo_idx ON public.financeiro_recorrencias USING btree (ativo);
CREATE INDEX IF NOT EXISTS idx_agendamentos_conselheiro ON public.pastoral_agendamentos USING btree (conselheiro_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_disp ON public.pastoral_agendamentos USING btree (disponibilidade_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_status ON public.pastoral_agendamentos USING btree (status);
CREATE INDEX IF NOT EXISTS idx_anotacoes_aluno ON public.anotacoes_lms USING btree (aluno_id);
CREATE INDEX IF NOT EXISTS idx_aulas_modulo ON public.aulas_lms USING btree (modulo_id);
CREATE INDEX IF NOT EXISTS idx_certificados_aluno ON public.certificados_lms USING btree (aluno_id);
CREATE INDEX IF NOT EXISTS idx_certificados_curso ON public.certificados_lms USING btree (curso_id);
CREATE INDEX IF NOT EXISTS idx_comentarios_aluno ON public.comentarios_lms USING btree (aluno_id);
CREATE INDEX IF NOT EXISTS idx_comentarios_aula ON public.comentarios_lms USING btree (aula_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comentarios_parent ON public.comentarios_lms USING btree (parent_id);
CREATE INDEX IF NOT EXISTS idx_comunicacao_mensagens_thread ON public.comunicacao_mensagens USING btree (thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comunicacao_threads_a ON public.comunicacao_threads USING btree (ministerio_a_id);
CREATE INDEX IF NOT EXISTS idx_comunicacao_threads_b ON public.comunicacao_threads USING btree (ministerio_b_id);
CREATE INDEX IF NOT EXISTS idx_disponibilidade_evento ON public.disponibilidade USING btree (evento_id) WHERE (evento_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_eventos_igreja_data ON public.eventos_igreja USING btree (data);
CREATE INDEX IF NOT EXISTS idx_eventos_igreja_ministerio ON public.eventos_igreja USING btree (ministerio_id);
CREATE INDEX IF NOT EXISTS idx_eventos_igreja_tipo ON public.eventos_igreja USING btree (tipo);
CREATE INDEX IF NOT EXISTS idx_eventos_serie ON public.eventos_igreja USING btree (recorrencia_serie_id) WHERE (recorrencia_serie_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_inscricoes_evento_id ON public.inscricoes_eventos USING btree (evento_id);
CREATE INDEX IF NOT EXISTS idx_levinho_checkins_data_sala ON public.levinho_checkins USING btree (data_evento, sala_id);
CREATE INDEX IF NOT EXISTS idx_levinho_checkins_evento ON public.levinho_checkins USING btree (evento_id) WHERE (evento_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_levinho_checkins_filho ON public.levinho_checkins USING btree (filho_id) WHERE (filho_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_levinho_materiais_sala ON public.levinho_materiais USING btree (sala_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lvc_telefone ON public.levinho_visitantes_criancas USING btree (regexp_replace(responsavel_telefone, '\D'::text, ''::text, 'g'::text));
CREATE INDEX IF NOT EXISTS idx_lvs_sala ON public.levinho_voluntarios_salas USING btree (sala_id);
CREATE INDEX IF NOT EXISTS idx_materiais_aula ON public.materiais_lms USING btree (aula_id);
CREATE INDEX IF NOT EXISTS idx_materiais_ordem ON public.materiais_lms USING btree (aula_id, ordem);
CREATE INDEX IF NOT EXISTS idx_matriculas_aluno ON public.matriculas_lms USING btree (aluno_id);
CREATE INDEX IF NOT EXISTS idx_matriculas_curso ON public.matriculas_lms USING btree (curso_id);
CREATE INDEX IF NOT EXISTS idx_mesas_lider_1 ON public.mesas USING btree (lider_1_membro_id);
CREATE INDEX IF NOT EXISTS idx_mesas_lider_2 ON public.mesas USING btree (lider_2_membro_id);
CREATE INDEX IF NOT EXISTS idx_min_lideres_ministerio ON public.ministerio_lideres USING btree (ministerio_id);
CREATE INDEX IF NOT EXISTS idx_min_lideres_voluntario ON public.ministerio_lideres USING btree (voluntario_id);
CREATE INDEX IF NOT EXISTS idx_ministerio_avisos_sala ON public.ministerio_avisos USING btree (sala_id) WHERE (sala_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_ministerio_escala_checkin_em ON public.ministerio_escala USING btree (checkin_em) WHERE (checkin_em IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_ministerio_escala_sala ON public.ministerio_escala USING btree (sala_id) WHERE (sala_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_modulos_curso ON public.modulos_lms USING btree (curso_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_aluno ON public.pagamentos_lms USING btree (aluno_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_curso ON public.pagamentos_lms USING btree (curso_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_gw_order ON public.pagamentos_lms USING btree (gateway_order_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_status ON public.pagamentos_lms USING btree (status);
CREATE INDEX IF NOT EXISTS idx_pastoral_disp_conselheiro ON public.pastoral_disponibilidade USING btree (conselheiro_id);
CREATE INDEX IF NOT EXISTS idx_pastoral_disp_data ON public.pastoral_disponibilidade USING btree (data);
CREATE INDEX IF NOT EXISTS idx_pastoral_relatorios_telefone ON public.pastoral_relatorios USING btree (telefone_fiel);
CREATE INDEX IF NOT EXISTS idx_ppc_role_pagina ON public.perfil_permissoes_campos USING btree (role, pagina);
CREATE INDEX IF NOT EXISTS idx_progresso_matricula ON public.progresso_aulas_lms USING btree (matricula_id);
CREATE INDEX IF NOT EXISTS idx_vme_material ON public.voluntario_materiais_entregas USING btree (material_id);
CREATE INDEX IF NOT EXISTS idx_vme_vol ON public.voluntario_materiais_entregas USING btree (voluntario_id);
CREATE INDEX IF NOT EXISTS idx_voluntario_materiais_evento ON public.voluntario_materiais USING btree (evento_id);
CREATE INDEX IF NOT EXISTS idx_voluntario_materiais_min ON public.voluntario_materiais USING btree (ministerio_id) WHERE (ministerio_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uq_levinho_checkins_codigo_dia ON public.levinho_checkins USING btree (data_evento, codigo_retirada);
CREATE UNIQUE INDEX IF NOT EXISTS uq_lvc_nome_telefone ON public.levinho_visitantes_criancas USING btree (lower(translate(nome, 'áéíóúãõâêîôûçÁÉÍÓÚÃÕÂÊÎÔÛÇ'::text, 'aeiouaoaeioucaeiouaoaeiouc'::text)), regexp_replace(responsavel_telefone, '\D'::text, ''::text, 'g'::text));
CREATE UNIQUE INDEX IF NOT EXISTS ux_pastoral_relatorios_agendamento ON public.pastoral_relatorios USING btree (agendamento_id);


-- ═══════════════════════════════════════════════════════════════
-- FUNCTIONS
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._levinho_gen_codigo()
 RETURNS text
 LANGUAGE plpgsql
AS $function$
declare
  alfabeto constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  resultado text := '';
  i int;
begin
  for i in 1..4 loop
    resultado := resultado ||
      substr(alfabeto, 1 + floor(random() * length(alfabeto))::int, 1);
  end loop;
  return resultado;
end;
$function$;

CREATE OR REPLACE FUNCTION public._levinho_idade(p_nasc date)
 RETURNS smallint
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select extract(year from age(current_date, p_nasc))::smallint;
$function$;

CREATE OR REPLACE FUNCTION public.is_admin_prod()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.perfis
    where id = auth.uid() and role = 'admin'
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_curso_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.perfis
    WHERE id = auth.uid()
      AND gerencia_cursos = true
      AND ativo = true
  );
$function$;

CREATE OR REPLACE FUNCTION public.eh_conselheiro_ativo()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.conselheiros c
    join public.perfis pf on pf.membro_id = c.membro_id
    where pf.id = auth.uid()
      and c.ativo = true
  );
$function$;

CREATE OR REPLACE FUNCTION public.eh_conselheiro_da_disponibilidade(p_disp uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.pastoral_disponibilidade d
    join public.conselheiros c  on c.id          = d.conselheiro_id
    join public.perfis       pf on pf.membro_id  = c.membro_id
    where d.id  = p_disp
      and pf.id = auth.uid()
  );
$function$;

CREATE OR REPLACE FUNCTION public.eh_conselheiro_do_agendamento(p_agendamento uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.pastoral_agendamentos a
    join public.conselheiros c  on c.id          = a.conselheiro_id
    join public.perfis       pf on pf.membro_id  = c.membro_id
    where a.id  = p_agendamento
      and pf.id = auth.uid()
  );
$function$;

CREATE OR REPLACE FUNCTION public.eh_lider_de_algum_ministerio()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.ministerio_lideres ml
    join public.voluntarios v  on v.id          = ml.voluntario_id
    join public.perfis      pf on pf.membro_id  = v.membro_id
    where pf.id = auth.uid()
  );
$function$;

CREATE OR REPLACE FUNCTION public.eh_lider_do_ministerio(p_ministerio uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.ministerio_lideres ml
    join public.voluntarios v  on v.id          = ml.voluntario_id
    join public.perfis      pf on pf.membro_id  = v.membro_id
    where pf.id            = auth.uid()
      and ml.ministerio_id = p_ministerio
  );
$function$;

CREATE OR REPLACE FUNCTION public.eh_lider_levinho()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.ministerio_lideres ml
    join public.voluntarios v   on v.id          = ml.voluntario_id
    join public.perfis      pf  on pf.membro_id  = v.membro_id
    join public.ministerios m   on m.id          = ml.ministerio_id
    where pf.id = auth.uid()
      and lower(translate(m.nome,
            'áéíóúãõâêîôûçÁÉÍÓÚÃÕÂÊÎÔÛÇ',
            'aeiouaoaeioucaeiouaoaeiouc')) like 'levinho%'
  );
$function$;

CREATE OR REPLACE FUNCTION public.eh_voluntario_levinho()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.voluntarios v
    join public.perfis      pf on pf.membro_id = v.membro_id
    join public.ministerios m  on m.id::text   = any(v.ministerio_ids)
    where pf.id = auth.uid()
      and lower(translate(m.nome,
            'áéíóúãõâêîôûçÁÉÍÓÚÃÕÂÊÎÔÛÇ',
            'aeiouaoaeioucaeiouaoaeiouc')) like 'levinho%'
  );
$function$;

CREATE OR REPLACE FUNCTION public.tem_perm_granular(p_pagina text, p_aba text, p_acao text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ok boolean;
begin
  if public.is_admin_prod() then
    return true;
  end if;

  select
    case p_acao
      when 'ver'       then ver
      when 'adicionar' then adicionar
      when 'editar'    then editar
      when 'excluir'   then excluir
      else false
    end
    into v_ok
  from public.permissoes_granular
  where user_id = auth.uid()
    and pagina  = p_pagina
    and aba     = p_aba;

  return coalesce(v_ok, false);
end;
$function$;

CREATE OR REPLACE FUNCTION public.financeiro_mes_fechado(p_data date)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when p_data is null then false
    else exists (
      select 1 from public.financeiro_fechamentos f
      where f.ano = extract(year  from p_data)::int
        and f.mes = extract(month from p_data)::int
    )
  end;
$function$;

CREATE OR REPLACE FUNCTION public.financeiro_set_audit()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if TG_OP = 'INSERT' then
    NEW.criado_por := coalesce(NEW.criado_por, auth.uid());
    NEW.criado_em  := coalesce(NEW.criado_em, now());
  elsif TG_OP = 'UPDATE' then
    NEW.atualizado_por := auth.uid();
    NEW.atualizado_em  := now();
    NEW.criado_por := OLD.criado_por;
    NEW.criado_em  := OLD.criado_em;
  end if;
  return NEW;
end;
$function$;

CREATE OR REPLACE FUNCTION public.financeiro_write_log()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if TG_OP = 'INSERT' then
    insert into public.financeiro_log (financeiro_id, acao, payload_depois, usuario_id)
      values (NEW.id, 'insert', to_jsonb(NEW), auth.uid());
    return NEW;
  elsif TG_OP = 'UPDATE' then
    insert into public.financeiro_log (financeiro_id, acao, payload_antes, payload_depois, usuario_id)
      values (NEW.id, 'update', to_jsonb(OLD), to_jsonb(NEW), auth.uid());
    return NEW;
  elsif TG_OP = 'DELETE' then
    insert into public.financeiro_log (financeiro_id, acao, payload_antes, usuario_id)
      values (OLD.id, 'delete', to_jsonb(OLD), auth.uid());
    return OLD;
  end if;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at_lms()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin new.updated_at = now(); return new; end;
$function$;

CREATE OR REPLACE FUNCTION public.tg_pastoral_relatorios_touch()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.pagamentos_lms_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recalc_curso_carga_horaria()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_curso_id uuid;
begin
  if (tg_op = 'DELETE') then
    select curso_id into v_curso_id from public.modulos_lms where id = old.modulo_id;
  else
    select curso_id into v_curso_id from public.modulos_lms where id = new.modulo_id;
  end if;

  if v_curso_id is not null then
    update public.cursos_lms
       set carga_horaria_min = coalesce((
         select sum(a.duracao_min)
           from public.aulas_lms a
           join public.modulos_lms m on m.id = a.modulo_id
          where m.curso_id = v_curso_id
       ), 0)
     where id = v_curso_id;
  end if;

  return coalesce(new, old);
end;
$function$;

CREATE OR REPLACE FUNCTION public.atualizar_role_lider()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF NEW.eh_lider = true THEN
    UPDATE perfis SET role = 'lider', ministerio = NEW.ministerio WHERE id = NEW.user_id;
  ELSIF NEW.eh_lider = false THEN
    UPDATE perfis SET role = 'membro', ministerio = NEW.ministerio WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.perfis (id, nome, email, role) VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'consulta')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_aluno()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.alunos (
    id, nome, email, telefone,
    cep, logradouro, numero, complemento,
    bairro, cidade, uf, is_membro
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email,'@',1)),
    NEW.email,
    NEW.raw_user_meta_data->>'telefone',
    NEW.raw_user_meta_data->>'cep',
    NEW.raw_user_meta_data->>'logradouro',
    NEW.raw_user_meta_data->>'numero',
    NEW.raw_user_meta_data->>'complemento',
    NEW.raw_user_meta_data->>'bairro',
    NEW.raw_user_meta_data->>'cidade',
    NEW.raw_user_meta_data->>'uf',
    COALESCE((NEW.raw_user_meta_data->>'is_membro')::boolean, false)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pode_acao_conteudos(p_aba text, p_acao text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.is_admin_prod() or exists (
    select 1 from public.permissoes_granular
    where user_id = auth.uid()
      and pagina  = 'conteudos'
      and aba     = p_aba
      and case p_acao
        when 'ver'       then ver
        when 'adicionar' then adicionar
        when 'editar'    then editar
        when 'excluir'   then excluir
        else false
      end
  );
$function$;

CREATE OR REPLACE FUNCTION public.pode_editar_frequencia_cultos()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    public.is_admin_prod()
    or exists (
      select 1 from public.permissoes_granular
      where user_id = auth.uid() and pagina = 'agenda' and aba = '_default' and editar = true
    )
    or exists (
      select 1 from public.permissoes_granular
      where user_id = auth.uid() and pagina = 'relatorios' and aba = 'frequencia_cultos' and editar = true
    );
$function$;

CREATE OR REPLACE FUNCTION public.pode_gerir_central_voluntarios()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    public.is_admin_prod()
    or exists (
      select 1 from public.permissoes_granular pg
      where pg.user_id = auth.uid()
        and pg.pagina  = 'central_voluntarios'
        and pg.aba     = '_default'
        and coalesce(pg.editar, false) = true
    );
$function$;

CREATE OR REPLACE FUNCTION public.minhas_salas_levinho()
 RETURNS TABLE(sala_id smallint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select lvs.sala_id
  from public.levinho_voluntarios_salas lvs
  join public.voluntarios v  on v.id         = lvs.voluntario_id
  join public.perfis      pf on pf.membro_id = v.membro_id
  where pf.id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.meus_ministerios_lideranca()
 RETURNS TABLE(ministerio_id uuid, funcao text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select ml.ministerio_id, ml.funcao
  from public.ministerio_lideres ml
  join public.voluntarios v  on v.id          = ml.voluntario_id
  join public.perfis      pf on pf.membro_id  = v.membro_id
  where pf.id = auth.uid();
$function$;


-- ═══════════════════════════════════════════════════════════════
-- TRIGGERS
-- ═══════════════════════════════════════════════════════════════
DROP TRIGGER IF EXISTS trg_alunos_updated_at ON public.alunos;
CREATE TRIGGER trg_alunos_updated_at BEFORE UPDATE ON public.alunos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_lms();

DROP TRIGGER IF EXISTS trg_anotacoes_updated_at ON public.anotacoes_lms;
CREATE TRIGGER trg_anotacoes_updated_at BEFORE UPDATE ON public.anotacoes_lms FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_lms();

DROP TRIGGER IF EXISTS trg_aulas_recalc_carga ON public.aulas_lms;
CREATE TRIGGER trg_aulas_recalc_carga AFTER INSERT OR DELETE OR UPDATE ON public.aulas_lms FOR EACH ROW EXECUTE FUNCTION public.recalc_curso_carga_horaria();

DROP TRIGGER IF EXISTS trg_comentarios_updated_at ON public.comentarios_lms;
CREATE TRIGGER trg_comentarios_updated_at BEFORE UPDATE ON public.comentarios_lms FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_financeiro_audit ON public.financeiro;
CREATE TRIGGER trg_financeiro_audit BEFORE INSERT OR UPDATE ON public.financeiro FOR EACH ROW EXECUTE FUNCTION public.financeiro_set_audit();

DROP TRIGGER IF EXISTS trg_financeiro_log ON public.financeiro;
CREATE TRIGGER trg_financeiro_log AFTER INSERT OR DELETE OR UPDATE ON public.financeiro FOR EACH ROW EXECUTE FUNCTION public.financeiro_write_log();

DROP TRIGGER IF EXISTS trg_pagamentos_lms_updated ON public.pagamentos_lms;
CREATE TRIGGER trg_pagamentos_lms_updated BEFORE UPDATE ON public.pagamentos_lms FOR EACH ROW EXECUTE FUNCTION public.pagamentos_lms_set_updated_at();

DROP TRIGGER IF EXISTS trg_pastoral_relatorios_touch ON public.pastoral_relatorios;
CREATE TRIGGER trg_pastoral_relatorios_touch BEFORE UPDATE ON public.pastoral_relatorios FOR EACH ROW EXECUTE FUNCTION public.tg_pastoral_relatorios_touch();

DROP TRIGGER IF EXISTS trg_progresso_updated_at ON public.progresso_aulas_lms;
CREATE TRIGGER trg_progresso_updated_at BEFORE UPDATE ON public.progresso_aulas_lms FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_lms();

DROP TRIGGER IF EXISTS trigger_atualizar_role_lider ON public.ministerio_voluntarios;
CREATE TRIGGER trigger_atualizar_role_lider AFTER INSERT OR UPDATE OF eh_lider ON public.ministerio_voluntarios FOR EACH ROW EXECUTE FUNCTION public.atualizar_role_lider();

-- Triggers em auth.users (podem falhar sem superuser; se falhar aqui, roda no Dashboard → Database → Triggers)
DO $$
BEGIN
  BEGIN
    DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
    CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Trigger on auth.users precisa de superuser — configure manualmente pelo Dashboard.';
  END;
  BEGIN
    DROP TRIGGER IF EXISTS on_auth_user_created_aluno ON auth.users;
    CREATE TRIGGER on_auth_user_created_aluno AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_aluno();
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Trigger on auth.users precisa de superuser — configure manualmente pelo Dashboard.';
  END;
END $$;


-- ═══════════════════════════════════════════════════════════════
-- RLS ENABLE
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE public.alunos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anotacoes_lms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aulas_lms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.celulas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificados_lms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comentarios_lms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comunicacao_leituras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comunicacao_mensagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comunicacao_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conselheiros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conteudos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cursos_lms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disponibilidade ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eventos_igreja ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.filhos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financeiro ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financeiro_categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financeiro_contas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financeiro_fechamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financeiro_formas_pgto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financeiro_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financeiro_recorrencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frequencia_cultos_criancas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inscricoes_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.levinho_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.levinho_materiais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.levinho_salas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.levinho_visitantes_criancas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.levinho_voluntarios_salas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materiais_lms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matriculas_lms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mesas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ministerio_avisos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ministerio_escala ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ministerio_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ministerio_lideres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ministerio_voluntarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ministerios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modulos_lms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagamentos_lms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paginas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pastoral_agendamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pastoral_disponibilidade ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pastoral_relatorios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos_oracao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfil_permissoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfil_permissoes_campos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissoes_granular ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlist_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlist_musicas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pregacao_playlist_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pregacao_playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.presencas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progresso_aulas_lms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voluntario_materiais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voluntario_materiais_entregas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voluntarios ENABLE ROW LEVEL SECURITY;

-- Nota: policies RLS ficam propositalmente para o final. Como as migrations
-- schema-*.sql seguintes recriam várias policies granularmente, criar aqui
-- policies "permissivas" pode causar conflito. As tabelas ficam com RLS
-- habilitado mas sem policies — as migrations subsequentes preenchem.
-- Se o objetivo for apenas rodar este arquivo (sem outras migrations),
-- copie as CREATE POLICY do schema exportado do produção.
