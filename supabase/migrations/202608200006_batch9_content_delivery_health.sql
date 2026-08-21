-- Batch 9: administrator-only aggregate health for published study delivery.
-- No student identity, progress, email, note, or answer history is returned.

begin;

create or replace function public.admin_content_delivery_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = 'insufficient_privilege';
  end if;

  return (
    with published as (
      select * from public.chapters where status = 'published'
    ),
    card_ids as (
      select card.value->>'id' as id
      from published p
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(p.pack->'cards') = 'array' then p.pack->'cards' else '[]'::jsonb end
      ) as card(value)
      where nullif(btrim(card.value->>'id'), '') is not null
    ),
    question_ids as (
      select question.value->>'id' as id
      from published p
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(p.pack->'mcqs') = 'array' then p.pack->'mcqs' else '[]'::jsonb end
      ) as question(value)
      where nullif(btrim(question.value->>'id'), '') is not null
      union all
      select question.value->>'id' as id
      from published p
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(p.pack->'emqs') = 'array' then p.pack->'emqs' else '[]'::jsonb end
      ) as question(value)
      where nullif(btrim(question.value->>'id'), '') is not null
    ),
    duplicate_cards as (
      select count(*)::integer as n from (select id from card_ids group by id having count(*) > 1) duplicates
    ),
    duplicate_questions as (
      select count(*)::integer as n from (select id from question_ids group by id having count(*) > 1) duplicates
    ),
    totals as (
      select
        count(*)::integer as chapters,
        coalesce(sum(case when jsonb_typeof(pack->'sections') = 'array' then jsonb_array_length(pack->'sections') else 0 end), 0)::integer as sections,
        coalesce(sum(case when jsonb_typeof(pack->'cards') = 'array' then jsonb_array_length(pack->'cards') else 0 end), 0)::integer as cards,
        coalesce(sum(case when jsonb_typeof(pack->'mcqs') = 'array' then jsonb_array_length(pack->'mcqs') else 0 end), 0)::integer as mcqs,
        coalesce(sum(case when jsonb_typeof(pack->'emqs') = 'array' then jsonb_array_length(pack->'emqs') else 0 end), 0)::integer as emqs,
        coalesce(sum(case when jsonb_typeof(pack->'mnemonics') = 'array' then jsonb_array_length(pack->'mnemonics') else 0 end), 0)::integer as mnemonics,
        (count(*) filter (where
          pack->>'id' is distinct from id
          or pack->>'schema' is distinct from 'foundation.study-module/v1'
          or nullif(btrim(pack->>'subject'), '') is null
          or nullif(btrim(pack->>'title'), '') is null
          or jsonb_typeof(pack->'sections') is distinct from 'array'
          or jsonb_typeof(pack->'cards') is distinct from 'array'
          or jsonb_typeof(pack->'mcqs') is distinct from 'array'
          or exists (
            select 1 from jsonb_array_elements(case when jsonb_typeof(pack->'sections') = 'array' then pack->'sections' else '[]'::jsonb end) item(value)
            where nullif(btrim(item.value->>'id'), '') is null
          )
          or exists (
            select 1 from jsonb_array_elements(case when jsonb_typeof(pack->'cards') = 'array' then pack->'cards' else '[]'::jsonb end) item(value)
            where nullif(btrim(item.value->>'id'), '') is null
          )
          or exists (
            select 1 from jsonb_array_elements(case when jsonb_typeof(pack->'mcqs') = 'array' then pack->'mcqs' else '[]'::jsonb end) item(value)
            where nullif(btrim(item.value->>'id'), '') is null
          )
        ))::integer as invalid_chapters,
        max(updated_at) as latest_published_at,
        md5(coalesce(string_agg(id || ':' || revision, '|' order by id), 'empty')) as fingerprint
      from published
    )
    select jsonb_build_object(
      'generatedAt', now(),
      'publishedChapters', totals.chapters,
      'sections', totals.sections,
      'cards', totals.cards,
      'mcqs', totals.mcqs,
      'emqs', totals.emqs,
      'mnemonics', totals.mnemonics,
      'invalidChapters', totals.invalid_chapters,
      'duplicateCardIds', duplicate_cards.n,
      'duplicateQuestionIds', duplicate_questions.n,
      'latestPublishedAt', totals.latest_published_at,
      'catalogFingerprint', totals.fingerprint
    )
    from totals, duplicate_cards, duplicate_questions
  );
end;
$$;

revoke all on function public.admin_content_delivery_health() from public, anon;
grant execute on function public.admin_content_delivery_health() to authenticated;

commit;
